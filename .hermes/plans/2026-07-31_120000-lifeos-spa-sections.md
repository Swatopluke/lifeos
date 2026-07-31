# LifeOS SPA — Section-Based Navigation

> **For Hermes:** Implement this plan task-by-task. Each task is self-contained.

**Goal:** Convert the single-scroll LifeOS dashboard into a sectioned SPA with tab navigation. Overview is home — it shows quick actions, stimulant clearance, and eating details at a glance. Deeper data (sleep, body, training, intake, world) lives in dedicated tabs.

**Architecture:** Single HTML file, no framework. A top nav bar with icon+label tabs controls which `<section>` is visible. Each section lazy-loads its own data from Supabase on first visit. Shared modules (`config.js`, `utils.js`, `charts.js`, `auth.js`) stay as-is. The log sheet (modal) remains globally accessible from any tab.

**Tech Stack:** Vanilla JS ES modules, Supabase JS client, Chart.js 4.4, existing CSS design system.

---

## Section Plan

| # | Tab | Icon | Content |
|---|-----|------|---------|
| 1 | **Overview** | 🏠 | Briefing, quick actions, stat strip, stimulant clearance, calories & protein chart, goals |
| 2 | **Sleep** | 😴 | Sleep chart (14d), sleep stages, intake-vs-sleep correlation, sleep log shortcut |
| 3 | **Body** | ⚖️ | Weight chart (60d), steps with range selector, energy & stress, week-vs-week deltas |
| 4 | **Training** | 🏋️ | Training chart (14d), week strip, session summary |
| 5 | **Intake** | 💊 | Supplements checklist, detailed intake breakdown, meal log history |
| 6 | **World** | 🌐 | World feed, projects, calendar, Hacker News, insights |

---

## Task 1: Add navigation bar HTML + CSS

**Objective:** Add a fixed top navigation bar that switches between sections.

**Files:**
- Modify: `index.html` (add nav bar after topbar, wrap content in sections)
- Modify: `css/styles.css` (nav bar styles, section visibility)

**Step 1: Add nav bar HTML**

Replace the current flat content inside `#app` with a nav bar + section wrappers. The nav sits between topbar and content:

```html
<!-- inside #app, right after the topbar -->
<nav class="nav" id="mainNav">
  <button class="nav-tab active" data-tab="overview"><span class="nav-ico">🏠</span><span>Overview</span></button>
  <button class="nav-tab" data-tab="sleep"><span class="nav-ico">😴</span><span>Sleep</span></button>
  <button class="nav-tab" data-tab="body"><span class="nav-ico">⚖️</span><span>Body</span></button>
  <button class="nav-tab" data-tab="training"><span class="nav-ico">🏋️</span><span>Training</span></button>
  <button class="nav-tab" data-tab="intake"><span class="nav-ico">💊</span><span>Intake</span></button>
  <button class="nav-tab" data-tab="world"><span class="nav-ico">🌐</span><span>World</span></button>
</nav>
```

Then wrap each logical group of content in `<section id="sec-OVERVIEW">` etc. The overview section gets the briefing, quick actions, stat strip, stimulant clearance, calories & protein, and goals. Sleep section gets sleep chart, sleep stages, intake-vs-sleep. Body section gets weight, steps, energy/stress, week-vs-week. Training section gets training chart, week strip. Intake section gets supplements, intake breakdown. World section gets feed, projects, calendar, HN, insights.

The log sheet modal stays at the bottom (outside sections, globally accessible).

**Step 2: Add nav CSS**

```css
/* ---- navigation ---- */
.nav{display:flex;gap:2px;margin:0 0 20px;overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:none;border-bottom:1px solid var(--border);padding-bottom:0}
.nav::-webkit-scrollbar{display:none}
.nav-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;
  background:transparent;border:none;border-bottom:2px solid transparent;
  color:var(--faint);font-size:11.5px;font-weight:600;white-space:nowrap;
  transition:color .15s,border-color .15s;letter-spacing:.02em}
.nav-tab:hover{color:var(--text)}
.nav-tab.active{color:var(--text);border-bottom-color:var(--text)}
.nav-tab .nav-ico{font-size:15px;line-height:1}
section[data-section]{display:none}
section[data-section].active{display:block}
```

