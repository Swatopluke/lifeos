// Behavioural tests for the Sziget timelapse event model (js/timelapse.js).
//
// Same contract as js/timeline.js: buildTimelapse/countsAt are DOM-free, so
// this loads under plain node. The `test` gate runs the suite twice (TZ=UTC
// and TZ=America/Los_Angeles); every instant below is fixed and every bucket
// goes through the Budapest helpers, so the host zone must not change answers.
//
// The load-bearing property is the last test: whatever the timelapse counts at
// the end of the run has to equal the Sziget log's Overall chips, or the two
// views of the same festival would disagree.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimelapse, countsAt, bacAt, bacPolyline, dayText,
  decayFactor, decayFrom, ease,
  SERIES, DURATION_MS, HALF_LIFE_H, WIDMARK_R, GRAMS_PER_UNIT, DEFAULT_WEIGHT_KG,
  ZERO_ORDER_PER_H, FIRST_ORDER_BELOW,
} from '../js/timelapse.js';
import { overallTotals, FESTIVAL, UNICUM_VIEW } from '../js/timeline.js';

const START = FESTIVAL.startISO;
const END = FESTIVAL.endISO;

// Budapest wall clock -> UTC instant on the given August day (UTC+2).
const at = (d, hh, mm = 0) => new Date(Date.UTC(2026, 7, d, hh - 2, mm)).toISOString();

const beer   = (d, hh, mm = 0) => ({ kind: 'alcohol', subtype: 'dreher_gold', taken_at: at(d, hh, mm), alcohol_units: 1.97, kcal: 198 });
const coffee = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'coffee', taken_at: at(d, hh, mm), mg_caffeine: 95 });
const tea    = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'green_tea', taken_at: at(d, hh, mm), mg_caffeine: 30 });
const snus   = (d, hh, mm = 0) => ({ kind: 'snus', taken_at: at(d, hh, mm), quantity: 1, mg_nicotine: 9 });
const meal   = (d, hh, mm = 0) => ({ eaten_at: at(d, hh, mm), kcal: 600, meal_type: 'dinner' });

const keys = ev => ev.map(e => e.key);

test('the run is 10 seconds and covers the five requested series', () => {
  assert.equal(DURATION_MS, 10000);
  assert.deepEqual(SERIES.map(s => s.key), ['beer', 'unicum', 'snus', 'coffee', 'meal']);
});

test('one event per logged row, in chronological order', () => {
  const { events } = buildTimelapse(
    [meal(11, 13)],
    [snus(11, 9), beer(11, 20), coffee(11, 11)],
    START, END);
  assert.deepEqual(keys(events), ['snus', 'coffee', 'meal', 'beer']);
});

test('two beers in the same minute become one beer + one unicum', () => {
  const { events, totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 51)], START, END);
  assert.deepEqual(keys(events), ['unicum', 'beer']);
  assert.equal(totals.beer, 1);
  assert.equal(totals.unicum, 1);
});

test('three in the same minute are one unicum plus the rest as beer', () => {
  const { totals } = buildTimelapse([], [beer(16, 0, 55), beer(16, 0, 55), beer(16, 0, 55)], START, END);
  assert.equal(totals.beer, 2);
  assert.equal(totals.unicum, 1);
});

test('the pair rule is per day+minute, not per minute-of-day', () => {
  const { totals } = buildTimelapse([], [beer(11, 20, 51), beer(12, 20, 51)], START, END);
  assert.equal(totals.beer, 2, 'same clock minute on different days is not a pair');
  assert.equal(totals.unicum, 0);
});

test('beers a minute apart stay two separate beers', () => {
  const { totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 52)], START, END);
  assert.equal(totals.beer, 2);
  assert.equal(totals.unicum, 0);
});

test('rows outside the half-open window are ignored', () => {
  const { events } = buildTimelapse(
    [meal(16, 6)],                          // end is exclusive -> out
    [beer(10, 5, 59), beer(10, 6, 0)],      // 05:59 out, 06:00 in
    START, END);
  assert.deepEqual(keys(events), ['beer']);
});

