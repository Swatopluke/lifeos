import { sb } from './config.js';
import { $, todayISO } from './utils.js';
import { loadAll } from './dashboard.js';

export async function signIn(){
  const btn=$('signinBtn'), m=$('loginMsg');
  btn.disabled=true; m.className='msg'; m.textContent='';
  const { error } = await sb.auth.signInWithPassword({ email:$('email').value.trim(), password:$('pw').value });
  btn.disabled=false;
  if(error){ m.textContent = error.message; return; }
  showApp();
}

export function showApp(){
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('todayLabel').textContent = todayISO();
  loadAll();
}
