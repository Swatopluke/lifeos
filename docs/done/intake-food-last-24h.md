# Brief: Intake & Food — last-24h window (lists + graphs)

> Phase A brief (Hermes Protocol). Phase B execution is NOT authorized until
> explicit human approval is given below.

## Q1 — Outcome
When this is done, the **food card** (meal log) and the **intake log card** (intake
detail list, and the 24h graphs added on the `hermes` branch) correctly show the
**last 24 hours** of meals + drinks — not just the current calendar day. A meal
logged at 23:00 yesterday is visible at 01:00 today.

## Q2 — Scope
**In scope:**
- `js/dashboard.js` → `renderMealLog(c)`: the overview meal-log list currently filters with `budDay(r.eaten_at) === todayISO()` (calendar day). Change to a rolling 24h window.
- `js/dashboard.js` → `loadIntake(c)`: the intake-detail list currently filters with `budDay(r.taken_at) === todayISO()`. Change to a rolling 24h window.
- Verify the 24h graphs added on `hermes` (`chFood24`, `chIntake24` via `bucket24h`) already use a correct 24h window (they do — `bucket24h` windows on `now - t < 24h`). Keep them; only fix the *list* filters.
- Any other relevant file needed to make the 24h window consistent (e.g. a shared `within24h(ts)` helper in `js/utils.js` if we choose to centralize it).

**Explicitly out of scope (separate observation, not this task):**
- **Supplements logging** — mentioned by the user as a separate concern ("supplements does not seem to be logged anywhere"). Left for its own task.
- Sleep / body / training / world sections.
- Backend / Supabase schema or any server-side query change.

## Q3 — Constraints (must not change)
- **Backend & APIs frozen** — no new tables/columns, no change to what `sb.from(...)` calls exist. The 28-day `getCache()` window already covers 24h, so no new server round-trip is needed; this is purely client-side filtering of already-fetched data.
- The other 4 sections retain current behaviour.
- The 14-day `kcal`/`protein` chart and the per-day stat strip stay as-is (this task is about the *last-24h* views only).

## Q4 — Verification
- Configured gates run and must pass: `build`/`lint` (`node --check js/*.js`), `smoke` (section + file check).
- **Primary proof = ad-hoc script check** (stated): extract the real time-filtering logic and unit-test that meals/drinks with a timestamp within the last 24h are included, and older ones (e.g. 25h ago) are excluded — mirroring the `bucket24h` unit test that passed last turn.
- Human manual check optional but recommended: open the app, confirm the meal log + intake list show last-24h entries including ones from yesterday evening.

## Q5 — One-way doors
- **None.** Reversible client-side filter change. No schema/migration, no public API change, no dependency upgrade, no history rewrite.

## Diagnosis (why it's broken now)
- `renderMealLog`: `const todayMeals = (mealR.data||[]).filter(r => budDay(r.eaten_at) === today);` — calendar-day equality drops anything outside today's date.
- `loadIntake`: `const todayIntake = (intakeR.data||[]).filter(r => budDay(r.taken_at) === today);` — same flaw.
- Fix: replace calendar-day equality with a rolling window, e.g. `Date.now() - new Date(ts).getTime()` in `[0, 24h)`. The 28-day cache already holds the rows.

## Approval gate
- [ ] **Human approval to proceed to Phase B execution:** ☐ YES / ☐ NO
- Approver: ____   Date: ____
