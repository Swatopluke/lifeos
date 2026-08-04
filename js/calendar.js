// Calendar — the "Ahead" ledger on Overview and the full month-grid page.
//
// `events` is date-only: `start` and `end` are DATE columns, so a row carries no
// instant and no zone. Turning one into a Date and reading it back is how the
// same festival lands on two different days depending on where the laptop is.
// So nothing here constructs a Date from a calendar day: comparisons run on
// dayIndex() (a pure count of days since the epoch) and every label is built
// from string slices. isoOf() is the one inverse, and it reads the UTC face of a
// day count, which is exactly what a day count means.
//
// The table is read-only from this UI — rows arrive from Hermes or by SQL.
import { sb, SEED_EVENTS } from './config.js';
import { $, todayISO, dayIndex, escapeHtml } from './utils.js';
import { switchTab } from './nav.js';

const M_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const M_LONG  = ['January','February','March','April','May','June','July',
                 'August','September','October','November','December'];
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* Lanes drawn per week before the rest collapse into a "+n" marker. */
const MAX_LANES = 4;

const pad2   = n => String(n).padStart(2, '0');
const firstOf = (y, m) => y + '-' + pad2(m) + '-01';
const dayNum  = iso => +iso.slice(8, 10);
const monShort = iso => M_SHORT[+iso.slice(5, 7) - 1];

/** Move `d` months from y/m (1-12), rolling the year in either direction. */
const stepMonth = (y, m, d) => {
  const t = y * 12 + (m - 1) + d;
  return [Math.floor(t / 12), ((t % 12) + 12) % 12 + 1];
};

