import { sb } from './config.js';
import { $, todayISO, daysAgoISO, shortDay, CSS } from './utils.js';
import { drawChart, gridOpt, baseOpts } from './charts.js';

// Selected window for the Watch vitals card. Owned here because loadVitals()
// is its only reader; the range buttons just mutate it and re-render.
let vitalsRange = 30;
const rangeButtons = () => document.querySelectorAll('#vitalsRange button');
rangeButtons().forEach(b => {
  b.addEventListener('click', () => {
    rangeButtons().forEach(x => x.classList.remove('on'));
    b.classList.add('on'); vitalsRange = +b.dataset.r; loadVitals();
  });
});

// Reads daily aggregates from health_raw payloads (same pattern as history.js).
// Charts are drawn only when the window actually has data, so pre-Watch days
// show an empty state instead of a blank canvas.
export async function loadVitals() {
  const since = daysAgoISO(vitalsRange === 7 ? 6 : 29);
  const { data, error } = await sb.from('health_raw')
    .select('payload').gte('payload->>date', since).order('payload->>date').limit(5000);
  if (error) { $('vitalsSub').textContent = 'Load error'; return; }

  const byDate = {};
  (data || []).forEach(r => { const p = r.payload; if (p && p.date) byDate[p.date] = p; });

  const days = []; for (let i = vitalsRange - 1; i >= 0; i--) days.push(daysAgoISO(i));
  const labels = days.map(shortDay);
  const series = (k, f) => days.map(d => {
    const v = byDate[d]?.[k]; return v == null ? null : f(v);
  });

  const hr  = series('hr_avg', v => Math.round(v));
  const hrv = series('hrv', v => Math.round(v));
  const spo2 = series('spo2', v => Math.round(v));
  const temp = series('wrist_temp', v => +v.toFixed(1));

  const has = a => a.some(v => v != null);
  const valid = a => a.filter(v => v != null);
  const avgOf = a => valid(a).length ? Math.round(valid(a).reduce((x, y) => x + y, 0) / valid(a).length) : null;

  const lineOpts = (unit, min, max) => ({ ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } },
    scales: { ...baseOpts.scales, y: { ...gridOpt, suggestedMin: min, suggestedMax: max,
      title: { display: true, text: unit, color: CSS('--faint'), font: { size: 9 } } } } });
  const draw = (id, data, color, unit, min, max) => {
    if (!has(data)) return;
    drawChart(id, { type: 'line', data: { labels, datasets: [{
      data, borderColor: CSS(color), backgroundColor: CSS(color) + '22',
      fill: true, tension: .32, pointRadius: 2, spanGaps: true }]},
      options: lineOpts(unit, min, max) });
  };

  draw('chHR', hr, '--booze', 'avg bpm', 40, 140);
  draw('chHRV', hrv, '--energy', 'HRV ms', 0, null);
  draw('chSpO2', spo2, '--caf', 'SpO2 %', 90, 100);
  draw('chTemp', temp, '--food', 'wrist °C', 34, 38);

  const last = byDate[days[days.length - 1]] || {};
  const parts = [];
  if (last.hr_avg != null) parts.push('❤ ' + Math.round(last.hr_avg) + ' bpm');
  if (last.resting_hr != null) parts.push('rest ' + last.resting_hr);
  if (last.hrv != null) parts.push('HRV ' + Math.round(last.hrv) + 'ms');
  if (last.spo2 != null) parts.push('SpO2 ' + Math.round(last.spo2) + '%');
  if (last.wrist_temp != null) parts.push('🌡 ' + (+last.wrist_temp).toFixed(1) + '°');
  const avgHr = avgOf(hr), avgHrv = avgOf(hrv);
  $('vitalsSub').textContent = parts.length
    ? parts.join(' · ') + (avgHr ? ' · avg ' + avgHr + ' bpm' : '') + (avgHrv ? ' · avg HRV ' + avgHrv + 'ms' : '')
    : 'No Watch data in this window yet — wear your Watch while sleeping & training';
}
