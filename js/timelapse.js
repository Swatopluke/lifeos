// Full-screen 10-second timelapse of the Sziget window: five cumulative
// series (beer · unicum · snus · coffee · meals) drawn on an expanding pair
// of axes, over a live blood-alcohol panel. The chart takes two thirds of the
// stage, the BAC panel one third.
//
// buildTimelapse/bacAt/bacPolyline/countsAt are pure and DOM-free so node
// tests can import them, matching the js/timeline.js rule. Counting goes
// through the same minuteKey/isBeer pair rule the Sziget log uses, so the
// end-of-run counters always agree with the Overall chips — tests assert that
// against overallTotals().
//
// Drawn on raw 2D canvases rather than through charts.js/drawChart: this is a
// per-frame redraw with axes that rescale on every tick, not a card chart, and
// Chart.js has no useful role in it.
import { budDay, budTime } from './utils.js';
import { isBeer, minuteKey, UNICUM_VIEW, FESTIVAL } from './timeline.js';

export const DURATION_MS = 10000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

// Order here is the order of the counter chips and the legend. Snus takes
// --text rather than --snus: beer and snus are the two tallest lines and the
// amber --weight/--snus pair is nearly indistinguishable once they overlap.
export const SERIES = [
  { key: 'beer',   label: 'Beer',   icon: '🍺', css: '--weight' },
  { key: 'unicum', label: 'Unicum', icon: '🥃', css: '--booze'  },
  { key: 'snus',   label: 'Snus',   icon: '⬤',  css: '--text'   },
  { key: 'coffee', label: 'Coffee', icon: '☕', css: '--caf'    },
  { key: 'meal',   label: 'Meals',  icon: '🍽', css: '--food'   },
];

/* ---- blood alcohol ---------------------------------------------------
   Widmark, stepped between events so the curve floors at zero instead of
   going negative across a dry stretch and swallowing the next drink.
     BAC% = grams ethanol / (body grams × r) × 100, less 0.015%/h burned off.
   Units are the Hungarian 10g standard, the same one quicklog.js uses to
   derive DREHER.units, so grams = units × 10.
---------------------------------------------------------------------- */
export const WIDMARK_R = 0.68;        // body-water constant, adult male
export const BURN_PER_H = 0.015;      // %BAC eliminated per hour
export const GRAMS_PER_UNIT = 10;
// Last weight on record in body_metrics. The dashboard cache only reaches
// back 60 days, so it usually has no measurement to hand and lands here.
export const DEFAULT_WEIGHT_KG = 95;
// 5dl Dreher Gold @ 5%, matching quicklog.js DREHER — used only when a row
// somehow arrives without alcohol_units.
const BEER_UNITS_FALLBACK = 1.97;

const bacFor = (units, weightKg) =>
  (units * GRAMS_PER_UNIT) / (weightKg * 1000 * WIDMARK_R) * 100;

/**
 * Flatten the festival window into a chronological event list plus totals.
 *
 * The same-minute beer rule matches overallTotals() exactly: a Budapest
 * day+minute holding >= 2 beers yields one unicum and (n - 1) beers, so two
 * beers logged together read as one beer and one unicum. Rows outside the
 * half-open [startISO, endISO) window are ignored.
 *
 * Events carry `units` so the BAC panel can integrate them. A collapsed pair
 * contributes one beer plus one unicum of ethanol rather than two beers,
 * which is the whole point of the rule — the second tap was a shot, not a
 * second pint. Alcohol that is neither beer nor a collapsed pair rides along
 * as a key the counters ignore, so it still moves BAC without inventing a
 * sixth series.
 *
 * Returns { events: [{ ms, key, n, units }] sorted by ms, totals, startMs, endMs }.
 */
export function buildTimelapse(meals, intake, startISO, endISO) {
  const startMs = Date.parse(startISO), endMs = Date.parse(endISO);
  const events = [];
  const push = (ts, key, n = 1, units = 0) => {
    const ms = new Date(ts).getTime();
    if (isNaN(ms) || ms < startMs || ms >= endMs) return;
    events.push({ ms, key, n, units });
  };

  for (const m of meals || []) push(m.eaten_at, 'meal');

  const beerByMin = new Map();
  for (const r of intake || []) {
    const ms = new Date(r.taken_at).getTime();
    if (isNaN(ms) || ms < startMs || ms >= endMs) continue;
    if (isBeer(r)) {
      const k = minuteKey(r);
      if (!beerByMin.has(k)) beerByMin.set(k, []);
      beerByMin.get(k).push(r);
    } else if (r.kind === 'snus') {
      push(r.taken_at, 'snus', +r.quantity || 1);
    } else if (r.kind === 'caffeine' && r.subtype === 'coffee') {
      push(r.taken_at, 'coffee');
    } else if (r.kind === 'alcohol') {
      push(r.taken_at, 'other', 0, +r.alcohol_units || 0);
    }
  }
  const beerUnits = r => +r.alcohol_units || BEER_UNITS_FALLBACK;
  for (const rows of beerByMin.values()) {
    if (rows.length >= 2) {
      rows.sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));
      push(rows[0].taken_at, 'unicum', 1, UNICUM_VIEW.units);
      for (let i = 1; i < rows.length; i++) push(rows[i].taken_at, 'beer', 1, beerUnits(rows[i]));
    } else {
      push(rows[0].taken_at, 'beer', 1, beerUnits(rows[0]));
    }
  }

  events.sort((a, b) => a.ms - b.ms);
  const totals = {};
  for (const s of SERIES) totals[s.key] = 0;
  for (const e of events) if (e.key in totals) totals[e.key] += e.n;
  return { events, totals, startMs, endMs };
}

