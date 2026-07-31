// Supabase connection + seed data used until the matching tables exist.
export const SUPABASE_URL = "https://btuoukuuywqmfubjslkv.supabase.co";
export const SUPABASE_KEY = "sb_publishable_Do59CopoxJCpS8B6NVA2Rg_lvxpiU53";
export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ========= PROJECT SEED (used until a 'projects' table exists in Supabase) ========= */
export const SEED_PROJECTS = [
  {
    key:'barsport',
    name:'BarSport',
    color:'#3B82F6',
    stage:'Beta · Manual QA',
    prdPct:80,
    repo:'Swatopluke/barsport4',
    url:'https://github.com/Swatopluke/barsport4',
    link_label:'Repo',
    tasks:[
      { t:'Core darts & match flow', done:true },
      { t:'Deep-link web match flow', done:true },
      { t:'Manual QA sweep (pre-beta)', done:false },
      { t:'Offline mode full verify', done:false },
      { t:'Elo / XP / badge DB triggers', done:false }
    ]
  }
];

export const SEED_EVENTS = [
  { title:'Sziget Festival', start:'2026-08-09', end:'2026-08-15', location:'Budapest, HU', note:'5-day pass · Island of Freedom' }
];
