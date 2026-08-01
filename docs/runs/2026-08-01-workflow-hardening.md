# Run record — 2026-08-01 — workflow hardening

First entry in `docs/runs/`. The two prior execution runs (`818c83b`, `5752a2e`)
left no record; this is noted rather than back-filled, because a record written
after the fact from memory is not evidence.

## Scope

Fix the findings from the workflow audit. Two repositories are involved:
this one, and the Hermes installation at `~/.hermes`.

## Changed here

| Area | Change |
|---|---|
| `js/utils.js` | All timezone logic centralised: `budOffsetMs`, `budHour`, `budTime`, `budDayStartISO`, `dayIndex`, and `bucket24h` moved here from `dashboard.js`. `todayISO`/`daysAgoISO` now return Budapest dates, not the host's. |
| `js/dashboard.js` | `supplement_log` window uses `budDayStartISO()` instead of `todayISO()+'T00:00:00Z'`; 28-day window likewise. Local-time `fmtTime` replaced. Duplicate `bucket24h` removed. |
| `js/history.js` | Hourly steps bucketed by Budapest day/hour instead of the browser's. |
| `js/cards.js` | GitHub commit-activity days built from Budapest dates on both sides of the bucketing; calendar events use pure date arithmetic and UTC-pinned formatters. |
| `tests/utils.test.mjs` | 17 tests, new. Run under two timezones. |
| `scripts/check-tz.mjs` | New. Fails `lint` on local-time date logic outside `utils.js`. |
| `scripts/smoke.mjs` | New. Replaces a smoke gate that only checked files existed. |
| `.understand-anything/gen_graph.py` | Rewritten to derive the graph from source; `--check` detects structural drift. |
| `.hermes/config.yml` | Real gates (see below). Changed on explicit human instruction — it is on `do_not_touch`. |

## Bugs fixed

1. **Supplements appeared unlogged.** The `supplement_log` query started at UTC
   midnight — 02:00 Budapest in summer — so anything taken in the first two
   hours of the local day fell outside the window.
2. **`node --check js/*.js` only checked `js/app.js`.** Node reads one file and
   ignores the rest of argv, so `build` and `lint` had been validating a single
   1 KB module.
3. **`test` gate could never pass** (`... && false`). Runs that reported "gates
   green" had skipped it.
4. **Hourly steps and 24h chart labels used the host timezone**, contradicting
   the stated Budapest convention.
5. **GitHub commit-activity buckets were a day out** — the day list was the UTC
   date of local midnight while commits were sliced as raw UTC.

## Gates

Executed via `hermes-gates`, which runs them and reports real exit codes.

```
  PASS  build   find js scripts tests \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
  PASS  lint    node scripts/check-tz.mjs
  PASS  test    TZ=UTC node --test tests/*.test.mjs && TZ=America/Los_Angeles node --test tests/*.test.mjs
  PASS  smoke   node scripts/smoke.mjs
  PASS  graph   python3 .understand-anything/gen_graph.py --check
```

Each gate was verified to fail on a deliberately injected regression before
being trusted: `bucket24h` reverted to `getHours` (test → 2 failures), a
local-time accessor added to `dashboard.js` (lint → 1 violation), a canvas
removed from the shell (smoke → caught), and an import of a non-existent export
(smoke → caught).

## Left open

- **No browser in any gate.** Nothing here proves the charts render correctly,
  only that the logic and wiring are right. That remains a manual check.
- **No budget ledger.** `/hermes-status` now says "not tracked" rather than
  implying a ceiling is enforced, but nothing writes spend data.
- **`cards.js` calendar** treats event dates as timezone-free; correct for the
  seed data, but if `events` ever gains a time component it needs revisiting.
