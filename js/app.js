// Entry point: wires DOM listeners and kicks off the first load.
import { sb } from './config.js';
import { $, todayISO } from './utils.js';
import { signIn, showApp } from './auth.js';
import { loadAll } from './dashboard.js';
import { loadHistory } from './history.js';
import './quicklog.js';

/* ---- auth ---- */
$('signinBtn').addEventListener('click', signIn);
$('pw').addEventListener('keydown', e => { if(e.key==='Enter') signIn(); });
$('email').addEventListener('keydown', e => { if(e.key==='Enter') $('pw').focus(); });
$('signoutBtn').addEventListener('click', async ()=>{ await sb.auth.signOut(); location.reload(); });

/* ---- floating refresh ---- */
$('fabRefresh').addEventListener('click', ()=>{
  const b=$('fabRefresh'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
  loadAll();
});

/* ---- collapsible sections remember their state ---- */
document.querySelectorAll('details.more').forEach(d=>{
  d.addEventListener('toggle', ()=>{ if(d.open) Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(e){} }); });
});

/* ---- boot ---- */
(async function boot(){
  const { data } = await sb.auth.getSession();
  if(data.session) showApp();
})();