/**
 * Cumulative value of each series at time `ms`, plus how many events have been
 * consumed. Events are sorted, so callers stepping forward can pass the last
 * index as `from` instead of rescanning from zero.
 */
export function countsAt(events, ms, from = 0, running = null) {
  const counts = running || Object.fromEntries(SERIES.map(s => [s.key, 0]));
  let i = from;
  while (i < events.length && events[i].ms <= ms) {
    if (events[i].key in counts) counts[events[i].key] += events[i].n;
    i++;
  }
  return { counts, index: i };
}

/**
 * The BAC curve up to `ms` as {ms, bac} vertices. It is piecewise linear —
 * a vertical jump at each drink, a constant-slope burn-off between — so the
 * exact shape needs only these points, no sampling. Zero crossings are
 * emitted so the curve rests on the floor instead of cutting through it.
 */
export function bacPolyline(events, ms, weightKg = DEFAULT_WEIGHT_KG) {
  const W = Math.max(30, +weightKg || DEFAULT_WEIGHT_KG);
  const pts = [];
  let bac = 0, last = null;
  for (const e of events) {
    if (!e.units || e.ms > ms) { if (e.ms > ms) break; continue; }
    if (last == null) {
      pts.push({ ms: e.ms, bac: 0 });
    } else {
      const dropped = bac - BURN_PER_H * (e.ms - last) / HOUR_MS;
      if (bac > 0 && dropped <= 0) pts.push({ ms: Math.min(last + (bac / BURN_PER_H) * HOUR_MS, e.ms), bac: 0 });
      bac = Math.max(0, dropped);
      pts.push({ ms: e.ms, bac });
    }
    bac += bacFor(e.units, W);
    pts.push({ ms: e.ms, bac });
    last = e.ms;
  }
  if (last != null) {
    const dropped = bac - BURN_PER_H * (ms - last) / HOUR_MS;
    if (bac > 0 && dropped <= 0) pts.push({ ms: Math.min(last + (bac / BURN_PER_H) * HOUR_MS, ms), bac: 0 });
    pts.push({ ms, bac: Math.max(0, dropped) });
  }
  return pts;
}

/** Blood alcohol at `ms`, in % (g/100ml). */
export function bacAt(events, ms, weightKg = DEFAULT_WEIGHT_KG) {
  const pts = bacPolyline(events, ms, weightKg);
  return pts.length ? pts[pts.length - 1].bac : 0;
}

/* ================================================================
   RENDERER — everything below touches the DOM
   ================================================================ */

const PAD = { top: 20, right: 74, bottom: 34, left: 52 };
const BAC_PAD = { top: 16, right: 74, bottom: 26, left: 52 };
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Prominent Budapest date for the header — the day you are watching.
const budDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Budapest', weekday: 'short', day: 'numeric', month: 'short',
});
export const dayText = ms => budDateFmt.format(new Date(ms));

// Step-line points for one series: one vertex per event, so the line only
// rises at the instant something was logged.
function seriesPoints(events, key, upToIdx) {
  const pts = [];
  let n = 0;
  for (let i = 0; i < upToIdx; i++) {
    if (events[i].key !== key) continue;
    n += events[i].n;
    pts.push({ ms: events[i].ms, n });
  }
  return pts;
}

function axes(ctx, w, h, pad, colors) {
  const plotW = w - pad.left - pad.right, plotH = h - pad.top - pad.bottom;
  ctx.strokeStyle = colors.dim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(w - pad.right, pad.top + plotH);
  ctx.stroke();
  return { plotW, plotH };
}