/** 'YYYY-MM-DD' for a day count — the inverse of dayIndex(). */
const isoOf = idx => {
  const d = new Date(idx * 86400000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
};

/* ================================================================
   DATA
   ================================================================ */

// Deliberately uncached. Twelve date-only rows cost nothing to refetch, and a
// cache would have to be invalidated by the FAB's force-refresh, which reaches
// modules only through switchTab() and cannot tell them anything.
async function getEvents() {
  let rows = SEED_EVENTS;
  try {
    const { data, error } = await sb.from('events').select('*').order('start');
    if (!error && data && data.length) rows = data;
  } catch (e) { /* table missing or offline — fall back to the seed */ }

  return (rows || [])
    .filter(e => e && e.start)
    .map(e => {
      const end = (e.end && e.end >= e.start) ? e.end : e.start;
      return { ...e, end, si: dayIndex(e.start), ei: dayIndex(end),
               key: String(e.id ?? (e.start + '-' + e.title)).replace(/[^\w-]/g, '') };
    })
    .sort((a, b) => a.si - b.si || b.ei - a.ei);
}

/** 'past' | 'now' | 'next' relative to today's day index. */
const stateOf = (ev, t) => ev.ei < t ? 'past' : (ev.si > t ? 'next' : 'now');

/** '12 Aug' · '11–13 Aug' · '30 Aug – 2 Sep' · years when they differ. */
function rangeLabel(ev) {
  const sd = dayNum(ev.start), sm = monShort(ev.start), sy = ev.start.slice(0, 4);
  if (ev.end === ev.start) return sd + ' ' + sm;
  const ed = dayNum(ev.end), em = monShort(ev.end), ey = ev.end.slice(0, 4);
  if (sy !== ey) return sd + ' ' + sm + ' ' + sy + ' – ' + ed + ' ' + em + ' ' + ey;
  if (sm === em) return sd + '–' + ed + ' ' + sm;
  return sd + ' ' + sm + ' – ' + ed + ' ' + em;
}

/** Compact chip text: how far away, in the reader's units. */
function countLabel(ev, t) {
  if (ev.si > t) {
    const d = ev.si - t;
    if (d === 1) return 'tomorrow';
    if (d < 45) return 'in ' + d + ' days';
    return 'in ' + Math.round(d / 30.4) + ' months';
  }
  if (ev.si === t && ev.ei === t) return 'today';
  if (ev.ei >= t) return 'day ' + (t - ev.si + 1) + ' of ' + (ev.ei - ev.si + 1);
  const g = t - ev.ei;
  return g === 1 ? 'yesterday' : g + ' days ago';
}

/* ================================================================
   OVERVIEW — the "Ahead" ledger
   ================================================================ */

export async function renderAhead() {
  const host = $('aheadList');
  if (!host) return;
  let evs;
  try { evs = await getEvents(); }
  catch (e) { host.innerHTML = '<div class="empty">Couldn\'t reach the calendar.</div>'; return; }

  const t = dayIndex(todayISO());
  const upcoming = evs.filter(e => e.ei >= t);
  const show = upcoming.slice(0, 4);

  $('aheadSub').textContent = upcoming.length
    ? (show.length < upcoming.length ? 'Next ' + show.length + ' of ' + upcoming.length + ' upcoming'
                                     : (upcoming.length === 1 ? 'One thing upcoming' : 'All ' + upcoming.length + ' upcoming'))
    : evs.length + ' events tracked · none ahead';

  if (!show.length) {
    host.innerHTML = '<div class="ahead-empty">Nothing ahead. The last event was '
      + (evs.length ? escapeHtml(evs[evs.length - 1].title) + ' on ' + rangeLabel(evs[evs.length - 1]) + '.' : 'never — the table is empty.')
      + '</div>' + allButton(evs.length);
    return;
  }

  host.innerHTML = '<div class="ahead">' + show.map(ev => {
    const st = stateOf(ev, t);
    const d = ev.si - t;
    const num = st === 'now'
      ? '<span class="ah-tok">' + (ev.si === ev.ei ? 'today' : 'live') + '</span>'
      : '<b>' + d + '</b><span>' + (d === 1 ? 'day' : 'days') + '</span>';
    return '<button class="ah ' + st + '" data-ev="' + ev.key + '">'
      + '<span class="ah-n">' + num + '</span>'
      + '<span class="ah-b"><span class="ah-t">' + escapeHtml(ev.title) + '</span>'
      + '<span class="ah-m">' + rangeLabel(ev)
      + (ev.location ? ' · ' + escapeHtml(ev.location) : '') + '</span></span>'
      + '</button>';
  }).join('') + '</div>' + allButton(evs.length);

  host.querySelectorAll('.ah').forEach(b => {
    b.addEventListener('click', () => {
      const ev = evs.find(e => e.key === b.dataset.ev);
      if (ev) jumpTo(ev.start, ev.key);
    });
  });
  const all = host.querySelector('.ahead-all');
  if (all) all.addEventListener('click', () => jumpTo(null, null));
}

const allButton = n => '<button class="ahead-all">'
  + (n ? 'Open calendar · ' + n + ' event' + (n === 1 ? '' : 's') : 'Open calendar') + ' →</button>';

/* ================================================================
   CALENDAR PAGE
   ================================================================ */

let viewY = null, viewM = null;
let pendingFocus = null;
let wired = false;
let rendered = [];   // the last fetched rows; the delegated handlers read these

/** Switch to the calendar tab, land on `iso`'s month, and flag a row to flash. */
export function jumpTo(iso, key) {
  if (iso) { viewY = +iso.slice(0, 4); viewM = +iso.slice(5, 7); }
  else { viewY = null; }
  pendingFocus = key || null;
  switchTab('calendar');
  loadCalendar();
}

// jumpTo() switches the tab and then loads, but switchTab's own lazy loader
// fires loadCalendar() too. Both would fetch and both would render, and the
// second render would wipe the highlight the first one had just applied — so
// concurrent callers share one run.
let inflight = null;
export function loadCalendar() {
  if (inflight) return inflight;
  inflight = run().finally(() => { inflight = null; });
  return inflight;
}

async function run() {
  const grid = $('calGrid');
  if (!grid) return;
  let evs;
  try { evs = await getEvents(); }
  catch (e) {
    grid.innerHTML = '';
    $('calAgenda').innerHTML = '<div class="empty">Couldn\'t reach the calendar.</div>';
    return;
  }

  if (viewY == null) {
    const t = todayISO();
    viewY = +t.slice(0, 4); viewM = +t.slice(5, 7);
  }
  rendered = evs;
  wire();
  render(evs);
}

function wire() {
  if (wired) return;
  wired = true;

  $('calPrev').addEventListener('click', () => { [viewY, viewM] = stepMonth(viewY, viewM, -1); loadCalendar(); });
  $('calNext').addEventListener('click', () => { [viewY, viewM] = stepMonth(viewY, viewM, 1); loadCalendar(); });
  $('calToday').addEventListener('click', () => {
    const t = todayISO();
    viewY = +t.slice(0, 4); viewM = +t.slice(5, 7); loadCalendar();
  });

  $('calRail').addEventListener('click', e => {
    const b = e.target.closest('.cr'); if (!b) return;
    viewM = +b.dataset.m; loadCalendar();
  });

  // Grid taps route into the agenda, which is where the notes live. A bar in a
  // leading or trailing week belongs to the neighbouring month, so it changes
  // the view before it can be focused.
  $('calGrid').addEventListener('click', e => {
    const hit = e.target.closest('.cg-b') || e.target.closest('.cg-c[data-has]');
    if (!hit) return;
    const key = hit.dataset.ev || hit.dataset.has;
    const ev = rendered.find(x => x.key === key);
    if (!ev) return;
    if (+ev.start.slice(0, 4) !== viewY || +ev.start.slice(5, 7) !== viewM) {
      viewY = +ev.start.slice(0, 4); viewM = +ev.start.slice(5, 7);
      pendingFocus = key; loadCalendar();
    } else focusRow(key);
  });

  $('calAgenda').addEventListener('click', e => {
    const j = e.target.closest('.cal-jump'); if (!j) return;
    viewY = +j.dataset.jump.slice(0, 4); viewM = +j.dataset.jump.slice(5, 7);
    pendingFocus = j.dataset.ev || null;
    loadCalendar();
  });
}

function render(evs) {
  const today = dayIndex(todayISO());
  const nowISO = todayISO();

  /* ---- header ---- */
  $('calMonth').textContent = M_LONG[viewM - 1];
  $('calYear').textContent = viewY;
  const isNowMonth = viewY === +nowISO.slice(0, 4) && viewM === +nowISO.slice(5, 7);
  $('calToday').classList.toggle('on', isNowMonth);

  /* ---- year rail ---- */
  const counts = new Array(12).fill(0);
  for (let m = 1; m <= 12; m++) {
    const a = dayIndex(firstOf(viewY, m));
    const [ny, nm] = stepMonth(viewY, m, 1);
    const b = dayIndex(firstOf(ny, nm)) - 1;
    counts[m - 1] = evs.filter(e => e.si <= b && e.ei >= a).length;
  }
  $('calRail').innerHTML = M_SHORT.map((lab, i) => {
    const m = i + 1;
    const cls = ['cr'];
    if (m === viewM) cls.push('on');
    if (!counts[i]) cls.push('zero');
    if (viewY === +nowISO.slice(0, 4) && m === +nowISO.slice(5, 7)) cls.push('now');
    return '<button class="' + cls.join(' ') + '" data-m="' + m + '" aria-label="'
      + M_LONG[i] + ' ' + viewY + ', ' + counts[i] + ' events">'
      + '<span class="cr-l">' + lab + '</span>'
      + '<span class="cr-n">' + (counts[i] || '·') + '</span></button>';
  }).join('');

  /* ---- month geometry ---- */
  const start = dayIndex(firstOf(viewY, viewM));
  const lead = (((start + 3) % 7) + 7) % 7;              // 1970-01-01 was a Thursday
  const [ny, nm] = stepMonth(viewY, viewM, 1);
  const len = dayIndex(firstOf(ny, nm)) - start;
  const gridStart = start - lead;
  const weeks = Math.ceil((lead + len) / 7);
  const gridEnd = gridStart + weeks * 7 - 1;

  /* ---- lanes, assigned once across the whole visible window so a multi-week
         event keeps the same row as it wraps ---- */
  const vis = evs.filter(e => e.ei >= gridStart && e.si <= gridEnd);
  const taken = [];
  vis.forEach(e => {
    let L = 0;
    while (taken[L] && taken[L].some(r => e.si <= r.b && e.ei >= r.a)) L++;
    (taken[L] = taken[L] || []).push({ a: e.si, b: e.ei });
    e.lane = L;
  });

  /* ---- grid ---- */
  let html = '<div class="cg-h">' + WEEKDAYS.map((d, i) =>
    '<span' + (i > 4 ? ' class="we"' : '') + '>' + d + '</span>').join('') + '</div>';

  for (let w = 0; w < weeks; w++) {
    const wa = gridStart + w * 7, wb = wa + 6;
    const seg = vis.filter(e => e.ei >= wa && e.si <= wb);
    const drawn = seg.filter(e => e.lane < MAX_LANES);
    const laneN = drawn.length ? Math.max(...drawn.map(e => e.lane)) + 1 : 0;

    // Days pushed past MAX_LANES, counted per day so the cell can say so.
    const spill = {};
    seg.filter(e => e.lane >= MAX_LANES).forEach(e => {
      for (let i = Math.max(e.si, wa); i <= Math.min(e.ei, wb); i++) spill[i] = (spill[i] || 0) + 1;
    });

    const rows = 'var(--h1) '
      + (laneN ? 'repeat(' + laneN + ',var(--lh)) ' : '')
      + 'minmax(var(--pad),1fr)';

    let cells = '';
    for (let i = 0; i < 7; i++) {
      const idx = wa + i, iso = isoOf(idx);
      const inMonth = idx >= start && idx < start + len;
      const covering = seg.find(e => e.si <= idx && e.ei >= idx);
      const cls = ['cg-c'];
      if (!inMonth) cls.push('out');
      if (idx === today) cls.push('today');
      if (i > 4) cls.push('we');
      if (covering) cls.push('has');
      cells += '<div class="' + cls.join(' ') + '" style="grid-column:' + (i + 1) + ';grid-row:1/-1"'
        + (covering ? ' data-has="' + covering.key + '"' : '') + '>'
        + '<span class="cg-n">' + pad2(dayNum(iso)) + '</span>'
        + (spill[idx] ? '<span class="cg-more">+' + spill[idx] + '</span>' : '')
        + '</div>';
    }

    const bars = drawn.map(e => {
      const a = Math.max(e.si, wa), b = Math.min(e.ei, wb);
      const cls = ['cg-b', stateOf(e, today)];
      if (e.si === a) cls.push('s');
      if (e.ei === b) cls.push('e');
      return '<button class="' + cls.join(' ') + '" data-ev="' + e.key + '"'
        + ' style="grid-column:' + (a - wa + 1) + '/span ' + (b - a + 1) + ';grid-row:' + (e.lane + 2) + '"'
        + ' title="' + escapeHtml(e.title) + ' · ' + rangeLabel(e) + '">'
        + '<span>' + escapeHtml(e.title) + '</span></button>';
    }).join('');

    html += '<div class="cg-w" style="grid-template-rows:' + rows + '">' + cells + bars + '</div>';
  }
  $('calGrid').innerHTML = html;
  $('calKey').classList.toggle('hidden', !vis.length);

  /* ---- agenda ---- */
  const monthEvs = evs.filter(e => e.ei >= start && e.si < start + len);
  $('calCount').textContent = monthEvs.length
    ? monthEvs.length + (monthEvs.length === 1 ? ' event' : ' events') + ' this month'
    : 'Nothing scheduled';

  if (!monthEvs.length) {
    const next = evs.find(e => e.si >= start + len);
    const prev = [...evs].reverse().find(e => e.ei < start);
    const link = next || prev;
    $('calAgenda').innerHTML = '<div class="cal-none">'
      + '<p>No events in ' + M_LONG[viewM - 1] + ' ' + viewY + '.</p>'
      + (link ? '<button class="cal-jump" data-jump="' + link.start.slice(0, 7)
          + '" data-ev="' + link.key + '">' + (next ? 'Next' : 'Previous') + ': '
          + escapeHtml(link.title) + ' · ' + rangeLabel(link) + ' →</button>' : '')
      + '</div>';
    consumeFocus();
    return;
  }

  $('calAgenda').innerHTML = monthEvs.map(ev => {
    const st = stateOf(ev, today);
    const sd = dayNum(ev.start), ed = dayNum(ev.end);
    const dd = ev.start === ev.end ? pad2(sd) : pad2(sd) + '–' + pad2(ed);
    const dm = monShort(ev.start) + (monShort(ev.start) !== monShort(ev.end) ? '/' + monShort(ev.end) : '');
    return '<article class="ag ' + st + '" id="ag-' + ev.key + '">'
      + '<div class="ag-d"><span class="ag-dd">' + dd + '</span><span class="ag-dm">' + dm + '</span></div>'
      + '<div class="ag-b"><h3 class="ag-t">' + escapeHtml(ev.title) + '</h3>'
      + '<div class="ag-m">' + rangeLabel(ev)
      + (ev.location ? ' · ' + escapeHtml(ev.location) : '') + '</div>'
      + (ev.note ? '<p class="ag-note">' + escapeHtml(ev.note) + '</p>' : '') + '</div>'
      + '<div class="ag-c">' + countLabel(ev, today) + '</div>'
      + '</article>';
  }).join('');

  consumeFocus();
}

function consumeFocus() {
  if (!pendingFocus) return;
  const key = pendingFocus;
  pendingFocus = null;
  // The section is display:none until switchTab flips it; scrolling before that
  // measures a zero-height box.
  setTimeout(() => focusRow(key), 90);
}

function focusRow(key) {
  const el = $('ag-' + key);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('hl');
  void el.offsetWidth;
  el.classList.add('hl');
}
