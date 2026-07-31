import { sb } from './config.js';
import { $, todayISO, daysAgoISO, shortDay, CSS } from './utils.js';
import { drawChart, gridOpt, baseOpts } from './charts.js';

// Selected window for the Steps card. Owned here because loadHistory() is its only
// reader; the range buttons just mutate it and re-render.
let stepsRange = 30;
document.querySelectorAll('#stepsRange button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('#stepsRange button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); stepsRange = +b.dataset.r; loadHistory();
  });
});

export async function loadHistory(){
  // 24H reads real hourly buckets from health_metrics; 7D/30D use daily totals.
  const since = daysAgoISO(stepsRange===30 ? 29 : 6);

  const qs = [
    sb.from('sleep').select('night_of,hours_asleep').gte('night_of',since).order('night_of').limit(5000),
    sb.from('daily_state').select('day,steps').gte('day',since).order('day').limit(5000),
    sb.from('health_raw').select('payload').gte('payload->>date',since).order('payload->>date').limit(5000)
  ];
  if(stepsRange===1) qs.push(
    sb.from('health_metrics').select('measured_at,qty').eq('metric','steps_hourly')
      .gte('measured_at', since+'T00:00:00Z').order('measured_at').limit(5000)
  );
  const [sR, stR, hrR, hmR] = await Promise.all(qs);

  if(sR.error || stR.error){ $('stepsSub').textContent='Load error'; return; }

  // Build unified steps map by day
  const stepMap={}, sleepMap2={};
  (sR.data||[]).forEach(r=>{ const d=r.night_of; if(r.hours_asleep!=null) sleepMap2[d]=+r.hours_asleep; });
  (stR.data||[]).forEach(r=>{ if(r.steps!=null) stepMap[r.day]=+r.steps; });
  (hrR?.data||[]).forEach(r=>{ const d=r.payload?.date; if(d && r.payload?.steps) stepMap[d]=+(r.payload.steps); });

  let labels=[], stepsVals=[], hourlyDate=null;
  if(stepsRange===1){
    // Bucket by LOCAL calendar day, then show the most recent day that has data.
    const pad = n => String(n).padStart(2,'0');
    const byDate = {};
    (hmR?.data||[]).forEach(r=>{
      const dt = new Date(r.measured_at);
      const d = dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());
      (byDate[d] = byDate[d] || Array(24).fill(null))[dt.getHours()] = Math.round(+r.qty);
    });
    const dates = Object.keys(byDate).sort();
    hourlyDate = dates.length ? dates[dates.length-1] : null;
    labels = Array.from({length:24}, (_,h)=> pad(h)+':00');
    stepsVals = hourlyDate ? byDate[hourlyDate] : Array(24).fill(null);
  } else {
    const n=stepsRange; const ls=[];
    for(let i=n-1;i>=0;i--) ls.push(daysAgoISO(i));
    labels = ls.map(d=>shortDay(d));
    stepsVals = ls.map(d=> stepMap[d]!=null?Math.round(stepMap[d]):null);
  }

  const validSteps = stepsVals.filter(v=>v!=null);
  const avg = validSteps.length?Math.round(validSteps.reduce((a,b)=>a+b,0)/validSteps.length):null;

  if(stepsRange===1){
    const tot = validSteps.reduce((a,b)=>a+b,0);
    $('stepsSub').textContent = hourlyDate
      ? tot.toLocaleString()+' steps · hourly · '+(hourlyDate===todayISO()?'today':hourlyDate)
      : 'No hourly data yet';
  } else {
    $('stepsSub').textContent = 'Avg: '+(avg!=null?avg.toLocaleString():'—')+' steps · '+stepsRange+'d window';
  }

  drawChart('chSteps', {
    type:'bar',
    data:{ labels, datasets:[{
      data:stepsVals,
      backgroundColor: validSteps.length? (
        // per-hour counts are far smaller than daily totals, so the
        // 5k/10k day thresholds only apply to the multi-day views
        stepsVals.map(v=> v==null? CSS('--border')+'88' :
          stepsRange===1 ? CSS('--energy')+'CC' :
          v<5000? CSS('--booze')+'CC' :
          v>10000? CSS('--food')+'CC' : CSS('--energy')+'CC')
      ) : CSS('--border')+'88',
      borderRadius:4, barPercentage:.72
    }]},
    options:{...baseOpts, scales:{...baseOpts.scales, y:{...gridOpt, suggestedMin:0,
      title:{display:true,text:'steps',color:CSS('--faint'),font:{size:9}}}}}
  });
}
