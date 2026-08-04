import { sb, SEED_PROJECTS } from './config.js';
import { $, escapeHtml, timeAgo, domainOf, todayISO, daysAgoISO, budDay, CSS } from './utils.js';

import { drawChart, gridOpt, baseOpts } from './charts.js';

export async function renderBriefing(){
  try{
    const { data, error } = await sb.from('briefings').select('*').order('day',{ascending:false}).limit(1);
    if(error || !data || !data.length){ $('briefCard').classList.add('hidden'); return; }
    const b = data[0];
    const fresh = b.day === todayISO();
    $('briefHead').textContent = (fresh?'Today':'Latest')+' briefing · '+b.day;
    $('briefHeadline').textContent = b.headline || '';
    $('briefBody').textContent = b.body || '';
    if(b.focus){ $('briefFocus').textContent = b.focus; $('briefFocus').classList.remove('hidden'); }
    else $('briefFocus').classList.add('hidden');
    $('briefCard').classList.remove('hidden');
  }catch(e){ $('briefCard').classList.add('hidden'); }
}

export async function renderInsights(){
  const ICO = { correlation:'🔗', streak:'🔥', warning:'⚠️' };
  try{
    const { data, error } = await sb.from('insights').select('*').order('created_at',{ascending:false}).limit(6);
    if(error || !data || !data.length){
      $('insightList').innerHTML = '<div class="empty">No insights yet — Hermes computes them weekly from your logs.</div>'; return;
    }
    $('insightList').innerHTML = data.map(i=>`<div class="insight">
      <span class="i-ico">${ICO[i.kind]||'💡'}</span><span>${i.text}</span></div>`).join('');
  }catch(e){ $('insightList').innerHTML = '<div class="empty">—</div>'; }
}

export async function renderFeed(){
  try{
    const { data, error } = await sb.from('feed_items').select('*')
      .gte('day', daysAgoISO(1)).order('day',{ascending:false}).order('sort_order').limit(8);
    if(error || !data || !data.length){
      $('feedList').innerHTML = '<div class="empty">No items yet — the daily world-feed cron fills this at 07:00.</div>'; return;
    }
    $('feedSub').textContent = 'Curated by Hermes · '+data[0].day;
    $('feedList').innerHTML = data.map(f=>`<div class="feed">
      <span class="feed-cat">${f.category||'item'}</span>
      <div class="feed-body"><div class="feed-title">${f.url?`<a href="${f.url}" target="_blank" rel="noopener">${f.title}</a>`:f.title}</div>
      ${f.detail?`<div class="feed-detail">${f.detail}</div>`:''}</div></div>`).join('');
  }catch(e){ $('feedList').innerHTML = '<div class="empty">—</div>'; }
}

export async function renderProjects(){
  let rows = SEED_PROJECTS;
  try {
    const { data, error } = await sb.from('projects').select('*').order('sort_order');
    if(!error && data && data.length) rows = data;
  } catch(e){ /* table missing — keep seed data */ }

  if(!rows || !rows.length){ $('projList').innerHTML = '<div class="empty">No projects yet</div>'; return; }

  const card = p => {
    const tasks = p.tasks || [];
    const doneN = tasks.filter(t=>t.done).length;
    const openN = tasks.length - doneN;
    const prdPct = p.prdPct!=null ? p.prdPct : (tasks.length ? Math.round(doneN/tasks.length*100) : null);
    const tiles = [
      { label:'Commits', value:'…', sub:'last 14d', id:'pa-tot-'+p.key },
      { label:'Streak', value:'…', sub:'active days', id:'pa-str-'+p.key },
      { label:'Open tasks', value: tasks.length?String(openN):'—', sub:'to PRD' }
    ];
    const metrics = tiles.map(m=>`<div class="proj-m"><div class="pm-lab">${m.label}</div>
      <div class="pm-val" id="${m.id||''}" style="color:${p.color||'var(--text)'}">${m.value}</div>
      ${m.sub?`<div class="pm-sub">${m.sub}</div>`:''}</div>`).join('');
    const tasksHtml = tasks.length ? `<div class="proj-tasks">${tasks.map(t=>`<div class="ptask ${t.done?'done':'todo'}"><span class="mk">✓</span>${t.t}</div>`).join('')}</div>` : '';
    const prdHtml = prdPct!=null ? `<div class="proj-prd"><div class="proj-prd-top"><span>PRD progress</span><b>${prdPct}%</b></div>
      <div class="bar"><i style="width:${prdPct}%;background:${prdPct>=85?CSS('--food'):prdPct>=60?CSS('--weight'):CSS('--booze')}"></i></div></div>` : '';
    const actHtml = p.repo ? `<div class="proj-act"><div class="proj-act-top"><span>Commits / day · last 14d</span></div>
      <div class="chartbox" style="height:64px"><canvas id="pa-${p.key}"></canvas></div></div>` : '';
    const link = p.url ? `<a class="proj-link" href="${p.url}" target="_blank" rel="noopener">↗ ${p.link_label||'Open'}</a>` : '';
    return `<div class="proj">
      <div class="proj-head"><div class="proj-name"><span class="proj-dot" style="background:${p.color||'var(--energy)'}"></span>${p.name}</div>
        ${p.stage?`<span class="proj-stage">${p.stage}</span>`:''}</div>
      ${prdHtml}${tasksHtml}
      <div class="proj-metrics">${metrics}</div>
      ${actHtml}${link}
    </div>`;
  };
  $('projList').innerHTML = rows.map(card).join('');
  rows.forEach(p=>{ if(p.repo) fetchProjectActivity(p.repo, p.key); });
}

