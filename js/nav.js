// Tab navigation + per-section lazy loading.
// Bottom nav clicks switch sections; each section loads its data on first visit.
import { $ } from './utils.js';
import { resizeAll } from './charts.js';

const LOADERS = {
  overview:  () => import('./dashboard.js').then(m => m.loadOverview()),
  sleep:     () => import('./dashboard.js').then(m => m.loadSleep()),
  body:      () => import('./dashboard.js').then(m => m.loadBody()),
  training:  () => import('./dashboard.js').then(m => m.loadTraining()),
  intake:    () => import('./dashboard.js').then(m => m.loadIntake()),
  world:     () => import('./dashboard.js').then(m => m.loadWorld()),
  calendar:  () => import('./calendar.js').then(m => m.loadCalendar()),
};

const loaded = new Set();

export function switchTab(name, force = false) {
  if (force) loaded.delete(name);

  document.querySelectorAll('.bn-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('section[data-section]').forEach(s => {
    s.classList.toggle('active', s.dataset.section === name);
  });

  if (!loaded.has(name)) {
    loaded.add(name);
    const fn = LOADERS[name];
    if (fn) fn();
  }

  // Chart.js canvases init at 0x0 inside display:none sections —
  // wait for display:block to take effect, then resize.
  setTimeout(() => resizeAll(), 80);
}

// Wire bottom-nav clicks
document.querySelectorAll('.bn-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});