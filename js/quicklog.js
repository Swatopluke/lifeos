import { sb } from './config.js';
import { $, toast, daysAgoISO, todayISO } from './utils.js';
import { switchTab } from './nav.js';

// Dreher Gold (Hungarian lager) 5 dl @ 5% ABV is the default "Alcohol" tap.
// 500ml * 5% * 0.789 g/ml = 19.7g ethanol -> 1.97 units at the Hungarian 10g standard.
// It logs to `intake` like every other tap, carrying its own kcal, so one row is
// simultaneously an alcohol event (units, clearance curve, dry-day streak) AND food
// (kcal folded into the calorie totals). One source of truth, no cross-table joins.
export const DREHER = { kcal:198, units:+(500/1000*5*7.89/10).toFixed(2) };
export const QUICK = {
  snus:     { kind:'snus',      quantity:1, unit:'pouch', mg_nicotine:9 },
  coffee:   { kind:'caffeine',  quantity:1, unit:'cup',   subtype:'coffee', mg_caffeine:95 },
  green_tea:{ kind:'caffeine',  quantity:1, unit:'cup',   subtype:'green_tea', mg_caffeine:30 },
  matcha:   { kind:'caffeine',  quantity:1, unit:'serve', subtype:'matcha', mg_caffeine:70 },
  alcohol:  { kind:'alcohol',   quantity:1, unit:'can',   subtype:'dreher_gold',
              alcohol_units:DREHER.units, kcal:DREHER.kcal }
};
export const QUICK_TOAST = { alcohol:'Dreher Gold 5dl logged 🍺 ('+DREHER.kcal+' kcal)' };
// Counter each tap bumps. The re-render only lands after a full refetch and a
// chart redraw, which on a phone is slow enough to read as "nothing happened",
// so move the number immediately and roll it back if the insert fails.
export const QUICK_CNT = { snus:'cnt-snus', coffee:'cnt-caf', green_tea:'cnt-greencaf',
  matcha:'cnt-matchacaf', alcohol:'cnt-booze' };
document.querySelectorAll('[data-log]').forEach(b=>{
  b.addEventListener('click', async ()=>{
    if(b.dataset.busy) return;                  // a second tap mid-save would double-log
    b.dataset.busy='1';
    const key = b.dataset.log;
    const cnt = $(QUICK_CNT[key]), before = cnt && cnt.textContent;
    if(cnt) cnt.textContent = (+before||0)+1;
    const row = { ...QUICK[key], taken_at:new Date().toISOString(), source:'dashboard' };
    const { error } = await sb.from('intake').insert(row);
    delete b.dataset.busy;
    if(error){ if(cnt) cnt.textContent = before; return toast('Failed: '+error.message, true); }
    toast(QUICK_TOAST[key] || key+' logged');
    await refreshOverview();
  });
});

// Clear the shared cache before re-rendering, or the reload recomputes from the
// snapshot taken before this write and the counter never moves.
async function refreshOverview(){
  const { invalidateCache } = await import('./dashboard.js');
  invalidateCache();
  switchTab('overview', true);
}

/* ========= SHEET ========= */
$('openSheet').addEventListener('click', ()=>{ $('sl-date').value = daysAgoISO(1); $('sheetWrap').classList.remove('hidden'); });
$('sheetCancel').addEventListener('click', ()=> $('sheetWrap').classList.add('hidden'));
$('sheetWrap').addEventListener('click', e=>{ if(e.target.id==='sheetWrap') $('sheetWrap').classList.add('hidden'); });

export let curTab='sleep';
document.querySelectorAll('#sheetTabs button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('#sheetTabs button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); curTab=b.dataset.tab;
    ['sleep','meal','state','body','train'].forEach(t=>$('tab-'+t).classList.toggle('hidden', t!==curTab));
  });
});
let spVal=0;
document.querySelectorAll('#sl-sp button').forEach(b=>{
  b.addEventListener('click',()=>{ document.querySelectorAll('#sl-sp button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); spVal=+b.dataset.v; });
});

const num = el => { const v=$(el).value; return v===''?null:Number(v); };
const txt = el => { const v=$(el).value.trim(); return v===''?null:v; };

$('sheetSave').addEventListener('click', async ()=>{
  let table, row;
  if(curTab==='sleep'){
    table='sleep';
    row={ night_of:$('sl-date').value||daysAgoISO(1), hours_asleep:num('sl-hours'),
          quality:num('sl-q'), awakenings:num('sl-wake'),
          sleep_paralysis:!!spVal, deep_h:num('sl-deep'), rem_h:num('sl-rem'), core_h:num('sl-core'), awake_h:num('sl-awake'),
          notes:txt('sl-notes'), source:'dashboard' };
  } else if(curTab==='meal'){
    table='meals';
    row={ description:$('ml-desc').value.trim()||'meal', meal_type:$('ml-type').value,
          kcal:num('ml-kcal'), protein_g:num('ml-prot'), estimated:true, confidence:'medium' };
  } else if(curTab==='state'){
    table='daily_state';
    row={ day:todayISO(), energy:num('st-en'), mood:num('st-mo'), stress:num('st-str'),
          steps:num('st-steps'), reflection:txt('st-note'), source:'dashboard' };
  } else if(curTab==='body'){
    table='body_metrics';
    row={ measured_on:todayISO(), weight_kg:num('bd-w'), waist_cm:num('bd-waist'), neck_cm:num('bd-neck') };
  } else {
    table='training';
    row={ session_type:$('tr-type').value, duration_min:num('tr-min'),
          rpe:num('tr-rpe'), notes:txt('tr-note') };
  }
  const onConf = { sleep:'night_of', daily_state:'day', body_metrics:'measured_on' }[table];
  const q = onConf ? sb.from(table).upsert(row,{onConflict:onConf}) : sb.from(table).insert(row);
  const { error } = await q;
  if(error) return toast('Failed: '+error.message, true);
  $('sheetWrap').classList.add('hidden');
  toast('Saved');
  await refreshOverview();
});