**Verification:** Open `index.html` in a browser — nav bar renders, clicking tabs shows/hides sections. Overview is active by default.

---

## Task 2: Create `js/nav.js` — tab switching + lazy loading

**Objective:** Wire nav tab clicks to show the correct section and load its data on first visit.

**Files:**
- Create: `js/nav.js`
- Modify: `index.html` (add `<script type="module" src="js/nav.js"></script>` before `app.js`)

**Step 1: Write `js/nav.js`**

```js
// Tab navigation + per-section lazy loading.
import { $ } from './utils.js';

const LOADERS = {
  overview:  () => import('./dashboard.js').then(m => m.loadOverview()),
  sleep:     () => import('./dashboard.js').then(m => m.loadSleep()),
  body:      () => import('./dashboard.js').then(m => m.loadBody()),
  training:  () => import('./dashboard.js').then(m => m.loadTraining()),
  intake:    () => import('./dashboard.js').then(m => m.loadIntake()),
  world:     () => import('./dashboard.js').then(m => m.loadWorld()),
};

const loaded = new Set();

export function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('section[data-section]').forEach(s => s.classList.toggle('active', s.dataset.section === name));
  if (!loaded.has(name)) {
    loaded.add(name);
    const fn = LOADERS[name];
    if (fn) fn();
  }
}

// Wire nav clicks
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
```

**Step 2: Update `index.html`**

Add the nav module script before `app.js`:
```html
<script type="module" src="js/nav.js"></script>
<script type="module" src="js/app.js"></script>
```

**Step 3: Update `js/app.js` — call `switchTab('overview')` after auth**

In `showApp()`, replace `loadAll()` with:
```js
import { switchTab } from './nav.js';
// in showApp():
switchTab('overview');
```

**Verification:** After sign-in, overview tab loads. Clicking other tabs switches sections and triggers their loader.

---

## Task 3: Split `dashboard.js` into per-section loaders

**Objective:** Refactor the monolithic `loadAll()` into six exported functions: `loadOverview`, `loadSleep`, `loadBody`, `loadTraining`, `loadIntake`, `loadWorld`. Each fetches only the data it needs.

**Files:**
- Modify: `js/dashboard.js` (refactor into per-section exports)
- Modify: `js/quicklog.js` (update `loadAll()` calls to `loadOverview()`)

**Step 1: Extract shared data fetching**

Keep a shared 28-day fetch that all sections can reuse. On first call, fetch everything once and cache:

```js
let _cache = null;
async function getCache() {
  if (_cache) return _cache;
  const since = daysAgoISO(27);
  const sinceTs = since + 'T00:00:00Z';
  const [sleepR, bodyR, stateR, intakeR, mealR, suppR, slogR, goalR, trainR] = await Promise.all([...]); // same queries as current loadAll
  // ... same error check
  _cache = { sleepR, bodyR, stateR, intakeR, mealR, suppR, slogR, goalR, trainR, since };
  return _cache;
}
```

**Step 2: `loadOverview()`**

From the cache, render:
- Stat strip (same code as current lines 62-84)
- Stimulant clearance chart (same code as current lines 146-231)
- Calories & protein chart (`chFood`, lines 136-143)
- Goals (lines 267-280)
- Briefing card

Also wire quick-log buttons (they already work via `quicklog.js`).

**Step 3: `loadSleep()`**

From the cache, render:
- Sleep chart (`chSleep`, lines 87-98)
- Sleep stages chart (`chStages`, lines 106-118)
- Intake vs sleep chart (`chIntake`, lines 120-134)

**Step 4: `loadBody()`**

From the cache, render:
- Weight chart (`chWeight`, lines 100-104)
- Steps chart + range selector (move from `history.js` or call `loadHistory()`)
- Energy & stress chart (`chState`, lines 233-243)
- Week vs week deltas (lines 283-313)

**Step 5: `loadTraining()`**

From the cache, render:
- Training summary + chart + week strip (lines 316-338)

**Step 6: `loadIntake()`**