// Budapest midnights across the visible span, shared by both panels so the
// two line up vertically.
function dayTicks(ctx, X, startMs, xMax, top, plotH, colors, label) {
  if ((xMax - startMs) / DAY_MS <= 0.9) return;   // below a day the labels crowd
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '11px "JetBrains Mono", monospace';
  for (let t = Math.ceil(startMs / DAY_MS) * DAY_MS; t <= xMax; t += DAY_MS) {
    const x = X(t);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
    if (label) {
      ctx.fillStyle = colors.faint;
      ctx.fillText(budDay(t).slice(8) + '/' + budDay(t).slice(5, 7), x, top + plotH + 7);
    }
  }
}

function drawMain(ctx, w, h, state) {
  const { events, startMs, playMs, xMax, idx, counts, colors } = state;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  const { plotW, plotH } = { plotW: w - PAD.left - PAD.right, plotH: h - PAD.top - PAD.bottom };
  if (plotW <= 0 || plotH <= 0) return;

  // Expanding domains: x from the window start to the playhead, y from 0 to
  // the tallest series so far, both stretched to fill the panel.
  const yMax = Math.max(2, Math.max(...SERIES.map(s => counts[s.key])) * 1.08);
  const X = ms => PAD.left + ((ms - startMs) / (xMax - startMs)) * plotW;
  const Y = n => PAD.top + plotH - (n / yMax) * plotH;

  const yStep = Math.max(1, Math.ceil(yMax / 5 / 5) * 5);
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= yMax; v += yStep) {
    const y = Y(v);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(w - PAD.right, y); ctx.stroke();
    ctx.fillStyle = colors.faint; ctx.textAlign = 'right';
    ctx.fillText(String(v), PAD.left - 10, y);
  }
  dayTicks(ctx, X, startMs, xMax, PAD.top, plotH, colors, true);
  axes(ctx, w, h, PAD, colors);

  const heads = [];
  for (const s of SERIES) {
    const pts = seriesPoints(events, s.key, idx);
    if (!pts.length) continue;
    ctx.strokeStyle = colors[s.key];
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(X(startMs), Y(0));
    let prevN = 0;
    for (const p of pts) {                 // step: hold, then rise
      ctx.lineTo(X(p.ms), Y(prevN));
      ctx.lineTo(X(p.ms), Y(p.n));
      prevN = p.n;
    }
    ctx.lineTo(X(playMs), Y(prevN));
    ctx.stroke();
    const hx = X(playMs), hy = Y(prevN);
    ctx.fillStyle = colors[s.key];
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
    heads.push({ key: s.key, icon: s.icon, n: prevN, x: hx, y: hy });
  }

  // Head labels, nudged apart: low-count series sit on top of each other
  // early on and the numbers become unreadable.
  const GAP = 16;
  heads.sort((a, b) => a.y - b.y);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].y - heads[i - 1].y < GAP) heads[i].y = heads[i - 1].y + GAP;
  }
  const overflow = heads.length ? heads[heads.length - 1].y - (PAD.top + plotH) : 0;
  if (overflow > 0) for (const hd of heads) hd.y -= overflow;
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const hd of heads) {
    ctx.fillStyle = colors[hd.key];
    ctx.fillText(hd.icon + ' ' + hd.n, hd.x + 9, hd.y);
  }
}

function drawBac(ctx, w, h, state) {
  const { startMs, playMs, xMax, bacPts, bacPeak, colors } = state;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  const plotW = w - BAC_PAD.left - BAC_PAD.right, plotH = h - BAC_PAD.top - BAC_PAD.bottom;
  if (plotW <= 0 || plotH <= 0) return;

  const yMax = Math.max(0.05, bacPeak * 1.15);
  const X = ms => BAC_PAD.left + ((ms - startMs) / (xMax - startMs)) * plotW;
  const Y = v => BAC_PAD.top + plotH - (v / yMax) * plotH;

  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 2; i++) {
    const v = (yMax / 2) * i, y = Y(v);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(BAC_PAD.left, y); ctx.lineTo(w - BAC_PAD.right, y); ctx.stroke();
    ctx.fillStyle = colors.faint; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(2), BAC_PAD.left - 10, y);
  }
  dayTicks(ctx, X, startMs, xMax, BAC_PAD.top, plotH, colors, false);
  axes(ctx, w, h, BAC_PAD, colors);

  if (bacPts.length) {
    ctx.beginPath();
    ctx.moveTo(X(bacPts[0].ms), Y(0));
    for (const p of bacPts) ctx.lineTo(X(p.ms), Y(p.bac));
    ctx.lineTo(X(bacPts[bacPts.length - 1].ms), Y(0));
    ctx.closePath();
    ctx.fillStyle = colors.bacFill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(X(bacPts[0].ms), Y(bacPts[0].bac));
    for (const p of bacPts) ctx.lineTo(X(p.ms), Y(p.bac));
    ctx.strokeStyle = colors.booze; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.stroke();

    const cur = bacPts[bacPts.length - 1];
    const hx = X(playMs), hy = Y(cur.bac);
    ctx.fillStyle = colors.booze;
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(cur.bac.toFixed(3) + '%', hx + 9, hy);
  }
}

