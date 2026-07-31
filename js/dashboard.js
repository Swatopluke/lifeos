import { sb } from './config.js';
import { $, toast, todayISO, daysAgoISO, shortDay, budaFmt, budaDay, budDay, CSS } from './utils.js';
import { drawChart, gridOpt, baseOpts } from './charts.js';
import { loadHistory } from './history.js';
import { renderBriefing, renderInsights, renderFeed, renderProjects,
         renderCalendar, renderNews } from './cards.js';

export async function loadAll(){
  const since = daysAgoISO(27);          // 28d window: 14d charts + week-vs-week deltas
  const sinceTs = since+'T00:00:00Z';

  const [sleepR, bodyR, stateR, intakeR, mealR, suppR, slogR, goalR, trainR] = await Promise.all([
    sb.from('sleep').select('night_of,hours_asleep,quality,awakenings,sleep_paralysis,deep_h,rem_h,core_h,awake_h').gte('night_of',since).order('night_of'),
    sb.from('body_metrics').select('measured_on,weight_kg,neck_cm').gte('measured_on',daysAgoISO(59)).order('measured_on'),
    sb.from('daily_state').select('day,energy,mood,stress,steps').gte('day',since).order('day'),
    sb.from('intake').select('taken_at,kind,quantity,mg_nicotine,mg_caffeine,alcohol_units,subtype,kcal').gte('taken_at',sinceTs),
    sb.from('meals').select('eaten_at,kcal,protein_g,carbs_g,fat_g').gte('eaten_at',sinceTs),
    sb.from('supplements').select('*').order('name'),
    sb.from('supplement_log').select('supplement_id,taken_at').gte('taken_at',todayISO()+'T00:00:00Z'),
    sb.from('goals').select('*').eq('active',true),
    sb.from('training').select('trained_at,created_at,session_type,duration_min,rpe').gte('created_at',sinceTs).order('created_at')
  ]);

  const err = [sleepR,bodyR,stateR,intakeR,mealR,suppR,slogR,goalR].find(r=>r.error);
  if(err){ toast('Load error: '+err.error.message, true); return; }

  const days=[]; for(let i=13;i>=0;i--) days.push(daysAgoISO(i));
  // Bucket by the BUDAPEST date of each timestamp (machine TZ is CEST, so days[] are Budapest days).
  // Without this, UTC timestamps near midnight get bucketed to the wrong day and "today" reads 0.
  const byDay = (rows, key) => { const m={}; rows.forEach(r=>{ const d=budDay(r[key]); if(d) (m[d]=m[d]||[]).push(r); }); return m; };

  const sleepMap  = Object.fromEntries((sleepR.data||[]).map(r=>[r.night_of,r]));
  const stateMap  = Object.fromEntries((stateR.data||[]).map(r=>[r.day,r]));
  const intakeMap = byDay(intakeR.data||[], 'taken_at');
  const mealMap   = byDay(mealR.data||[], 'eaten_at');

  const labels = days.map(shortDay);
  const sleepH = days.map(d => sleepMap[d]?.hours_asleep ?? null);

  const sumBy = (d,f) => (intakeMap[d]||[]).reduce((a,r)=>a+f(r),0);
  const snus  = days.map(d => sumBy(d, r=> r.kind==='snus' ? (+r.quantity||0):0));
  const booze = days.map(d => sumBy(d, r=> r.kind==='alcohol' ? (+r.alcohol_units||0):0));
  const alcCount = days.map(d => (intakeMap[d]||[]).filter(r=>r.kind==='alcohol').length);
  const caf   = days.map(d => sumBy(d, r=> r.kind==='caffeine' ? (+r.mg_caffeine||0):0));
  const cafCoffee = days.map(d => sumBy(d, r=> r.kind==='caffeine' && r.subtype==='coffee' ? (+r.mg_caffeine||0):0));
  const cafGreen  = days.map(d => sumBy(d, r=> r.kind==='caffeine' && r.subtype==='green_tea' ? (+r.mg_caffeine||0):0));
  const cafMatcha = days.map(d => sumBy(d, r=> r.kind==='caffeine' && r.subtype==='matcha' ? (+r.mg_caffeine||0):0));
  // Drinks carry their own kcal on the intake row, so food value = meals + drinks.
  const intakeKcal = days.map(d => sumBy(d, r=> +r.kcal||0));
  const kcal  = days.map((d,i) => (mealMap[d]||[]).reduce((a,r)=>a+(+r.kcal||0),0) + intakeKcal[i]);
  const prot  = days.map(d => (mealMap[d]||[]).reduce((a,r)=>a+(+r.protein_g||0),0));
  const carbs = days.map(d => (mealMap[d]||[]).reduce((a,r)=>a+(+r.carbs_g||0),0));
  const fat   = days.map(d => (mealMap[d]||[]).reduce((a,r)=>a+(+r.fat_g||0),0));

  const today = todayISO();
  $('cnt-snus').textContent   = snus[13]||0;
  $('cnt-caf').textContent    = (intakeMap[today]||[]).filter(r=>r.kind==='caffeine' && r.subtype==='coffee').length||0;
  $('cnt-greencaf').textContent = (intakeMap[today]||[]).filter(r=>r.kind==='caffeine' && r.subtype==='green_tea').length||0;
  $('cnt-matchacaf').textContent = (intakeMap[today]||[]).filter(r=>r.kind==='caffeine' && r.subtype==='matcha').length||0;
  $('cnt-booze').textContent  = alcCount[13]||0;

  /* ---- stat strip ---- */
  const validSleep = sleepH.filter(v=>v!=null);
  const avgSleep = validSleep.length ? (validSleep.reduce((a,b)=>a+b,0)/validSleep.length) : null;
  const bodyRows = (bodyR.data||[]).filter(r=>r.weight_kg!=null);
  const latestW = bodyRows.length ? bodyRows[bodyRows.length-1].weight_kg : null;
  const firstW  = bodyRows.length ? bodyRows[0].weight_kg : null;
  const lastCaf = (intakeMap[today]||[]).filter(r=>r.kind==='caffeine')
                   .map(r=>new Date(r.taken_at)).sort((a,b)=>b-a)[0];
  const dryDays = (()=>{ let n=0; for(let i=13;i>=0;i--){ if((booze[i]||0)>0) break; n++; } return n; })();

  $('statStrip').innerHTML = [
    ['Avg sleep', avgSleep!=null ? avgSleep.toFixed(1)+'h' : '—', '14-day', '--sleep'],
    ['Weight', latestW!=null ? latestW.toFixed(1) : '—',
      (latestW!=null&&firstW!=null&&latestW!==firstW) ? ((latestW-firstW>0?'+':'')+(latestW-firstW).toFixed(1)+' kg') : 'to 90kg', '--weight'],
    ['Caffeine', caf[13] ? Math.round(caf[13])+'mg' : '0mg',
      '☕'+(Math.round(cafCoffee[13]||0))+'mg · 🍵'+(Math.round(cafGreen[13]||0))+'mg · 🍃'+(Math.round(cafMatcha[13]||0))+'mg', '--caf'],
    ['Dry days', dryDays, 'streak', '--food'],
    ['Protein', prot[13] ? Math.round(prot[13])+'g' : '0g', 'of 170g', '--food'],
    ['Carbs', carbs[13] ? Math.round(carbs[13])+'g' : '0g', 'of 220g', '--weight'],
    ['Fat', fat[13] ? Math.round(fat[13])+'g' : '0g', 'of 70g', '--booze'],
    ['Kcal', kcal[13] ? Math.round(kcal[13]) : '0', 'of 2100', '--energy'],
  ].map(([l,v,s,c])=>`<div class="stat"><div class="s-lab">${l}</div>
      <div class="s-val" style="color:${CSS(c)}">${v}</div><div class="s-sub">${s}</div></div>`).join('');

  /* ---- charts ---- */
  const qCol = d => { const q = sleepMap[d]?.quality;
    if(q==null) return CSS('--sleep')+'CC';
    return q>=4 ? CSS('--food')+'CC' : q<=2 ? CSS('--booze')+'CC' : CSS('--sleep')+'CC'; };
  drawChart('chSleep', { type:'bar', data:{ labels, datasets:[{
      data:sleepH, backgroundColor:days.map(qCol), borderRadius:4, barPercentage:.72 }]},
    options:{...baseOpts,
      plugins:{...baseOpts.plugins, tooltip:{...baseOpts.plugins.tooltip, callbacks:{
        afterBody:(items)=>{ const r=sleepMap[days[items[0].dataIndex]]; if(!r) return '';
          const p=[]; if(r.quality!=null)p.push('quality '+r.quality+'/5');
          if(r.awakenings!=null)p.push(r.awakenings+' awakenings');
          if(r.sleep_paralysis)p.push('⚠ paralysis'); return p.join(' · '); } }}},
      scales:{...baseOpts.scales, y:{...gridOpt, suggestedMin:0, suggestedMax:9}}}});

  const wLabels = (bodyR.data||[]).map(r=>shortDay(r.measured_on));
  drawChart('chWeight', { type:'line', data:{ labels:wLabels.length?wLabels:['—'], datasets:[{
      data:bodyRows.map(r=>r.weight_kg), borderColor:CSS('--weight'), backgroundColor:CSS('--weight')+'22',
      fill:true, tension:.32, pointRadius:3, pointBackgroundColor:CSS('--weight'), borderWidth:2 }]},
    options:{...baseOpts, scales:{...baseOpts.scales, y:{...gridOpt, suggestedMin:88}}}});

  drawChart('chStages', {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Deep', data:days.map(d=>(sleepMap[d]?.deep_h)||0), backgroundColor:CSS('--sleep')+'CC', borderRadius:3, stack:'s', barPercentage:.7 },
      { label:'REM', data:days.map(d=>(sleepMap[d]?.rem_h)||0), backgroundColor:CSS('--energy')+'CC', borderRadius:3, stack:'s', barPercentage:.7 },
      { label:'Core', data:days.map(d=>(sleepMap[d]?.core_h)||0), backgroundColor:CSS('--dim')+'CC', borderRadius:3, stack:'s', barPercentage:.7 },
      { label:'Awake', data:days.map(d=>(sleepMap[d]?.awake_h)||0), backgroundColor:CSS('--booze')+'CC', borderRadius:3, stack:'s', barPercentage:.7 }
    ]},
    options:{...baseOpts,
      plugins:{...baseOpts.plugins, legend:{display:true, labels:{boxWidth:9,boxHeight:9,padding:11,usePointStyle:true,pointStyle:'circle'}}},
      scales:{ x:{...gridOpt, grid:{display:false}, stacked:true },
               y:{...gridOpt, stacked:true, position:'left', title:{display:true,text:'hours',color:CSS('--faint'),font:{size:9}}}}}
  });

  drawChart('chIntake', { data:{ labels, datasets:[
      { type:'bar', label:'Snus', data:snus, backgroundColor:CSS('--snus')+'CC', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'bar', label:'Alcohol', data:booze, backgroundColor:CSS('--booze')+'CC', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'bar', label:'☕ Coffee', data:cafCoffee, backgroundColor:'#9B5DE5CC', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'bar', label:'🍵 Green tea', data:cafGreen, backgroundColor:CSS('--food')+'CC', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'bar', label:'🍃 Matcha', data:cafMatcha, backgroundColor:'#C77DFFCC', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'bar', label:'Caffeine/50', data:caf.map(v=>+(v/50).toFixed(1)), backgroundColor:'rgba(255,255,255,0.25)', borderRadius:3, stack:'a', barPercentage:.7 },
      { type:'line', label:'Sleep h', data:sleepH, borderColor:CSS('--sleep'), borderWidth:2,
        tension:.3, pointRadius:2, yAxisID:'y1', spanGaps:true }
    ]},
    options:{...baseOpts,
      plugins:{...baseOpts.plugins, legend:{display:true, labels:{boxWidth:9, boxHeight:9, padding:11, usePointStyle:true, pointStyle:'circle'}}},
      scales:{ x:{...gridOpt, grid:{display:false}, stacked:true },
               y:{...gridOpt, stacked:true, position:'left'},
               y1:{...gridOpt, position:'right', grid:{display:false}, suggestedMin:0, suggestedMax:10} }}});

  drawChart('chFood', { data:{ labels, datasets:[
      { type:'bar', label:'kcal', data:kcal, backgroundColor:CSS('--energy')+'99', borderRadius:3, barPercentage:.7 },
      { type:'line', label:'protein', data:prot, borderColor:CSS('--food'), borderWidth:2, tension:.3, pointRadius:2, yAxisID:'y1' },
      { type:'bar', label:'carbs', data:carbs, backgroundColor:CSS('--weight')+'99', borderRadius:3, stack:'f', barPercentage:.7 },
      { type:'bar', label:'fat', data:fat, backgroundColor:CSS('--booze')+'99', borderRadius:3, stack:'f', barPercentage:.7 }
    ]},
    options:{...baseOpts, scales:{ x:{...gridOpt, grid:{display:false}},
      y:{...gridOpt, suggestedMax:2600}, y1:{...gridOpt, position:'right', grid:{display:false}, suggestedMax:200} }}});

  /* ---- stimulant clearance ---- */
  const now = Date.now();
  const HN = 2.0, HC = 5.0, HA = 1.5;     // half-lives (h): nicotine, caffeine, alcohol
  const decay = (mg0, t0, tHalf, h) => mg0 * Math.pow(0.5, (h - t0)/tHalf);
  const todayBuda = budaDay.format(new Date(now));   // budaFmt/budaDay: module scope
  // build hourly x-axis from -6h .. +18h around now
  const stimH = [];
  for (let h = -6; h <= 18; h++) stimH.push(h);
  const nowIdx = stimH.indexOf(0);            // index of the 'now' tick
  // bottom labels = exact Budapest clock hours for each instant (now + h hours)
  const labStim = stimH.map(h => {
    const t = new Date(now + h*3600000);
    const hhmm = budaFmt.format(t);
    const diff = Math.round((new Date(budaDay.format(t)+'T00:00:00').getTime()
              - new Date(todayBuda+'T00:00:00').getTime())/86400000);
    const tag = diff===0 ? '' : (diff>0 ? ' +'+diff+'d' : ' '+diff+'d');
    return h===0 ? 'now '+hhmm : hhmm+tag;
  });
  // reference: 13mg snus (≈6.5mg nicotine) + 95mg caffeine + 2 alcohol units at h=0
  const refNic = stimH.map(h => h<0 ? 0 : 6.5 * Math.pow(0.5, h/HN));
  const refCaf = stimH.map(h => h<0 ? 0 : 95  * Math.pow(0.5, h/HC));
  const refAlc = stimH.map(h => h<0 ? 0 : 2   * Math.pow(0.5, h/HA));
  // live: sum all logged doses projected onto this axis
  const liveNic = stimH.map(()=>0), liveCaf = stimH.map(()=>0), liveAlc = stimH.map(()=>0);
  (intakeR.data||[]).forEach(r=>{
    const t0 = (new Date(r.taken_at).getTime() - now)/3600000;  // hours relative to now
    const mgN = r.kind==='snus' ? (+r.mg_nicotine||0) : 0;
    const mgC = (r.kind==='caffeine' || r.kind==='coffee' || r.kind==='green_tea' || r.kind==='matcha') ? (+r.mg_caffeine||0) : 0;
    const uA  = r.kind==='alcohol' ? (+r.alcohol_units||0) : 0;
    stimH.forEach((h,i)=>{ if(h>=t0){
      if(mgN>0) liveNic[i]+=decay(mgN,t0,HN,h);
      if(mgC>0) liveCaf[i]+=decay(mgC,t0,HC,h);
      if(uA>0)  liveAlc[i]+=decay(uA,t0,HA,h);
    }});
  });
  // inline plugin: vertical line marking the current state ('now')
  const nowLine = {
    id:'nowLine',
    afterDatasetsDraw(chart){
      const x = chart.scales.x.getPixelForValue(nowIdx);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = CSS('--energy');
      ctx.setLineDash([4,4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CSS('--energy');
      ctx.font = '600 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('now', x, Math.max(top + 9, top - 4));
      ctx.restore();
    }
  };
  drawChart('chStim', { data:{ labels:labStim, datasets:[
      { type:'line', label:'Your nicotine (total)', data:liveNic, borderColor:CSS('--snus'), backgroundColor:CSS('--snus')+'22',
        fill:true, tension:.3, pointRadius:0, borderWidth:2.5, yAxisID:'yN' },
      { type:'line', label:'Your caffeine (total)', data:liveCaf, borderColor:CSS('--caf'), backgroundColor:CSS('--caf')+'22',
        fill:true, tension:.3, pointRadius:0, borderWidth:2.5, yAxisID:'yC' },
      { type:'line', label:'Your alcohol (total)', data:liveAlc, borderColor:CSS('--booze'), backgroundColor:CSS('--booze')+'22',
        fill:true, tension:.3, pointRadius:0, borderWidth:2.5, yAxisID:'yA' },
      { type:'line', label:'Ref nicotine (13mg single)', data:refNic, borderColor:CSS('--snus'), borderWidth:1,
        borderDash:[5,4], pointRadius:0, tension:.3, yAxisID:'yN' },
      { type:'line', label:'Ref caffeine (95mg single)', data:refCaf, borderColor:CSS('--caf'), borderWidth:1,
        borderDash:[5,4], pointRadius:0, tension:.3, yAxisID:'yC' },
      { type:'line', label:'Ref alcohol (2u single)', data:refAlc, borderColor:CSS('--booze'), borderWidth:1,
        borderDash:[5,4], pointRadius:0, tension:.3, yAxisID:'yA' }
    ]},
    options:{...baseOpts, plugins:{...baseOpts.plugins,
      tooltip:{ callbacks:{
        afterLabel(ctx){ if(ctx.datasetIndex<3){ const val=ctx.parsed.y; return val>0.1?Math.round(val*10)/10+' mg':''; }}}},
      legend:{display:true, labels:{boxWidth:9, boxHeight:9, padding:8, usePointStyle:true, pointStyle:'circle'}}},
      scales:{ x:{...gridOpt, grid:{display:false}, ticks:{maxTicksLimit:8}},
               yN:{...gridOpt, position:'left', suggestedMin:0,
                   suggestedMax: Math.max(10, Math.ceil((Math.max(0,...liveNic,...refNic))*1.15/5)*5),
                   title:{display:true, text:'nicotine (mg)', color:CSS('--snus'), font:{size:9}},
                   ticks:{color:CSS('--snus'), font:{size:9}} },
               yC:{...gridOpt, position:'right', suggestedMin:0,
                   suggestedMax: Math.max(120, Math.ceil((Math.max(0,...liveCaf,...refCaf))*1.15/20)*20),
                   grid:{display:false},
                   title:{display:true, text:'caffeine (mg)', color:CSS('--caf'), font:{size:9}},
                   ticks:{color:CSS('--caf'), font:{size:9}} },
               yA:{...gridOpt, position:'right', suggestedMin:0, display:false,
                   suggestedMax: Math.max(4, Math.ceil(Math.max(0,...liveAlc,...refAlc)*1.15)) } }},
    plugins:[nowLine]
  });

  drawChart('chState', { type:'line', data:{ labels, datasets:[
      { label:'Energy', data:days.map(d=>stateMap[d]?.energy ?? null), borderColor:CSS('--energy'),
        borderWidth:2, tension:.3, pointRadius:2, spanGaps:true },
      { label:'Mood', data:days.map(d=>stateMap[d]?.mood ?? null), borderColor:CSS('--weight'),
        borderWidth:2, tension:.3, pointRadius:2, spanGaps:true },
      { label:'Stress', data:days.map(d=>stateMap[d]?.stress ?? null), borderColor:CSS('--booze'),
        borderWidth:2, tension:.3, pointRadius:2, spanGaps:true, borderDash:[4,3] }
    ]},
    options:{...baseOpts, plugins:{...baseOpts.plugins,
      legend:{display:true, labels:{boxWidth:9,boxHeight:9,padding:11,usePointStyle:true,pointStyle:'circle'}}},
      scales:{...baseOpts.scales, y:{...gridOpt, suggestedMin:0, suggestedMax:10}}}});

  /* ---- supplements ---- */
  const takenIds = new Set((slogR.data||[]).map(r=>r.supplement_id));
  $('suppList').innerHTML = (suppR.data||[]).map(s=>`
    <div class="supp ${s.active?'':'inactive'}" data-sid="${s.id}" data-active="${s.active}">
      <div class="supp-check ${takenIds.has(s.id)?'on':''}">✓</div>
      <div style="flex:1">
        <div class="supp-name">${s.name}</div>
        <div class="supp-meta">${s.dose_amount?s.dose_amount+(s.dose_unit||''):''}${s.timing?' · '+s.timing:''}</div>
      </div>
      ${s.active?'':'<span class="pill-off">not started</span>'}
    </div>`).join('') || '<div class="empty">No supplements</div>';

  document.querySelectorAll('.supp').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const chk = el.querySelector('.supp-check');
      if(chk.classList.contains('on')) return;
      const { error } = await sb.from('supplement_log').insert({ supplement_id:+el.dataset.sid });
      if(error) return toast('Failed', true);
      chk.classList.add('on'); toast('Logged');
    });
  });

  /* ---- goals ---- */
  const cur = {
    weight_kg: latestW, protein_g: prot[13], kcal: kcal[13],
    hours_asleep: sleepH[13], alcohol_units: booze[13]
  };
  $('goalList').innerHTML = (goalR.data||[]).filter(g=>cur[g.metric]!=null).map(g=>{
    const v=+cur[g.metric], t=+g.target_value;
    let pct, col;
    if(g.direction==='decrease'){ pct = t===0 ? (v===0?100:0) : Math.max(0,Math.min(100,(1-(v-t)/Math.max(t,1))*100)); col=v<=t?'--food':'--booze'; }
    else { pct = Math.max(0,Math.min(100, t? v/t*100 : 0)); col = pct>=90?'--food':pct>=55?'--weight':'--booze'; }
    return `<div class="goal"><div class="goal-top"><span>${g.metric.replace(/_/g,' ')}</span>
      <b>${(+v).toFixed(v%1?1:0)}<span style="color:var(--faint)"> / ${t}${g.target_unit||''}</span></b></div>
      <div class="bar"><i style="width:${pct.toFixed(0)}%;background:${CSS(col)}"></i></div></div>`;
  }).join('') || '<div class="empty">Log today to see progress</div>';

  /* ---- week vs week deltas (uses full 28d fetch) ---- */
  (function(){
    const wk=[]; for(let i=27;i>=0;i--) wk.push(daysAgoISO(i));   // 28 days asc
    const thisW = wk.slice(21), lastW = wk.slice(14,21).concat(); // last 7 vs prior 7
    const prevW = wk.slice(14,21);
    const iSum = (ds,f)=>ds.reduce((a,d)=>a+(intakeMap[d]||[]).reduce((x,r)=>x+f(r),0),0);
    const mSum = (ds,f)=>ds.reduce((a,d)=>a+(mealMap[d]||[]).reduce((x,r)=>x+(+f(r)||0),0),0);
    const aUnits = ds=>iSum(ds, r=>r.kind==='alcohol'?(+r.alcohol_units||0):0);
    // food value = meals + drinks that carry kcal (alcohol)
    const kcalDay = ds=>(mSum(ds,r=>r.kcal) + iSum(ds,r=>+r.kcal||0))/7;
    const sAvg = ds=>{ const v=ds.map(d=>sleepMap[d]?.hours_asleep).filter(x=>x!=null); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; };
    const stSum = ds=>ds.reduce((a,d)=>a+(+ (stateMap[d]?.steps)||0),0);
    const rows = [
      ['Sleep avg', sAvg(thisW), sAvg(prevW), 'h', false],
      ['Snus', iSum(thisW,r=>r.kind==='snus'?(+r.quantity||0):0), iSum(prevW,r=>r.kind==='snus'?(+r.quantity||0):0), '', true],
      ['Alcohol', aUnits(thisW), aUnits(prevW), 'u', true],
      ['Caffeine', iSum(thisW,r=>r.kind==='caffeine'?(+r.mg_caffeine||0):0), iSum(prevW,r=>r.kind==='caffeine'?(+r.mg_caffeine||0):0), 'mg', true],
      ['Kcal/day', kcalDay(thisW), kcalDay(prevW), '', true],
      ['Steps', stSum(thisW), stSum(prevW), '', false]
    ];
    $('wkDeltas').innerHTML = rows.map(([lab,cur,prev,unit,lowerBetter])=>{
      const has = cur!=null && prev!=null && prev!==0;
      const diff = has ? cur-prev : null;
      const pct = has ? (diff/prev*100) : null;
      const good = diff==null||Math.abs(pct)<3 ? 'delta-flat' : ((diff<0)===lowerBetter ? 'delta-down' : 'delta-up');
      const arrow = diff==null||Math.abs(pct)<3 ? '→' : diff>0 ? '↑' : '↓';
      const fmt = v=> v==null?'—':(Math.abs(v)>=1000? Math.round(v).toLocaleString() : (+v).toFixed(v%1?1:0));
      return `<div class="stat"><div class="s-lab">${lab}</div>
        <div class="s-val">${fmt(cur)}${unit}</div>
        <div class="s-sub"><span class="delta ${good}">${arrow} ${pct==null?'':Math.abs(pct).toFixed(0)+'%'}</span> vs ${fmt(prev)}${unit}</div></div>`;
    }).join('');
  })();

  /* ---- training ---- */
  (function(){
    const rows = (trainR && !trainR.error && trainR.data) ? trainR.data : [];
    const dayOf = r => budDay((r.trained_at||r.created_at));
    const wk7=[]; for(let i=6;i>=0;i--) wk7.push(daysAgoISO(i));
    const last14 = days;                                  // existing 14d asc array
    const byD={}; rows.forEach(r=>{ const d=dayOf(r); (byD[d]=byD[d]||[]).push(r); });
    const mins14 = last14.map(d=>(byD[d]||[]).reduce((a,r)=>a+(+r.duration_min||0),0));
    const n7 = wk7.filter(d=>byD[d]).length;
    const minsWk = wk7.reduce((a,d)=>a+(byD[d]||[]).reduce((x,r)=>x+(+r.duration_min||0),0),0);
    const lastRow = rows.length ? rows[rows.length-1] : null;
    $('trSummary').textContent = rows.length
      ? `${n7} session${n7===1?'':'s'} this week · ${minsWk} min · last: ${lastRow.session_type||'?'}`
      : 'No sessions logged in 28 days — start small.';
    $('trWeek').innerHTML = wk7.map(d=>{
      const hit = !!byD[d];
      const lab = new Date(d+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2);
      return `<div class="tr-day ${hit?'hit':''}"><span>${lab}</span><span>${hit?'✓':''}</span></div>`;
    }).join('');
    drawChart('chTrain', { type:'bar', data:{ labels, datasets:[{
        data:mins14, backgroundColor:CSS('--food')+'CC', borderRadius:4, barPercentage:.7 }]},
      options:{...baseOpts, scales:{...baseOpts.scales, y:{...gridOpt, suggestedMin:0,
        title:{display:true,text:'min',color:CSS('--faint'),font:{size:9}}}}}});
  })();

  renderBriefing();
  renderInsights();
  renderFeed();
  renderProjects();
  renderCalendar();
  loadHistory();
  renderNews();
}

/* ---- long-range sleep & steps history (unlocked by the Apple Health backfill) ---- */