From the cache, render:
- Supplements checklist (lines 246-265)
- Detailed intake breakdown (a new simple table/chart showing today's caffeine sources, snus count, alcohol)

**Step 7: `loadWorld()`**

Render cards that don't need the 28d cache:
- `renderFeed()`, `renderProjects()`, `renderCalendar()`, `renderNews()`, `renderInsights()` (these already exist in `cards.js`)

**Step 8: Update `quicklog.js`**

Replace `import { loadAll } from './dashboard.js'` with `import { switchTab } from './nav.js'` and after a quick-log insert, call `switchTab('overview')` to refresh the overview (or call `loadOverview` directly if exported).

**Verification:** Each tab loads independently. Switching tabs shows the correct charts and data. Quick-log buttons still work and refresh the overview.

---

## Task 4: Move HTML content into sections

**Objective:** Restructure `index.html` so every content block lives inside the correct `<section data-section="...">`.

**Files:**
- Modify: `index.html`

**Step 1: Wrap content blocks**

Current flat structure under `#app`:
```
.topbar
.quick
.brief
.sec-h "Today's vitals" + .stats
.sec-h "Trends" + grid2 (sleep + weight)
.grid2 (steps + energy/stress)
.grid2 (training + week vs week)
.sec-h "Habits & intake" + grid2 (supplements + goals)
.grid2 (calories/protein + sleep stages)
.card.wide (stimulant clearance)
.sec-h "Deep dives" + details (intake vs sleep, insights)
.sec-h "Appendix" + details (feed, projects, calendar, HN)
```

Restructure to:
```html
<!-- OVERVIEW -->
<section data-section="overview" class="active">
  <!-- briefing, quick actions, stat strip, stimulant clearance, calories/protein chart, goals -->
</section>

<!-- SLEEP -->
<section data-section="sleep">
  <!-- sleep chart, sleep stages, intake vs sleep -->
</section>

<!-- BODY -->
<section data-section="body">
  <!-- weight, steps, energy/stress, week vs week -->
</section>

<!-- TRAINING -->
<section data-section="training">
  <!-- training chart, week strip -->
</section>

<!-- INTAKE -->
<section data-section="intake">
  <!-- supplements, detailed intake -->
</section>

<!-- WORLD -->
<section data-section="world">
  <!-- feed, projects, calendar, HN, insights -->
</section>
```

Move the section headers (`.sec-h`) inside their respective sections, or remove them since the nav bar now provides the category label. Keep `.sec-h` only where subsections need labeling within a tab.

**Specific assignments:**

**Overview (`sec-overview`):**
- `#briefCard` (briefing)
- `.quick` (quick actions)
- `.sec-h` "Today's vitals" + `#statStrip`
- `.card.wide` with stimulant clearance (`#chStim`)
- `.grid2` with calories & protein (`#chFood`) — keep the card, remove sleep stages from this grid
- `.grid2` with Goals card (move from Habits section)

**Sleep (`sec-sleep`):**
- Sleep chart card (`#chSleep`)
- Sleep stages card (`#chStages`)
- Intake vs sleep (`#chIntake`) from Deep Dives

**Body (`sec-body`):**
- Weight chart card (`#chWeight`)
- Steps card (`#chSteps`, `#stepsRange`)
- Energy & stress card (`#chState`)
- Week vs week card (`#wkDeltas`)

**Training (`sec-training`):**
- Training card (`#chTrain`, `#trSummary`, `#trWeek`)

**Intake (`sec-intake`):**
- Supplements card (`#suppList`)
- A new "Today's intake log" card showing detailed caffeine/snus/alcohol breakdown in a table

**World (`sec-world`):**
- World feed (`#feedList`)
- Projects (`#projList`)
- Calendar (`#calList`)
- Hacker News (`#newsList`)
- Insights (`#insightList`)

**Step 2: Keep modal + FAB outside sections**

The log sheet modal and refresh FAB stay at the end of `#app` (outside all sections) so they're always accessible.

Also move the "Log" quick button to open the sheet — it already works.

**Verification:** Open the app. Each tab shows only its content. No content from other tabs bleeds through. The log sheet opens from any tab.

---

## Task 5: Update `loadHistory()` for steps chart

**Objective:** The steps chart currently lives in `history.js` and is called from `loadAll()`. It needs to be callable from `loadBody()` and still support the range selector.

**Files:**
- Modify: `js/history.js` (export `loadHistory` — already exported)
- Modify: `js/dashboard.js` (call `loadHistory()` from `loadBody()`)

**Step 1:** In `loadBody()`, after rendering body charts, call `loadHistory()` which renders the steps chart. The range selector buttons in `#stepsRange` already wire themselves.

**Verification:** Clicking Body tab shows steps chart with range selector working.

---

## Task 6: Handle chart resizing on tab switch

**Objective:** Chart.js canvases inside hidden sections have zero dimensions. When a tab becomes visible, charts need `.resize()`.

**Files:**
- Modify: `js/nav.js` (call resize after switching)
- Modify: `js/charts.js` (export a `resizeAll()` helper)

**Step 1: Add `resizeAll()` to `charts.js`**

```js
export function resizeAll() {
  Object.values(charts).forEach(c => { try { c.resize(); } catch(e) {} });
}
```

**Step 2: Call after tab switch in `nav.js`**

```js
import { resizeAll } from './charts.js';

export function switchTab(name) {
  // ... existing code ...
  // After showing the section, resize its charts
  setTimeout(() => resizeAll(), 50); // wait for display:block to take effect
}
```

**Verification:** Switch to Sleep tab — sleep chart renders at correct size. Switch to Body — weight chart renders correctly.

---

## Task 7: Keep FAB refresh working

**Objective:** The floating refresh button should reload the current tab's data.

**Files:**
- Modify: `js/app.js` (update FAB handler)

**Step 1:** Change FAB handler from `loadAll()` to re-trigger the current tab:

```js
$('fabRefresh').addEventListener('click', () => {
  const b = $('fabRefresh');
  b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
  const active = document.querySelector('.nav-tab.active');
  if (active) switchTab(active.dataset.tab);
});
```

Actually simpler: just call `switchTab` with the current active tab name. But we need to force reload even if already loaded. Add a `force` parameter:

In `nav.js`:
```js
export function switchTab(name, force = false) {
  // ...
  if (force) loaded.delete(name);
  if (!loaded.has(name)) {
    loaded.add(name);
    LOADERS[name]();
  }
}
```

FAB handler passes `force=true`.

**Verification:** Press FAB on Overview tab — data refreshes. Press FAB on Sleep tab — sleep data refreshes.

---

## Files changed summary

| File | Action |
|------|--------|
| `index.html` | Restructure into `<section>` wrappers + add nav bar |
| `css/styles.css` | Add nav bar + section visibility styles |
| `js/nav.js` | **New** — tab switching + lazy loading |
| `js/app.js` | Replace `loadAll()` with `switchTab('overview')`, update FAB |
| `js/dashboard.js` | Split into `loadOverview/loadSleep/loadBody/loadTraining/loadIntake/loadWorld` |
| `js/charts.js` | Add `resizeAll()` export |
| `js/quicklog.js` | Update import from `loadAll` to `switchTab`/`loadOverview` |

## Decisions (confirmed)

1. **Stimulant clearance refresh:** Keep the floating refresh button — manual refresh only. No auto-refresh timer.
2. **Eating details:** Overview gets calories/protein chart + goals + meal log history table (past meals from today/last few days).
3. **Navigation:** Bottom nav bar, thumb-friendly. Fixed at bottom of viewport, safe-area-aware.

---

## Risk: Chart.js canvases in hidden sections

Chart.js initializes canvases at 0×0 when their parent is `display:none`. The `resizeAll()` call after tab switch (with a 50ms delay for layout) handles this. If charts still render at wrong size, increase the delay or use `requestAnimationFrame`.

## Verification checklist

- [ ] Sign in → Overview tab loads with briefing, quick actions, stat strip, stimulant clearance, calories chart, goals
- [ ] Click Sleep tab → sleep chart, stages, intake-vs-sleep render correctly
- [ ] Click Body tab → weight, steps (with range selector), energy/stress, week-vs-week render
- [ ] Click Training tab → training chart + week strip render
- [ ] Click Intake tab → supplements checklist, intake breakdown render
- [ ] Click World tab → feed, projects, calendar, HN, insights render
- [ ] Quick-log buttons work from Overview tab
- [ ] Log sheet (modal) opens from any tab
- [ ] FAB refresh reloads current tab's data
- [ ] Charts resize correctly when switching tabs
- [ ] Mobile viewport: nav scrolls horizontally, tabs are tappable
- [ ] No JavaScript errors in console