/**
 * Open the overlay and play the window once. Returns immediately; the run
 * tears itself down on close. Safe to call again after it closes.
 * `opts.weightKg` calibrates the BAC panel.
 */
export function startTimelapse(meals, intake, opts = {}) {
  const wrap = document.getElementById('tlapse');
  if (!wrap || wrap.dataset.running) return;

  const startISO = opts.startISO || FESTIVAL.startISO;
  const endISO = opts.endISO || FESTIVAL.endISO;
  const weightKg = Math.max(30, +opts.weightKg || DEFAULT_WEIGHT_KG);

  const { events, startMs, endMs } = buildTimelapse(meals, intake, startISO, endISO);
  document.getElementById('tlapseEmpty').classList.toggle('hidden', events.length > 0);

  wrap.dataset.running = '1';
  wrap.classList.remove('hidden');

  const mainCv = document.getElementById('tlapseCanvas');
  const bacCv = document.getElementById('tlapseBacCanvas');
  const mainCtx = mainCv.getContext('2d'), bacCtx = bacCv.getContext('2d');
  const colors = {
    bg: cssVar('--bg'), border: cssVar('--border'), faint: cssVar('--faint'),
    dim: cssVar('--dim'), booze: cssVar('--booze'), bacFill: cssVar('--booze') + '22',
  };
  for (const s of SERIES) colors[s.key] = cssVar(s.css);

  document.getElementById('tlapseCounts').innerHTML = SERIES.map(s =>
    `<div class="tlp-chip"><span class="tlp-ico">${s.icon}</span>
       <b id="tlp-n-${s.key}" style="color:${colors[s.key]}">0</b>
       <span class="tlp-lab">${s.label}</span></div>`).join('');
  const cntEls = Object.fromEntries(SERIES.map(s => [s.key, document.getElementById('tlp-n-' + s.key)]));
  const dayEl = document.getElementById('tlapseDay');
  const clockEl = document.getElementById('tlapseClock');
  const barEl = document.getElementById('tlapseBar');
  const bacEl = document.getElementById('tlapseBacNow');
  // "est" is doing real work: Widmark has no absorption delay and no ceiling,
  // so a heavy night compounds into figures a body would not survive.
  document.getElementById('tlapseBacSub').textContent = 'Widmark est · ' + weightKg + 'kg';

  let mw = 0, mh = 0, bw = 0, bh = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [cv, ctx] of [[mainCv, mainCtx], [bacCv, bacCtx]]) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    mw = mainCv.getBoundingClientRect().width; mh = mainCv.getBoundingClientRect().height;
    bw = bacCv.getBoundingClientRect().width;  bh = bacCv.getBoundingClientRect().height;
  }
  resize();
  window.addEventListener('resize', resize);

  let raf = 0, t0 = 0, idx = 0, bacPeak = 0;
  let counts = Object.fromEntries(SERIES.map(s => [s.key, 0]));

  function frame(now) {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / DURATION_MS);
    const playMs = startMs + p * (endMs - startMs);
    const xMax = Math.max(playMs, startMs + DAY_MS * 0.05);

    const stepped = countsAt(events, playMs, idx, counts);
    idx = stepped.index; counts = stepped.counts;

    const bacPts = bacPolyline(events, playMs, weightKg);
    const curBac = bacPts.length ? bacPts[bacPts.length - 1].bac : 0;
    bacPeak = Math.max(bacPeak, ...bacPts.map(q => q.bac), 0);

    for (const s of SERIES) cntEls[s.key].textContent = counts[s.key];
    dayEl.textContent = dayText(playMs);
    clockEl.textContent = budTime(playMs);
    bacEl.textContent = curBac.toFixed(3) + '%';
    bacEl.style.color = colors.booze;
    barEl.style.width = (p * 100).toFixed(2) + '%';

    const shared = { events, startMs, playMs, xMax, idx, counts, colors, bacPts, bacPeak };
    drawMain(mainCtx, mw, mh, shared);
    drawBac(bacCtx, bw, bh, shared);

    if (p < 1) raf = requestAnimationFrame(frame);
    else wrap.dataset.done = '1';
  }
  raf = requestAnimationFrame(frame);

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('hidden');
    delete wrap.dataset.running;
    delete wrap.dataset.done;
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  document.getElementById('tlapseClose').onclick = close;
  document.getElementById('tlapseReplay').onclick = () => {
    cancelAnimationFrame(raf);
    t0 = 0; idx = 0; bacPeak = 0;
    counts = Object.fromEntries(SERIES.map(s => [s.key, 0]));
    delete wrap.dataset.done;
    raf = requestAnimationFrame(frame);
  };
}
