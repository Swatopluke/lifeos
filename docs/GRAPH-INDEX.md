        # LifeOS — GRAPH-INDEX.md

        > ⚠️ **STUB — NOT A GRAPH.** Generated from directory listing, not `/understand` output.
        > Run `/hermes-understand LifeOS` to generate the real graph, then regenerate this file.
        > Never hand-edit — regenerate after every `/understand` run.

        | | |
        |---|---|
        | **updated** | 2026-07-31 |
        | **commit** | (initial scaffolding) |
        | **nodes** | 0 — graph not generated |
        | **edges** | 0 — graph not generated |

        ## Modules (directory listing only — not a graph)

        | Module | Purpose |
        |---|---|
        | `apple_health_export/` | directory listing — no graph yet |
| `cron_reports/` | directory listing — no graph yet |
| `css/` | directory listing — no graph yet |
| `docs/` | directory listing — no graph yet |
| `js/` | directory listing — no graph yet |

        Until a graph exists, routing falls back to file count in scope_declared alone.
        The anti-zombie-code check (`hermes graph find`) cannot run — use `grep -r` across
        the repo as a weaker substitute. Flagged in the init checklist as degraded.

        ## Querying

        ```
        hermes graph neighbors <path> [--depth N]
        hermes graph find <concept>
        hermes graph orphans
        hermes graph scope <path-glob>
        ```
