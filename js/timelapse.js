// Full-screen 10-second timelapse of the Sziget window: five cumulative
// series (beer · unicum · snus · coffee · meals) drawn on an expanding pair
// of axes, with live counters across the top.
//
// buildTimelapse() is pure and DOM-free so node tests can import it, matching
// the js/timeline.js rule. Counting goes through the same minuteKey/isBeer
// pair rule the Sziget log uses, so the end-of-run counters always agree with
// the Overall chips — tests assert that against overallTotals().
//
// Drawn on a raw 2D canvas rather than through charts.js/drawChart: this is a
// per-frame redraw with axes that rescale on every tick, not a card chart, and
// Chart.js has no useful role in it.
import { budDay, budTime } from './utils.js';
import { isBeer, minuteKey, FESTIVAL } from './timeline.js';

export const DURATION_MS = 10000;

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

/**
 * Flatten the festival window into a chronological event list plus totals.
 *
 * The same-minute beer rule matches overallTotals() exactly: a Budapest
 * day+minute holding >= 2 beers yields one unicum and (n - 1) beers, so two
 * beers logged together read as one beer and one unicum. Rows outside the
 * half-open [startISO, endISO) window are ignored.
 *
 * Returns { events: [{ ms, key, n }] sorted by ms, totals, startMs, endMs }.
 */
export function buildTimelapse(meals, intake, startISO, endISO) {
  const startMs = Date.parse(startISO), endMs = Date.parse(endISO);
  const events = [];
  const push = (ts, key, n = 1) => {
    const ms = new Date(ts).getTime();
    if (isNaN(ms) || ms < startMs || ms >= endMs) return;
    events.push({ ms, key, n });
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
    }
  }
  for (const rows of beerByMin.values()) {
    if (rows.length >= 2) {
      rows.sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));
      push(rows[0].taken_at, 'unicum');
      for (let i = 1; i < rows.length; i++) push(rows[i].taken_at, 'beer');
    } else {
      push(rows[0].taken_at, 'beer');
    }
  }

  events.sort((a, b) => a.ms - b.ms);
  const totals = {};
  for (const s of SERIES) totals[s.key] = 0;
  for (const e of events) totals[e.key] += e.n;
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
  while (i < events.length && events[i].ms <= ms) { counts[events[i].key] += events[i].n; i++; }
  return { counts, index: i };
}

/* ================================================================
   RENDERER — everything below touches the DOM
   ================================================================ */

const PAD = { top: 26, right: 74, bottom: 40, left: 52 };
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const DAY_MS = 86400000;

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

function drawFrame(ctx, w, h, state) {
  const { events, startMs, playMs, idx, counts } = state;
  const colors = state.colors;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const plotW = w - PAD.left - PAD.right, plotH = h - PAD.top - PAD.bottom;
  if (plotW <= 0 || plotH <= 0) return;

  // Expanding domains: x runs from the window start to the playhead, y from 0
  // to the tallest series so far, both stretched to fill the plot. Floors keep
  // the first frames from dividing by zero while nothing has happened yet.
  const xMax = Math.max(playMs, startMs + DAY_MS * 0.05);
  const yMax = Math.max(2, Math.max(...SERIES.map(s => counts[s.key])) * 1.08);
  const X = ms => PAD.left + ((ms - startMs) / (xMax - startMs)) * plotW;
  const Y = n => PAD.top + plotH - (n / yMax) * plotH;

  // -- grid + y ticks --
  const yStep = Math.max(1, Math.ceil(yMax / 5 / 5) * 5);
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= yMax; v += yStep) {
    const y = Y(v);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(w - PAD.right, y); ctx.stroke();
    ctx.fillStyle = colors.faint;
    ctx.textAlign = 'right';
    ctx.fillText(String(v), PAD.left - 10, y);
  }

  // -- x ticks: Budapest midnights inside the visible span --
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const firstMidnight = Math.ceil(startMs / DAY_MS) * DAY_MS;
  const spanDays = (xMax - startMs) / DAY_MS;
  if (spanDays > 0.9) {                     // below a day the labels just crowd
    for (let t = firstMidnight; t <= xMax; t += DAY_MS) {
      const x = X(t);
      if (x < PAD.left || x > w - PAD.right) continue;
      ctx.strokeStyle = colors.border;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + plotH); ctx.stroke();
      ctx.fillStyle = colors.faint;
      ctx.fillText(budDay(t).slice(8) + '/' + budDay(t).slice(5, 7), x, PAD.top + plotH + 8);
    }
  }

  // -- axes --
  ctx.strokeStyle = colors.dim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(w - PAD.right, PAD.top + plotH);
  ctx.stroke();

  // -- series --
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

  // Head labels, nudged apart: low-count series (coffee, unicum, meals) sit on
  // top of each other early on and the numbers become unreadable.
  const GAP = 16;
  heads.sort((a, b) => a.y - b.y);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].y - heads[i - 1].y < GAP) heads[i].y = heads[i - 1].y + GAP;
  }
  const overflow = heads.length && heads[heads.length - 1].y - (PAD.top + plotH);
  if (overflow > 0) for (const hd of heads) hd.y -= overflow;   // keep them on-canvas
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const hd of heads) {
    ctx.fillStyle = colors[hd.key];
    ctx.fillText(hd.icon + ' ' + hd.n, hd.x + 9, hd.y);
  }
}

