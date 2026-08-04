# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single user — the owner — tracking their own life. Used on an iPhone as a
home-screen web app (the shell ships `apple-mobile-web-app-capable` and
`viewport-fit=cover`) and on a laptop. The two dominant situations are a fast
one-handed log during the day ("I just had a coffee") and a longer sit-down
review where the charts get read properly.

## Product Purpose

Put sleep, stimulant intake, food, body metrics, training and a curated world
feed in one place so that patterns across them become visible — the app exists
to answer "why do I feel like this today" from the user's own data rather than
from memory. Success is that the log is cheap enough to actually keep, and the
read-back is honest enough to change behaviour.

## Positioning

Not a habit tracker and not a fitness app: it is a personal instrument panel
with a scientific bias. Substances are modelled pharmacokinetically (live
nicotine / caffeine / alcohol decay curves with real half-lives), not counted;
every reading is timestamped and bucketed to one real timezone; an automated
agent (Hermes) writes briefings, insights and the world feed back into the same
database the user logs into.

## Operating Context

- Data lives in a hosted Supabase Postgres, reached directly from the browser.
  There is no local schema and no migrations in this repo.
- Several tables are written by scheduled agents rather than by the UI:
  `briefings`, `insights`, `feed_items`, `events`, `health_metrics`,
  `health_raw`. The UI reads them.
- Health data also arrives by bulk Apple Health export.
- The repo is governed by the Hermes protocol: `.hermes/config.yml` defines
  gates (`build`, `test`, `lint`, `smoke`, `graph`) that are real exit codes,
  not advice.

## Capabilities and Constraints

- Six existing sections — overview, sleep, body, training, intake, world —
  switched by a fixed bottom nav, each lazily loading its own data.
- Quick-log taps plus a log sheet write `intake`, `meals`, `sleep`,
  `daily_state`, `body_metrics`, `training`, `supplement_log`.
- **Every date and hour bucket is Europe/Budapest.** Not the host zone, not
  UTC. `scripts/check-tz.mjs` fails the `lint` gate on any module that reaches
  for a local-time accessor. Date-only columns are parsed as UTC and formatted
  as UTC so they read the same everywhere.
- No framework, no bundler, no build step. Vanilla ES modules, Chart.js from a
  CDN, one stylesheet.
- `events` is date-only (`title`, `start`, `end`, `location`, `note`) and is
  **read-only from the UI** — confirmed by the user. New events arrive by agent
  or by SQL.

## Brand Commitments

The name is LifeOS. The incumbent interface is a deliberate visual system
already present in the code — a printed clinical dossier: warm paper ground,
hairline rules, a Fraunces serif voice for headings, Inter for prose, JetBrains
Mono for every number, and one teal accent. New surfaces inherit it.

## Evidence on Hand

Real personal data in Supabase across all tracked tables. `events` currently
holds 12 rows spanning Aug–Dec 2026: a music festival, a rocket launch, and a
run of astronomical events (eclipses, meteor showers, oppositions,
supermoons) with long observational notes. Nothing about this product's
performance, users or results may be invented — there is exactly one user and
no external claims to make.

## Product Principles

1. **The timestamp is the product.** Anything that blurs when something
   happened — a UTC day boundary, a host-zone hour — is a correctness bug, not
   a rounding error.
2. **Logging must cost nothing.** A tap beats a form; a form beats a decision.
3. **Show the data, not a judgement of it.** Targets and thresholds are stated
   plainly; the app does not congratulate or scold.
4. **Agent-written and user-written data are equal citizens** and read the same
   way, but the UI never pretends to own what it cannot write.
5. **One screen, one question.** Each section answers a single question well
   rather than becoming a second dashboard.

## Accessibility & Inclusion

No product-specific standard was established. The surface is one-handed on a
phone in practice, so touch targets and thumb reach are real constraints.