test('snus carries its quantity, green tea and matcha are not plotted', () => {
  const { totals } = buildTimelapse([], [
    { kind: 'snus', taken_at: at(11, 9), quantity: 2 },
    tea(11, 10),
    { kind: 'caffeine', subtype: 'matcha', taken_at: at(11, 12), mg_caffeine: 70 },
  ], START, END);
  assert.equal(totals.snus, 2, 'quantity 2 counts as two');
  assert.equal(totals.coffee, 0, 'only subtype=coffee feeds the coffee series');
});

test('countsAt accumulates up to the playhead and resumes from an index', () => {
  const { events, startMs } = buildTimelapse([], [beer(11, 10), beer(11, 12), beer(11, 14)], START, END);
  const HOUR = 3600000;
  const noon = startMs + 5 * HOUR;                  // 11:00 Budapest on Aug 10

  const first = countsAt(events, Date.parse(at(11, 10)));
  assert.equal(first.counts.beer, 1);
  assert.equal(first.index, 1);

  // resuming from the previous index must match a scan from scratch
  const resumed = countsAt(events, Date.parse(at(11, 14)), first.index, first.counts);
  assert.equal(resumed.counts.beer, 3);
  assert.deepEqual(countsAt(events, Date.parse(at(11, 14))).counts.beer, 3);
  assert.equal(countsAt(events, noon).counts.beer, 0, 'nothing logged yet at 11:00 Aug 10');
});

test('final counters match the Sziget log Overall chips', () => {
  const meals = [meal(11, 13), meal(12, 14), meal(15, 19)];
  const intake = [
    beer(11, 20, 51), beer(11, 20, 51),   // pair -> beer + unicum
    beer(12, 4, 21), beer(12, 4, 21),     // pair -> beer + unicum
    beer(16, 0, 55), beer(16, 0, 55), beer(16, 0, 55), // triple -> 2 beer + unicum
    beer(13, 18), beer(14, 22, 30),
    snus(11, 9), snus(11, 10), snus(13, 23),
    coffee(11, 11), coffee(15, 16),
    tea(12, 9),
  ];
  const { totals } = buildTimelapse(meals, intake, START, END);
  const overall = overallTotals(meals, intake, START, END);

  assert.equal(totals.beer, overall.beers, 'beer');
  assert.equal(totals.unicum, overall.unicum, 'unicum');
  assert.equal(totals.snus, overall.snus, 'snus');
  assert.equal(totals.coffee, overall.coffees, 'coffee');
  assert.equal(totals.meal, overall.mealsN, 'meals');
  // 9 beer rows in 3 same-minute groups (2 + 2 + 3): each group gives up one
  // beer to a unicum, so 9 - 3 = 6 beers and 3 unicums.
  assert.equal(totals.beer, 6);
  assert.equal(totals.unicum, 3);
});

/* ---- blood alcohol ---------------------------------------------------- */

const HOUR = 3600000;
const W = 100;                                   // round number keeps the sums readable

test('one beer raises BAC by the Widmark amount', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  // 1.97u -> 19.7g into 100kg: 19.7 / (100000 * 0.68) * 100
  const expected = (1.97 * GRAMS_PER_UNIT) / (W * 1000 * WIDMARK_R) * 100;
  assert.ok(Math.abs(bacAt(events, t, W) - expected) < 1e-9);
  assert.ok(expected > 0.02 && expected < 0.04, 'a 5dl beer lands around 0.03%');
});

test('above the knee BAC falls in a straight line at 0.015%/h', () => {
  const { events } = buildTimelapse([], [beer(11, 20), beer(11, 20, 1), beer(11, 20, 2)], START, END);
  const t = Date.parse(at(11, 20, 2));
  const peak = bacAt(events, t, W);
  assert.ok(peak > FIRST_ORDER_BELOW * 3, 'three beers puts us well above the knee');
  for (const h of [1, 2, 3]) {
    assert.ok(Math.abs(bacAt(events, t + h * HOUR, W) - (peak - ZERO_ORDER_PER_H * h)) < 1e-12,
      'flat burn after ' + h + 'h');
  }
});

