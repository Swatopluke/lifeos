# LifeOS — GRAPH-INDEX.md

> Auto-generated from `.understand-anything/knowledge-graph.json`. Node and edge
> counts below are computed from that file — never hand-edited. Regenerate after
> every `/understand` run.

| | |
|---|---|
| **updated** | 2026-08-01 |
| **commit** | 70b9b0ab86b1a84d23e774feccb898ceec6c4c4d |
| **nodes** | 40 |
| **edges** | 73 |
| **layers** | 5 |
| **tour steps** | 5 |

## Node types

| Type | Count |
|---|---|
| concept | 1 |
| config | 1 |
| document | 2 |
| file | 12 |
| function | 24 |

## Edge types

| Type | Count |
|---|---|
| calls | 36 |
| defines_schema | 1 |
| depends_on | 5 |
| documents | 2 |
| imports | 29 |

## Layers

| Layer id | Name | Nodes |
|---|---|---|
| `layer:entry-and-shell` | Entry & shell | 4 |
| `layer:auth-and-config` | Auth & config | 2 |
| `layer:data-and-services` | Data & services | 4 |
| `layer:ui-rendering` | UI & rendering | 3 |
| `layer:docs-and-protocol` | Docs & protocol | 3 |

## Tour

| # | Title | Nodes |
|---|---|---|
| 1 | App shell | 1 |
| 2 | Bootstrap & auth | 3 |
| 3 | Navigation & lazy loading | 2 |
| 4 | Data layer | 4 |
| 5 | Rendering | 3 |

## Notes
- Stack: vanilla-JS SPA (ES modules) + Supabase + Chart.js. No build step; gates run `node --check`.
- Data layer is a remote Supabase backend (`concept:SupabaseBackend`); no local migrations.
- `grep`-free exploration: use the dashboard or `hermes graph` tooling against this graph.
