// Entry point: wires DOM listeners and kicks off the first load.
import { sb } from './config.js';
import { $, todayISO } from './utils.js';
import { signIn, showApp } from './auth.js';
import { switchTab } from './nav.js';
import './quicklog.js';

/* ---- auth ---- */
$('signinBtn').addEventListener('click', signIn);
$('pw').addEventListener('keydown', e => { if(e.key==='Enter') signIn(); });
$('email').addEventListener('keydown', e => { if(e.key==='Enter') $('pw').focus(); });
$('signoutBtn').addEventListener('click', async ()=>{ await sb.auth.signOut(); location.reload(); });

/* ---- floating refresh ---- */
$('fabRefresh').addEventListener('click', ()=>{
  const b=$('fabRefresh'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
  const active = document.querySelector('.bn-tab.active');
  if (active) switchTab(active.dataset.tab, true);
});

/* ---- boot ---- */
(async function boot(){
  const { data } = await sb.auth.getSession();
  if(data.session) showApp();
})();