test('below the knee it turns first-order and halves every 1.5h', () => {
  assert.equal(HALF_LIFE_H, 1.5, 'the t-half the Stimulant card already uses');
  const below = FIRST_ORDER_BELOW / 2;
  assert.ok(Math.abs(decayFrom(below, HALF_LIFE_H * HOUR) - below / 2) < 1e-15);
  assert.ok(Math.abs(decayFrom(below, 2 * HALF_LIFE_H * HOUR) - below / 4) < 1e-15);
});

test('the two regimes join continuously at the knee', () => {
  const from = 0.08;
  const toKnee = (from - FIRST_ORDER_BELOW) / ZERO_ORDER_PER_H * HOUR;
  assert.ok(Math.abs(decayFrom(from, toKnee) - FIRST_ORDER_BELOW) < 1e-12, 'lands exactly on the knee');
  const lo = decayFrom(from, toKnee - 1000), hi = decayFrom(from, toKnee + 1000);
  assert.ok(lo > FIRST_ORDER_BELOW && hi < FIRST_ORDER_BELOW, 'crosses it');
  assert.ok(lo - hi < 1e-4, 'without a step change');
});

test('decay never goes negative, however long the gap', () => {
  for (const bac of [0.5, 0.08, 0.02, 0.001]) {
    for (const h of [0, 1, 12, 100, 10000]) {
      const v = decayFrom(bac, h * HOUR);
      assert.ok(v >= 0, `${bac} after ${h}h is ${v}`);
      assert.ok(v <= bac, 'and never rises');
    }
  }
  assert.equal(decayFrom(0, HOUR), 0);
});

test('decayFactor is a pure halving', () => {
  assert.equal(decayFactor(0), 1);
  assert.ok(Math.abs(decayFactor(HALF_LIFE_H * HOUR) - 0.5) < 1e-12);
  assert.ok(Math.abs(decayFactor(3 * HALF_LIFE_H * HOUR) - 0.125) < 1e-12);
});

test('time to sober matches the drink-an-hour rule, not half of it', () => {
  let h = 0; while (decayFrom(0.15, h * HOUR) > FIRST_ORDER_BELOW) h += 0.01;
  assert.ok(h > 8 && h < 9.5, 'about 8.7h down to the knee, got ' + h.toFixed(2));
});

test('BAC falls monotonically while nothing is drunk', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  let prev = Infinity;
  for (let h = 0; h <= 12; h++) {
    const v = bacAt(events, t + h * HOUR, W);
    assert.ok(v < prev, 'strictly falling at hour ' + h);
    prev = v;
  }
});

test('a long dry stretch carries essentially nothing over', () => {
  // three days apart is ~48 half-lives, so the second peak is just one drink
  const { events } = buildTimelapse([], [beer(10, 12), beer(13, 12)], START, END);
  const first = bacAt(events, Date.parse(at(10, 12)), W);
  const second = bacAt(events, Date.parse(at(13, 12)), W);
  assert.ok(second >= first, 'never less than a fresh drink');
  assert.ok(second - first < 1e-9, 'and no meaningful carry-over');
});

test('a collapsed pair contributes one beer plus one unicum of ethanol', () => {
  const { events, totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 51)], START, END);
  assert.equal(totals.beer, 1);
  assert.equal(totals.unicum, 1);
  const units = events.reduce((a, e) => a + e.units, 0);
  assert.ok(Math.abs(units - (1.97 + UNICUM_VIEW.units)) < 1e-9,
    'the second tap counts as a shot, not a second pint');
});

test('alcohol that is neither beer nor a pair still moves BAC', () => {
  const rows = [{ kind: 'alcohol', subtype: 'palinka', taken_at: at(12, 21), alcohol_units: 2 }];
  const { events, totals } = buildTimelapse([], rows, START, END);
  assert.equal(totals.beer, 0, 'it is not a beer');
  assert.equal(totals.unicum, 0, 'and not a collapsed pair, so no unicum chip');
  assert.ok(bacAt(events, Date.parse(at(12, 21)), W) > 0, 'but it is still alcohol');
});