/**
 * Open the overlay and play the window once. Returns immediately; the run
 * tears itself down on close. Safe to call again after it closes.
 */
export function startTimelapse(meals, intake, startISO = FESTIVAL.startISO, endISO = FESTIVAL.endISO) {
  const wrap = document.getElementById('tlapse');
  if (!wrap || wrap.dataset.running) return;

  const built = buildTimelapse(meals, intake, startISO, endISO);
  const { events, startMs, endMs } = built;
  if (!events.length) {
    document.getElementById('tlapseEmpty').classList.remove('hidden');
  } else {
    document.getElementById('tlapseEmpty').classList.add('hidden');
  }

  wrap.dataset.running = '1';
  wrap.classList.remove('hidden');

  const canvas = document.getElementById('tlapseCanvas');
  const ctx = canvas.getContext('2d');
  const colors = { bg: cssVar('--bg'), border: cssVar('--border'), faint: cssVar('--faint'), dim: cssVar('--dim') };
  for (const s of SERIES) colors[s.key] = cssVar(s.css);

  // Counter chips across the top.
  document.getElementById('tlapseCounts').innerHTML = SERIES.map(s =>
    `<div class="tlp-chip"><span class="tlp-ico">${s.icon}</span>
       <b id="tlp-n-${s.key}" style="color:${colors[s.key]}">0</b>
       <span class="tlp-lab">${s.label}</span></div>`).join('');
  const cntEls = Object.fromEntries(SERIES.map(s => [s.key, document.getElementById('tlp-n-' + s.key)]));
  const clockEl = document.getElementById('tlapseClock');
  const barEl = document.getElementById('tlapseBar');

  let w = 0, h = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  let raf = 0, t0 = 0, idx = 0;
  let counts = Object.fromEntries(SERIES.map(s => [s.key, 0]));

  function frame(now) {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / DURATION_MS);
    const playMs = startMs + p * (endMs - startMs);

    const stepped = countsAt(events, playMs, idx, counts);
    idx = stepped.index; counts = stepped.counts;

    for (const s of SERIES) cntEls[s.key].textContent = counts[s.key];
    clockEl.textContent = budDay(playMs) + ' · ' + budTime(playMs);
    barEl.style.width = (p * 100).toFixed(2) + '%';
    drawFrame(ctx, w, h, { events, startMs, playMs, idx, counts, colors });

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
    t0 = 0; idx = 0;
    counts = Object.fromEntries(SERIES.map(s => [s.key, 0]));
    delete wrap.dataset.done;
    raf = requestAnimationFrame(frame);
  };
}
