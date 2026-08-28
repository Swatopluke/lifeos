#!/usr/bin/env node
// LifeOS health backfill from Apple Health export.xml (streaming, 237MB-safe).
//
// Rules (match the original hand-written pipeline, extended for Watch data):
//  - steps:      iPhone-source only (pre-Watch continuity), bucketed by Budapest date.
//  - sleep:      per night, prefer Apple Watch staged segments when the Watch has
//                any Asleep* segment; otherwise use all other sources. InBed excluded.
//  - health_raw: one jsonb payload row per day with every aggregate.
//  - health_metrics: steps_hourly rows; measured_at = the UTC instant of the
//                Budapest hour bucket (so budHour()/budDay() round-trip exactly).
//
// Usage:
//   node scripts/backfill-health.mjs            # parse -> CSVs + backfill_payload.json
//   node scripts/backfill-health.mjs --insert   # + insert into Supabase (key from js/config.js)
import { createReadStream, writeFileSync } from 'node:fs';
import readline from 'node:readline';

const ROOT = '/Users/gyozobaglyas/LifeOS';
const XML = `${ROOT}/apple_health_export/export.xml`;

// --- Budapest helpers (mirror js/utils.js) ---
const budaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' });
const budaHour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', hour: '2-digit', hour12: false });
const budDate = ts => budaDay.format(new Date(ts));
const budHourOf = ts => +budaHour.format(new Date(ts));
const nightOf = ts => {
  const d = new Date(ts);
  if (budHourOf(d) >= 12) return budDate(d);
  return budDate(d.getTime() - 86400000);
};
const floorHourUTC = ts => new Date(Math.floor(new Date(ts).getTime() / 3600000) * 3600000).toISOString();
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const isWatch = s => s.includes('Watch'); // NBSP between "Apple" and "Watch" in source names
const isIPhone = s => s.includes('iPhone');

// --- accumulators ---
const stepsByDay = {};          // date -> {total, bySource}
const stepsHourly = {};         // 'date|HH' -> {qty, refTs}
const sleepByNight = {};        // night -> {deep,core,rem,unspec,awake, hasWatch}
const hrByDay = {}, hrvByDay = {}, spo2ByDay = {}, wristByDay = {};
const respByDay = {}, restingHrByDay = {}, vo2ByDay = {};
const weightByDay = {};         // date -> last BodyMass

const push = (m, d, v) => (m[d] = m[d] || []).push(+v);

const REC = /<Record\s+([^>]*?)\/?>/g;
const attr = (s, n) => { const m = s.match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : null; };

console.log('parsing', XML, '...');
const rl = readline.createInterface({ input: createReadStream(XML), crlfDelay: Infinity });
let lines = 0;

rl.on('line', line => {
  lines++;
  if (!line.includes('<Record')) return;
  let m;
  REC.lastIndex = 0;
  while ((m = REC.exec(line))) {
    const b = m[1];
    const type = attr(b, 'type');
    const start = attr(b, 'startDate');
    if (!type || !start) continue;
    const source = attr(b, 'sourceName') || '';
    const value = attr(b, 'value');
    const date = budDate(start);

    if (type === 'HKQuantityTypeIdentifierStepCount') {
      if (!isIPhone(source)) continue; // iPhone-only (continuity)
      const v = +value || 0;
      const s = (stepsByDay[date] = stepsByDay[date] || { total: 0, bySource: {} });
      s.total += v;
      s.bySource[source.replace(/\u2019/g, "'")] = (s.bySource[source.replace(/\u2019/g, "'")] || 0) + v;
      const key = `${date}|${budHourOf(start)}`;
      const hb = (stepsHourly[key] = stepsHourly[key] || { qty: 0, refTs: start });
      hb.qty += v;
      if (!hb.refTs || new Date(start) < new Date(hb.refTs)) hb.refTs = start;
    } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const stage = (attr(b, 'value') || '').replace('HKCategoryValueSleepAnalysis', '');
      if (stage === 'InBed') continue;
      const night = nightOf(start);
      const hours = (new Date(attr(b, 'endDate')) - new Date(start)) / 3600000;
      const s = (sleepByNight[night] = sleepByNight[night] || { deep: 0, core: 0, rem: 0, unspec: 0, awake: 0, watchSegs: [], otherSegs: [] });
      const seg = { stage, hours };
      (isWatch(source) ? s.watchSegs : s.otherSegs).push(seg);
    } else if (type === 'HKQuantityTypeIdentifierHeartRate') push(hrByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') push(hrvByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierOxygenSaturation') push(spo2ByDay, date, value * 100);
    else if (type === 'HKQuantityTypeIdentifierAppleSleepingWristTemperature') push(wristByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierRespiratoryRate') push(respByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierRestingHeartRate') push(restingHrByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierVO2Max') push(vo2ByDay, date, value);
    else if (type === 'HKQuantityTypeIdentifierBodyMass') weightByDay[date] = +value;
  }
});