test('a nondrinking window reads zero throughout', () => {
  const { events } = buildTimelapse([], [snus(11, 9), coffee(11, 11)], START, END);
  assert.equal(bacAt(events, Date.parse(at(11, 12)), W), 0);
  assert.deepEqual(bacPolyline(events, Date.parse(at(11, 12)), W), []);
});

test('the curve carries a vertex at every drink', () => {
  const { events } = buildTimelapse([], [beer(11, 20), beer(11, 21)], START, END);
  const t1 = Date.parse(at(11, 20)), t2 = Date.parse(at(11, 21));
  const pts = bacPolyline(events, Date.parse(at(11, 22)), W);
  assert.ok(pts.filter(q => q.ms === t1).length >= 2, 'a jump at the first drink');
  assert.ok(pts.filter(q => q.ms === t2).length === 2, 'before and after the second');
  assert.ok(pts.every((q, i) => i === 0 || q.ms >= pts[i - 1].ms), 'vertices run forward');
  assert.ok(pts.every(q => q.bac >= 0), 'never dips below the floor');
});

test('the tail is sampled, so the decay draws as a curve not a chord', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const end = Date.parse(at(11, 23));
  const coarse = bacPolyline(events, end, W, 60 * 60000);   // hourly
  const fine   = bacPolyline(events, end, W, 5 * 60000);    // 5-minutely
  assert.ok(fine.length > coarse.length, 'a finer step yields more vertices');
  // Sampled points must sit on the true curve, not on a chord across it. Only
  // the tail is checked: each drink instant carries two vertices, the value
  // before the drink and after, and bacAt reports the latter.
  const t1 = Date.parse(at(11, 20));
  const tail = fine.filter(q => q.ms > t1);
  assert.ok(tail.length > 20, 'the tail really is sampled');
  for (const q of tail) assert.ok(Math.abs(q.bac - bacAt(events, q.ms, W)) < 1e-12, 'off-curve at ' + q.ms);
});

test('the polyline tail agrees with bacAt', () => {
  const { events } = buildTimelapse([], [beer(11, 20), beer(12, 4, 21), beer(12, 4, 21)], START, END);
  for (const t of [at(11, 21), at(12, 5), at(13, 12), at(15, 20)]) {
    const ms = Date.parse(t);
    const pts = bacPolyline(events, ms, W);
    assert.ok(Math.abs(pts[pts.length - 1].bac - bacAt(events, ms, W)) < 1e-12, 'at ' + t);
  }
});

test('heavier drinker, lower peak', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  assert.ok(bacAt(events, t, 120) < bacAt(events, t, 80));
});

test('weight falls back to the last recorded figure when none is passed', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  assert.equal(bacAt(events, t), bacAt(events, t, DEFAULT_WEIGHT_KG));
  assert.equal(DEFAULT_WEIGHT_KG, 95);
});

test('the header day is the Budapest day, whatever the host zone', () => {
  // 00:30 Budapest on Aug 13 is still Aug 12 in UTC — the header must say 13.
  assert.match(dayText(Date.parse(at(13, 0, 30))), /13 Aug/);
  assert.match(dayText(Date.parse(at(10, 6))), /10 Aug/);
});

test('ease closes the gap without overshooting, whatever the frame rate', () => {
  assert.equal(ease(10, 10, 16), 10, 'a met target does not drift');
  const step = ease(0, 100, 16);
  assert.ok(step > 0 && step < 100, 'moves toward the target, never past it');
  // 60fps and 120fps must land in the same place after the same wall time
  let a = 0; for (let i = 0; i < 60; i++) a = ease(a, 100, 1000 / 60);
  let b = 0; for (let i = 0; i < 120; i++) b = ease(b, 100, 1000 / 120);
  assert.ok(Math.abs(a - b) < 0.5, 'frame-rate independent');
  assert.ok(a > 99, 'and settles within a second');
});