export async function fetchProjectActivity(repo, key){
  const cv = $('pa-'+key); if(!cv) return;
  try{
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100`, {headers:{'Accept':'application/vnd.github+json'}});
    if(!r.ok) throw 0;
    const arr = await r.json();
    if(!Array.isArray(arr) || !arr.length) return;
    // Both sides of this bucketing must be Budapest days. Building the day list
    // from local midnight and then calling toISOString() yielded the *UTC* date
    // of local midnight — one day early for the whole list — while commit dates
    // were sliced as raw UTC, so the two never lined up.
    const days=[]; for(let i=13;i>=0;i--) days.push(daysAgoISO(i));
    const c={}; days.forEach(d=>c[d]=0);
    arr.forEach(it=>{ const a=it.commit&&it.commit.author&&it.commit.author.date; const cm=it.commit&&it.commit.committer&&it.commit.committer.date; const ts=a||cm; if(!ts) return; const ds=budDay(ts); if(ds in c) c[ds]++; });
    const data = days.map(d=>c[d]);
    const total = arr.length>=100 ? '100+' : arr.length;
    const streak = data.filter(v=>v>0).length;
    const totEl=$('pa-tot-'+key); if(totEl) totEl.textContent=total;
    const strEl=$('pa-str-'+key); if(strEl) strEl.textContent=streak;
    drawChart('pa-'+key, { type:'bar', data:{ labels:days.map(d=>d.slice(8,10)), datasets:[{ data, backgroundColor:CSS('--energy')+'CC', borderRadius:3, barPercentage:.7 }] },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:CSS('--surface2'), borderColor:CSS('--border'), borderWidth:1, titleColor:CSS('--text'), bodyColor:CSS('--dim'), padding:9, displayColors:false } },
        scales:{ x:{grid:{display:false}}, y:{...gridOpt, suggestedMin:0} } } });
  } catch(e){ /* rate-limited or offline — leave placeholders */ }
}

/* ---- Hacker News (public API, no key needed) ---- */

export async function renderNews(){
  try{
    const idsR = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if(!idsR.ok) throw new Error('topstories fetch failed');
    const ids = (await idsR.json()).slice(0,8);
    const items = await Promise.all(ids.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r=>r.json())
    ));
    const rows = items.filter(Boolean).map((it,i)=>{
      const link = it.url || `https://news.ycombinator.com/item?id=${it.id}`;
      const dom = it.url ? domainOf(it.url) : null;
      return `<div class="news-item"><div class="news-rank">${i+1}</div>
        <div class="news-body">
          <a class="news-title" href="${link}" target="_blank" rel="noopener">${escapeHtml(it.title||'(untitled)')}</a>
          <div class="news-meta">${it.score??0} pts · <a href="https://news.ycombinator.com/item?id=${it.id}" target="_blank" rel="noopener">${it.descendants??0} comments</a>${dom?' · '+escapeHtml(dom):''} · ${timeAgo(it.time)}</div>
        </div></div>`;
    });
    $('newsList').innerHTML = rows.join('') || '<div class="empty">No stories</div>';
  } catch(e){
    $('newsList').innerHTML = '<div class="empty">Couldn\'t load Hacker News</div>';
  }
}

/* resize charts when a collapsed section is opened (canvases init at 0x0 inside closed <details>) */
