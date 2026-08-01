# Brief: Food & Intake Cards — 24h Graph View

> Phase A brief (Hermes Protocol). Phase B execution is NOT authorized until
> explicit human approval is given below.

## Q1 — Outcome
When this is done, the **food card** and the **intake log card** in the LifeOS
app show the last **24 hours** of intake/food data as a **graph**, instead of
(or in addition to) their current presentation. "Done" = those two cards
visually render a 24h-back view of intake/food when the relevant tab is opened.

## Q2 — Scope
**In scope (modify only):**
- The **food card** view (currently: calories & protein 14-day chart + meal log list in `loadOverview`).
- The **intake log card** view (currently: today's substances & amounts list in `loadIntake`).

**Explicitly out of scope:**
- `js/config.js` and the Supabase client / any backend or API.
- `js/quicklog.js` (logging logic), `js/history.js` (steps), the sleep/body/training/world sections.
- The existing 14-day food/protein chart and the existing intake-detail list elsewhere — left intact unless they *are* the card being changed.
- Any schema, migration, or new table/column.

## Q3 — Constraints (must not change)
- **Backend and APIs are frozen** — no changes to Supabase tables, columns, queries to the server, or the `sb` client.
- Data already fetched client-side may be re-shaped for display, but no new server round-trips required beyond what the existing cache already provides (the `getCache()` 28-day window already covers 24h).
- All other sections and the existing charts retain current behaviour.

## Q4 — Verification
- Configured gates still run and must pass:
  - `build` / `lint`: `node --check js/*.js`
  - `smoke`: section-count + file-existence check
- **Primary proof = manual test by the human** (stated): open the app, open the
  food card and the intake log card, confirm each shows the last 24h of
  intake/food as a graph and looks correct. No automated behavioural test is added.

## Q5 — One-way doors
- **None.** This is reversible, UI-only work. No schema/migration, no public API
  change, no dependency upgrade, no history rewrite.

## Proposed execution notes (Phase B, not yet approved)
- Likely touch points: `js/dashboard.js` `loadOverview` (food card) and
  `loadIntake` (intake log card), reusing `drawChart` from `js/charts.js` and the
  already-cached 24h slice of `intake`/`meals` data from `getCache()`.
- Confirm during Phase B whether the 24h graph *replaces* or *adds to* the
  current card contents before writing code.

## Approval gate
- [ ] **Human approval to proceed to Phase B execution:** ☐ YES / ☐ NO
- Approver: ____   Date: ____