rl.on('close', () => {
  console.log('parsed', lines, 'lines');

  // Resolve sleep nights: Watch preferred when it has Asleep segments.
  const resolved = {};
  for (const [night, s] of Object.entries(sleepByNight)) {
    const useWatch = s.watchSegs.some(x => x.stage.startsWith('Asleep'));
    const segs = useWatch ? s.watchSegs : s.otherSegs;
    const out = { deep: 0, core: 0, rem: 0, unspec: 0, awake: 0 };
    for (const x of segs) {
      if (x.stage === 'AsleepDeep') out.deep += x.hours;
      else if (x.stage === 'AsleepCore') out.core += x.hours;
      else if (x.stage === 'AsleepREM') out.rem += x.hours;
      else if (x.stage === 'AsleepUnspecified') out.unspec += x.hours;
      else if (x.stage === 'Awake') out.awake += x.hours;
    }
    out.hours_asleep = +(out.deep + out.core + out.rem + out.unspec).toFixed(2);
    resolved[night] = out;
  }

  const days = Object.keys(stepsByDay).sort();
  const nights = Object.keys(resolved).sort();

  // ---- health_backfill.csv (same schema as original) ----
  const rows = days.map(d => {
    const s = stepsByDay[d];
    const srcs = Object.keys(s.bySource);
    const primary = srcs.find(isIPhone) || srcs[0];
    const all = srcs.map(x => `${x}=${Math.round(s.bySource[x])}`).join(', ');
    return [d, d, '', '', '', Math.round(s.total), primary, all,
      weightByDay[d] != null ? weightByDay[d] : '',
      restingHrByDay[d] ? avg(restingHrByDay[d]).toFixed(1) : ''].join(',');
  });
  writeFileSync(`${ROOT}/health_backfill.csv`,
    'date,night_of,sleep_hours,sleep_hours_raw_sum,sleep_hours_evening_rule,steps,steps_source,steps_all_sources,weight,resting_hr\r\n' + rows.join('\r\n') + '\r\n');

  // ---- sleep_stages.csv ----
  const sRows = nights.map(n => {
    const s = resolved[n];
    return [n, s.deep.toFixed(2), s.core.toFixed(2), s.rem.toFixed(2), s.unspec.toFixed(2), s.awake.toFixed(2), s.hours_asleep.toFixed(2)].join(',');
  });
  writeFileSync(`${ROOT}/sleep_stages.csv`,
    'night_of,deep_h,core_h,rem_h,unspecified_h,awake_h,stage_total_h\r\n' + sRows.join('\r\n') + '\r\n');

  // ---- Supabase payloads ----
  const dailyStateRows = days.map(d => ({ day: d, steps: Math.round(stepsByDay[d].total) }));
  const sleepRowsDb = nights.map(n => ({ night_of: n, hours_asleep: resolved[n].hours_asleep,
    deep_h: +resolved[n].deep.toFixed(2), core_h: +resolved[n].core.toFixed(2),
    rem_h: +resolved[n].rem.toFixed(2), awake_h: +resolved[n].awake.toFixed(2) }));
  const weightRows = Object.entries(weightByDay).map(([measured_on, weight_kg]) => ({ measured_on, weight_kg }));

  const allDates = new Set([...days, ...nights, ...Object.keys(hrByDay), ...Object.keys(hrvByDay),
    ...Object.keys(spo2ByDay), ...Object.keys(wristByDay), ...Object.keys(respByDay),
    ...Object.keys(restingHrByDay), ...Object.keys(vo2ByDay), ...Object.keys(weightByDay)]);
  const rawRows = [...allDates].sort().map(date => ({ payload: {
    date,
    steps: stepsByDay[date] ? Math.round(stepsByDay[date].total) : null,
    hr_avg: hrByDay[date] ? +avg(hrByDay[date]).toFixed(1) : null,
    hr_min: hrByDay[date] ? Math.min(...hrByDay[date]) : null,
    hr_max: hrByDay[date] ? Math.max(...hrByDay[date]) : null,
    hrv: hrvByDay[date] ? +avg(hrvByDay[date]).toFixed(1) : null,
    spo2: spo2ByDay[date] ? +avg(spo2ByDay[date]).toFixed(1) : null,
    wrist_temp: wristByDay[date] ? +avg(wristByDay[date]).toFixed(2) : null,
    resp_rate: respByDay[date] ? +avg(respByDay[date]).toFixed(1) : null,
    resting_hr: restingHrByDay[date] ? Math.round(avg(restingHrByDay[date])) : null,
    vo2max: vo2ByDay[date] ? +avg(vo2ByDay[date]).toFixed(1) : null,
    weight: weightByDay[date] != null ? weightByDay[date] : null,
    sleep_h: resolved[date] ? resolved[date].hours_asleep : null,
  }}));

  const hmRows = Object.entries(stepsHourly).map(([key, hb]) => {
    const [date, h] = key.split('|');
    return { metric: 'steps_hourly', measured_at: floorHourUTC(hb.refTs), qty: hb.qty };
  }).sort((a, b) => a.measured_at < b.measured_at ? -1 : 1);

  const out = { dailyStateRows, sleepRowsDb, weightRows, rawRows, hmRows };
  writeFileSync(`${ROOT}/backfill_payload.json`, JSON.stringify(out));
  console.log('daily_state', dailyStateRows.length, '| sleep', sleepRowsDb.length, '| body_metrics', weightRows.length,
    '| health_raw', rawRows.length, '| health_metrics(steps_hourly)', hmRows.length);

  if (process.argv.includes('--insert')) insertAll(out);
});

