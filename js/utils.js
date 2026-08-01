// DOM, date and formatting helpers shared across modules.
//
// TIMEZONE RULE: every date/hour bucket in this app is Budapest, never the
// browser's local zone and never UTC. Supabase hands back UTC instants; the
// user lives in Europe/Budapest. Bucketing by `getHours()`/`getDate()` silently
// produces a different answer on a machine set to any other zone, and bucketing
// by UTC shifts every day boundary by 1–2h. Both bugs are invisible on a laptop
// that happens to be set to Budapest, which is why they survived this long.
// All of it lives here so no module re-derives it — see scripts/check-tz.mjs,
// which fails `lint` if a module reaches for local-time accessors directly.
export const $ = id => document.getElementById(id);

export const budaFmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Budapest',
  hour:'2-digit', minute:'2-digit', hour12:false });
export const budaDay = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Budapest',
  year:'numeric', month:'2-digit', day:'2-digit' });

// Full Budapest breakdown of an instant, used to derive the offset. `en-GB` +
// hour12:false yields hour '24' for midnight in some ICU versions, hence % 24.
const budaParts = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Budapest',
  year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });

const partsOf = d => Object.fromEntries(
  budaParts.formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type, +p.value])
);

/** Budapest's UTC offset in ms at a given instant (+1h winter, +2h summer). */
export const budOffsetMs = (d = new Date()) => {
  const p = partsOf(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - new Date(d).getTime();
};

/** 'YYYY-MM-DD' for the Budapest calendar day containing `ts`. */
export const budDay = ts => (ts ? budaDay.format(new Date(ts)) : '');

/** 'HH:MM' Budapest wall-clock time of `ts`. */
export const budTime = ts => budaFmt.format(new Date(ts));

/** Budapest wall-clock hour (0–23) of `ts`. */
export const budHour = ts => partsOf(new Date(ts)).hour % 24;

/** Today's Budapest calendar date, 'YYYY-MM-DD'. */
export const todayISO = () => budDay(new Date());

/**
 * The Budapest calendar date `n` days before today, 'YYYY-MM-DD'.
 * Arithmetic runs on the bare date in UTC, so a DST transition inside the
 * window cannot shorten a day and land us back on the date we started from.
 */
export const daysAgoISO = n => {
  const [y, m, d] = todayISO().split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - n * 86400000);
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(t.getUTCDate()).padStart(2, '0');
};

/**
 * The instant Budapest midnight began on `day` ('YYYY-MM-DD', default today),
 * as a UTC ISO string — the correct lower bound for a `.gte()` on a timestamptz
 * column. `day + 'T00:00:00Z'` is UTC midnight, which is 01:00/02:00 Budapest
 * and therefore drops everything logged in the first hours of the local day.
 *
 * Two passes: the offset is sampled at the naive instant, then re-sampled at
 * the corrected one, so a day that starts on the far side of a DST switch still
 * resolves to the right offset.
 */
export const budDayStartISO = (day = todayISO()) => {
  const [y, m, d] = day.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  const off = budOffsetMs(new Date(naive - budOffsetMs(new Date(naive))));
  return new Date(naive - off).toISOString();
};

export const shortDay = iso => iso.slice(8,10)+'.'+iso.slice(5,7);

/**
 * Days since the epoch for a date-only 'YYYY-MM-DD' string. Lets two calendar
 * dates be compared or subtracted without constructing a Date, which is what
 * drags a timezone into what should be pure date arithmetic.
 */
export const dayIndex = iso =>
  Date.UTC(+iso.slice(0,4), +iso.slice(5,7) - 1, +iso.slice(8,10)) / 86400000;

/** Rolling 24h window: true for timestamps within the last 24 hours from now. */
export const within24h = ts => {
  const ms = new Date(ts).getTime();
  if (isNaN(ms)) return false;
  const d = Date.now() - ms;
  return d >= 0 && d < 86400000;
};

/**
 * Sum `{t, v}` pairs into 24 hourly buckets ending at the current hour.
 * Bucket 23 is the hour happening now, bucket 0 the hour 23 hours back; labels
 * are Budapest wall-clock hours. Anything outside the window is dropped.
 *
 * Lives here rather than in dashboard.js so it is importable — dashboard.js
 * pulls in the Supabase client at module scope and cannot load outside a
 * browser, which previously forced tests to scrape the function out of the
 * file as text. See tests/utils.test.mjs.
 */
export const bucket24h = pairs => {
  const now = Date.now();
  const labels = [];
  for (let h = 23; h >= 0; h--) {
    labels.push(String(budHour(new Date(now - h * 3600000))).padStart(2, '0') + ':00');
  }
  const buckets = new Array(24).fill(0);
  (pairs || []).forEach(({ t, v }) => {
    const ms = new Date(t).getTime();
    if (isNaN(ms)) return;
    const dH = (now - ms) / 3600000;
    if (dH >= 0 && dH < 24) buckets[23 - Math.floor(dH)] += (v || 0);
  });
  return { labels, buckets };
};

export function toast(msg, isErr){
  const t=$('toast'); t.textContent=msg; t.className='toast show'+(isErr?' err':'');
  setTimeout(()=>t.className='toast'+(isErr?' err':''),1900);
}
export const CSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export const timeAgo = unixSec => {
  const s = Math.max(1, Math.floor(Date.now()/1000 - unixSec));
  const units = [[31536000,'y'],[2592000,'mo'],[86400,'d'],[3600,'h'],[60,'m']];
  for(const [sec,label] of units){ if(s>=sec) return Math.floor(s/sec)+label+' ago'; }
  return s+'s ago';
};
export const domainOf = url => { try{ return new URL(url).hostname.replace(/^www\./,''); } catch(e){ return null; } };
