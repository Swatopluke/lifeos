// DOM, date and formatting helpers shared across modules.
export const $ = id => document.getElementById(id);
export const todayISO = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
export const daysAgoISO = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
export const shortDay = iso => iso.slice(8,10)+'.'+iso.slice(5,7);

// Budapest formatters live at module scope: loadAll() buckets by Budapest date near
// the top of the function, so declaring these further down put them in the temporal
// dead zone and made every loadAll() call throw.
export const budaFmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Budapest',
  hour:'2-digit', minute:'2-digit', hour12:false });
export const budaDay = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Budapest',
  year:'numeric', month:'2-digit', day:'2-digit' });
export const budDay = ts => (ts ? budaDay.format(new Date(ts)) : '');

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
const domainOf = url => { try{ return new URL(url).hostname.replace(/^www\./,''); } catch(e){ return null; } };
