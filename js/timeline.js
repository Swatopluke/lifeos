// Pure display logic for the "Sziget log" section on the Overview tab.
//
// No DOM access and no Supabase client at module scope, so node tests can
// import it directly (same rule as js/utils.js). All date bucketing goes
// through the utils.js Budapest helpers — never local-time accessors.
import { budDay, budTime } from './utils.js';

// The festival window the section covers. Half-open [startISO, endISO).
// 06:00 Budapest (CEST, UTC+2) on Aug 10 and Aug 16, 2026.
export const FESTIVAL = {
  name: 'Sziget 2026',
  startISO: '2026-08-10T04:00:00.000Z',
  endISO: '2026-08-16T04:00:00.000Z',
};

const inWindow = (ts, startISO, endISO) => {
  const t = new Date(ts).getTime();
  if (isNaN(t)) return false;
  return t >= Date.parse(startISO) && t < Date.parse(endISO);
};

// Display-only rule: two beers logged at the same time count as one unicum
// and one beer (the user didn't have time to log them separately). DB rows
// stay untouched — this only changes how the section renders them.
// Unicum 0.5 dl @ 40% ABV: 50/1000*40*7.89/10 = 1.58 units, 15.8g ethanol
// × 7 kcal/g ≈ 110 kcal.
export const UNICUM_VIEW = { label: 'Unicum', icon: '🥃', units: 1.58, kcal: 110 };

// Subtypes that count as "beer" for the pair rule.
const BEER_SUBTYPES = new Set(['dreher_gold']);

export const isBeer = r => !!(r && r.kind === 'alcohol' && BEER_SUBTYPES.has(r.subtype));

// A same-time key is day + Budapest minute: over a multi-day window two
// beers at 19:05 on different days must NOT collapse into one pair.
// Exported so the timelapse applies the identical rule instead of its own copy.
export const minuteKey = r => budDay(r.taken_at) + ' ' + budTime(r.taken_at);

function itemFor(r) {
  const base = { t: r.taken_at, time: budTime(r.taken_at), day: budDay(r.taken_at) };
  if (r.kind === 'snus') {
    return { ...base, icon: '⬤', label: 'Snus', dose: (+r.mg_nicotine || 0) + 'mg nic' };
  }
  if (r.kind === 'caffeine') {
    const sub = r.subtype === 'green_tea' ? 'Green tea'
      : r.subtype === 'matcha' ? 'Matcha'
      : r.subtype === 'coffee' ? 'Coffee' : 'Caffeine';
    const icon = r.subtype === 'green_tea' ? '🍵' : r.subtype === 'matcha' ? '🍃' : '☕';
    return { ...base, icon, label: sub, dose: (+r.mg_caffeine || 0) + 'mg caf' };
  }
  if (r.kind === 'alcohol') {
    const dose = (+r.alcohol_units || 0) + 'u · ' + (+r.kcal || 0) + ' kcal';
    if (isBeer(r)) return { ...base, icon: '🍺', label: 'Beer', dose };
    return { ...base, icon: UNICUM_VIEW.icon, label: UNICUM_VIEW.label, dose };
  }
  return null;
}

// One timeline row for a minute with >= 2 beers: the first pair becomes
// "beer + unicum", any further beers in the same minute stay beers.
function pairItem(day, minute, rows) {
  const n = rows.length;
  const units = rows.reduce((a, r) => a + (+r.alcohol_units || 0), 0) + UNICUM_VIEW.units;
  const kcal  = rows.reduce((a, r) => a + (+r.kcal || 0), 0) + UNICUM_VIEW.kcal;
  return {
    t: rows[0].taken_at,
    time: minute,
    day,
    icon: '🍺🥃',
    label: n === 2 ? 'Beer + Unicum' : `Beer ×${n - 1} + Unicum`,
    dose: units.toFixed(2) + 'u · ' + Math.round(kcal) + ' kcal',
  };
}

/**
 * Everything the Sziget log cards need, in one pass over the window's rows:
 *  - items: chronological timeline entries (meals + intake merged), same-
 *    minute beer pairs collapsed into a single "beer + unicum" row; every
 *    item carries `day` (Budapest date) for day-grouped rendering
 *  - overall: window totals with the pair rule applied to the beer count
 * `meals`/`intake` are the raw Supabase row arrays; rows outside the
 * half-open [startISO, endISO) instant window are ignored.
 */
export function buildLog(meals, intake, startISO, endISO) {
  const items = [];
  for (const m of meals || []) {
    if (!inWindow(m.eaten_at, startISO, endISO)) continue;
    items.push({
      t: m.eaten_at, time: budTime(m.eaten_at), day: budDay(m.eaten_at), icon: '🍽',
      label: m.meal_type || 'meal',
      dose: (+m.kcal || 0) + ' kcal' + (m.description ? ' · ' + m.description : ''),
    });
  }
  const beerByMin = new Map();
  for (const r of intake || []) {
    if (!inWindow(r.taken_at, startISO, endISO)) continue;
    if (isBeer(r)) {
      const k = minuteKey(r);
      if (!beerByMin.has(k)) beerByMin.set(k, []);
      beerByMin.get(k).push(r);
    } else {
      const it = itemFor(r);
      if (it) items.push(it);
    }
  }
  for (const [key, rows] of beerByMin) {
    const [day, minute] = key.split(' ');
    items.push(rows.length >= 2 ? pairItem(day, minute, rows) : itemFor(rows[0]));
  }
  items.sort((a, b) => new Date(a.t) - new Date(b.t));
  return { items, overall: overallTotals(meals, intake, startISO, endISO) };
}

/**
 * Window totals for the Overall card. `beers` and `unicum` apply the pair
 * rule: every day+minute that holds >= 2 beers contributes one unicum and
 * (beers - 1) beers. Calories include food AND drink rows (beer kcal), the
 * same convention as the rest of the app.
 */
export function overallTotals(meals, intake, startISO, endISO) {
  let coffees = 0, greenTeas = 0, matchas = 0, snus = 0,
      beers = 0, unicum = 0, mealsN = 0, kcal = 0, units = 0, caffeine = 0;
  for (const m of meals || []) {
    if (!inWindow(m.eaten_at, startISO, endISO)) continue;
    mealsN++;
    kcal += +m.kcal || 0;
  }
  const beerMin = new Map();
  for (const r of intake || []) {
    if (!inWindow(r.taken_at, startISO, endISO)) continue;
    kcal += +r.kcal || 0;
    if (r.kind === 'snus') snus += +r.quantity || 1;
    else if (r.kind === 'caffeine') {
      caffeine += +r.mg_caffeine || 0;
      if (r.subtype === 'coffee') coffees++;
      else if (r.subtype === 'green_tea') greenTeas++;
      else if (r.subtype === 'matcha') matchas++;
    } else if (isBeer(r)) {
      beers++;
      units += +r.alcohol_units || 0;
      const k = minuteKey(r);
      beerMin.set(k, (beerMin.get(k) || 0) + 1);
    } else if (r.kind === 'alcohol') {
      units += +r.alcohol_units || 0;
    }
  }
  for (const n of beerMin.values()) {
    if (n >= 2) { unicum++; beers--; }
  }
  return { coffees, greenTeas, matchas, snus, beers, unicum, mealsN, kcal, units, caffeine };
}