async function insertAll(out) {
  const { readFileSync } = await import('node:fs');
  const cfg = readFileSync(`${ROOT}/js/config.js`, 'utf8');
  const URL = cfg.match(/SUPABASE_URL = "([^"]+)"/)[1];
  const KEY = cfg.match(/SUPABASE_KEY = "([^"]+)"/)[1];
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const chunk = (arr, n = 400) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  async function post(table, rows) {
    if (!rows.length) return;
    for (const c of chunk(rows)) {
      const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(c) });
      if (!r.ok) { console.error(`FAIL ${table}:`, r.status, await r.text()); process.exitCode = 1; return; }
    }
    console.log('inserted', table, rows.length);
  }

  // probe one row per table first (RLS check), then bulk
  for (const [t, rows] of [['daily_state', out.dailyStateRows], ['sleep', out.sleepRowsDb],
    ['body_metrics', out.weightRows], ['health_raw', out.rawRows], ['health_metrics', out.hmRows]]) {
    if (!rows.length) continue;
    const probe = await fetch(`${URL}/rest/v1/${t}`, { method: 'POST', headers: H, body: JSON.stringify(rows.slice(0, 1)) });
    if (!probe.ok) { console.error(`RLS BLOCKED ${t}:`, probe.status, await probe.text()); process.exitCode = 1; continue; }
    await post(t, rows.slice(1));
  }
  console.log('insert pass done');
}
