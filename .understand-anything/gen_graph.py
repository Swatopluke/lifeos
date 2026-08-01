#!/usr/bin/env python3
"""Generate LifeOS knowledge graph from real source analysis.
Counts in GRAPH-INDEX.md are derived from this same structure, never hand-typed.
"""
import json, datetime, os

PROJECT = "LifeOS"
COMMIT = "70b9b0ab86b1a84d23e774feccb898ceec6c4c4d"
UA = "/Users/gyozobaglyas/LifeOS/.understand-anything"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def f(path, name, summary, tags):
    return {"id": f"file:{path}", "type": "file", "name": name,
            "filePath": path, "summary": summary, "tags": tags, "language": "javascript"}

def fn(file, name, summary, tags):
    return {"id": f"function:js/{file}:{name}", "type": "function", "name": name,
            "filePath": f"js/{file}", "summary": summary, "tags": tags}

def doc(path, name, summary, tags):
    return {"id": f"document:{path}", "type": "document", "name": name,
            "filePath": path, "summary": summary, "tags": tags}

def cfg(path, name, summary, tags):
    return {"id": f"config:{path}", "type": "config", "name": name,
            "filePath": path, "summary": summary, "tags": tags}

def conc(name, summary, tags):
    return {"id": f"concept:{name}", "type": "concept", "name": name,
            "summary": summary, "tags": tags}

# ---------------- NODES ----------------
nodes = []
# File nodes
nodes += [
    f("index.html", "App shell (index.html)",
      "Single-page app shell: login gate, six sections (overview/sleep/body/training/intake/world), "
      "bottom nav, log-sheet modal. Loads Supabase + Chart.js from CDN; entry scripts js/nav.js + js/app.js.",
      ["shell", "html", "entry-point"]),
    f("css/styles.css", "Theme & layout (styles.css)",
      "Design tokens as CSS vars (--sleep/--caf/--booze/--food/--energy/--weight), bottom-nav, cards, "
      "chart boxes, sheet modal, calendar/feed/news styling.",
      ["styles", "theme", "css"]),
    f("js/config.js", "Supabase client & seed (config.js)",
      "Constructs the Supabase client (sb) from a publishable key; SEED_PROJECTS / SEED_EVENTS fallbacks "
      "used until matching tables exist.",
      ["config", "supabase", "client"]),
    f("js/utils.js", "Shared helpers (utils.js)",
      "DOM/date/format helpers used across modules: $, todayISO, daysAgoISO, shortDay, budaFmt/budaDay/budDay, "
      "toast, CSS, escapeHtml, timeAgo, domainOf.",
      ["utils", "helpers"]),
    f("js/charts.js", "Chart.js wrapper (charts.js)",
      "Thin Chart.js wrapper: drawChart (cached, destroys prior), resizeAll, shared gridOpt/baseOpts. "
      "Sets Chart defaults from CSS tokens.",
      ["charts", "rendering"]),
    f("js/auth.js", "Auth (auth.js)",
      "signIn (Supabase password auth) and showApp (reveals app, sets date label, switches to overview).",
      ["auth", "session"]),
    f("js/nav.js", "Navigation (nav.js)",
      "Bottom-nav tab switching with per-section lazy loaders (dynamic import() of dashboard.js loaders); "
      "switchTab; calls resizeAll after layout settles.",
      ["navigation", "lazy-load"]),
    f("js/app.js", "Entry point (app.js)",
      "Wires login/refresh/signout listeners, checks existing session, boots the app. Side-effecting module; "
      "imports config/utils/auth/nav/quicklog.",
      ["entry", "bootstrap"]),
    f("js/quicklog.js", "Quick log & sheet (quicklog.js)",
      "Quick-log tap handlers (snus/coffee/green_tea/matcha/alcohol via QUICK map) and the log-sheet modal "
      "(sleep/meal/state/body/train) writing to Supabase tables.",
      ["logging", "forms", "supabase-write"]),
    f("js/dashboard.js", "Dashboard loaders (dashboard.js)",
      "Per-section loaders (loadOverview/loadSleep/loadBody/loadTraining/loadIntake/loadWorld) over a shared "
      "28-day Supabase cache (getCache); stimulant-clearance + week-delta helpers.",
      ["dashboard", "data", "rendering"]),
    f("js/cards.js", "World-tab cards (cards.js)",
      "Card renderers for the World tab: renderBriefing/renderInsights/renderFeed/renderProjects/renderCalendar/"
      "renderNews; fetches GitHub commit activity + Hacker News.",
      ["cards", "widgets", "external-api"]),
    f("js/history.js", "Steps history (history.js)",
      "Steps history card with 24H/7D/30D range toggle; reads health_metrics/health_raw/daily_state.",
      ["history", "steps", "charts"]),
]
# Config + document nodes
nodes += [
    cfg(".hermes/config.yml", "Hermes Protocol config",
        "Repo-level Hermes Orchestration Protocol config: gates (build/test/lint/smoke), do_not_touch, "
        "one_way_doors, skill_defaults, execution routing.",
        ["hermes", "config", "protocol"]),
    doc("docs/STATE.md", "Protocol state (STATE.md)",
        "Hermes protocol state: active workstreams, known-broken, ADRs, merge queue. Currently stubbed.",
        ["docs", "state", "hermes"]),
    doc("docs/GRAPH-INDEX.md", "Graph index (GRAPH-INDEX.md)",
        "Index pointing at the knowledge graph; regenerated from .understand-anything/knowledge-graph.json. "
        "Node/edge counts are derived from that file, not a directory listing.",
        ["docs", "index", "graph"]),
]
# Concept node
nodes += [
    conc("SupabaseBackend",
         "Hosted Postgres via the Supabase JS SDK — LifeOS's data layer. Tables: sleep, body_metrics, "
         "daily_state, intake, meals, supplements, supplement_log, goals, training, briefings, insights, "
         "feed_items, projects, events, health_metrics, health_raw. No local migrations; schema lives remotely.",
         ["backend", "database", "supabase", "external"]),
]
# Function nodes
nodes += [
    fn("app.js", "boot", "Async IIFE: reads session, shows app if logged in; wires listeners.", ["bootstrap"]),
    fn("auth.js", "signIn", "Supabase signInWithPassword; calls showApp on success.", ["auth"]),
    fn("auth.js", "showApp", "Hides login, reveals app, sets today label, switches to overview.", ["auth"]),
    fn("nav.js", "switchTab", "Toggles sections, lazy-runs the tab loader once, then resizeAll().", ["navigation"]),
    fn("dashboard.js", "getCache", "Fetches all 28-day data once via Promise.all; memoized.", ["cache", "data"]),
    fn("dashboard.js", "loadOverview", "Renders quick counters, stat strip, goals, stimulant chart, food chart, meal log, briefing.", ["dashboard"]),
    fn("dashboard.js", "loadSleep", "Renders sleep, sleep-stages, intake-vs-sleep charts.", ["dashboard"]),
    fn("dashboard.js", "loadBody", "Renders weight/state charts, week deltas, delegates steps to loadHistory.", ["dashboard"]),
    fn("dashboard.js", "loadTraining", "Renders training summary, week grid, minutes chart.", ["dashboard"]),
    fn("dashboard.js", "loadIntake", "Renders supplements + today's intake detail.", ["dashboard"]),
    fn("dashboard.js", "loadWorld", "Renders feed/projects/calendar/news/insights cards.", ["dashboard"]),
    fn("dashboard.js", "drawStimChart", "Live stimulant-clearance decay chart (nicotine/caffeine/alcohol) with now-line.", ["chart", "internal"]),
    fn("dashboard.js", "renderMealLog", "Renders today's meal rows.", ["render", "internal"]),
    fn("dashboard.js", "renderWeekDeltas", "Computes this-week vs last-week deltas for sleep/snus/alcohol/caffeine/kcal/steps.", ["render", "internal"]),
    fn("cards.js", "renderBriefing", "Renders latest briefing card from briefings table.", ["card"]),
    fn("cards.js", "renderInsights", "Renders insights list from insights table.", ["card"]),
    fn("cards.js", "renderFeed", "Renders world-feed items from feed_items table.", ["card"]),
    fn("cards.js", "renderProjects", "Renders project cards (seed or projects table); triggers activity fetch.", ["card"]),
    fn("cards.js", "fetchProjectActivity", "Fetches GitHub commit history for a repo; draws a 14-day bar chart.", ["card", "external-api"]),
    fn("cards.js", "renderCalendar", "Renders upcoming events (seed or events table).", ["card"]),
    fn("cards.js", "renderNews", "Fetches + renders Hacker News top stories.", ["card", "external-api"]),
    fn("history.js", "loadHistory", "Loads steps for 24H/7D/30D and draws the steps chart.", ["history"]),
    fn("charts.js", "drawChart", "Creates/destroys a cached Chart.js instance by canvas id.", ["charts"]),
    fn("charts.js", "resizeAll", "Resizes every live chart (called after tab switch).", ["charts"]),
]

# ---------------- EDGES ----------------
def imp(s, t):  # imports
    return {"source": s, "target": t, "type": "imports", "weight": 0.7}
def cal(s, t):  # calls
    return {"source": s, "target": t, "type": "calls", "weight": 0.8}
def dep(s, t, et="depends_on", w=0.6):
    return {"source": s, "target": t, "type": et, "weight": w}

edges = []
# index.html loads
edges += [imp("file:index.html", "file:js/nav.js"),
          imp("file:index.html", "file:js/app.js"),
          imp("file:index.html", "file:css/styles.css")]
# app.js
edges += [imp("file:js/app.js", "file:js/config.js"),
          imp("file:js/app.js", "file:js/utils.js"),
          imp("file:js/app.js", "file:js/auth.js"),
          imp("file:js/app.js", "file:js/nav.js"),
          imp("file:js/app.js", "file:js/quicklog.js")]
# auth.js
edges += [imp("file:js/auth.js", "file:js/config.js"),
          imp("file:js/auth.js", "file:js/utils.js"),
          imp("file:js/auth.js", "file:js/nav.js")]
# nav.js
edges += [imp("file:js/nav.js", "file:js/utils.js"),
          imp("file:js/nav.js", "file:js/charts.js"),
          imp("file:js/nav.js", "file:js/dashboard.js")]  # dynamic import in LOADERS
# charts.js
edges += [imp("file:js/charts.js", "file:js/utils.js")]
# dashboard.js
edges += [imp("file:js/dashboard.js", "file:js/config.js"),
          imp("file:js/dashboard.js", "file:js/utils.js"),
          imp("file:js/dashboard.js", "file:js/charts.js"),
          imp("file:js/dashboard.js", "file:js/history.js"),
          imp("file:js/dashboard.js", "file:js/cards.js")]
# quicklog.js
edges += [imp("file:js/quicklog.js", "file:js/config.js"),
          imp("file:js/quicklog.js", "file:js/utils.js"),
          imp("file:js/quicklog.js", "file:js/nav.js")]
# cards.js
edges += [imp("file:js/cards.js", "file:js/config.js"),
          imp("file:js/cards.js", "file:js/utils.js"),
          imp("file:js/cards.js", "file:js/charts.js")]
# history.js
edges += [imp("file:js/history.js", "file:js/config.js"),
          imp("file:js/history.js", "file:js/utils.js"),
          imp("file:js/history.js", "file:js/charts.js")]

# calls (function-level)
edges += [
    cal("function:js/app.js:boot", "function:js/auth.js:signIn"),
    cal("function:js/app.js:boot", "function:js/auth.js:showApp"),
    cal("function:js/app.js:boot", "function:js/nav.js:switchTab"),
    cal("function:js/auth.js:signIn", "function:js/auth.js:showApp"),
    cal("function:js/auth.js:showApp", "function:js/nav.js:switchTab"),
    cal("function:js/nav.js:switchTab", "function:js/charts.js:resizeAll"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadOverview"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadSleep"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadBody"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadTraining"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadIntake"),
    cal("function:js/nav.js:switchTab", "function:js/dashboard.js:loadWorld"),
    cal("function:js/dashboard.js:loadOverview", "function:js/dashboard.js:getCache"),
    cal("function:js/dashboard.js:loadOverview", "function:js/charts.js:drawChart"),
    cal("function:js/dashboard.js:loadOverview", "function:js/dashboard.js:drawStimChart"),
    cal("function:js/dashboard.js:loadOverview", "function:js/dashboard.js:renderMealLog"),
    cal("function:js/dashboard.js:loadOverview", "function:js/cards.js:renderBriefing"),
    cal("function:js/dashboard.js:loadSleep", "function:js/dashboard.js:getCache"),
    cal("function:js/dashboard.js:loadSleep", "function:js/charts.js:drawChart"),
    cal("function:js/dashboard.js:loadBody", "function:js/dashboard.js:getCache"),
    cal("function:js/dashboard.js:loadBody", "function:js/charts.js:drawChart"),
    cal("function:js/dashboard.js:loadBody", "function:js/dashboard.js:renderWeekDeltas"),
    cal("function:js/dashboard.js:loadBody", "function:js/history.js:loadHistory"),
    cal("function:js/dashboard.js:loadTraining", "function:js/dashboard.js:getCache"),
    cal("function:js/dashboard.js:loadTraining", "function:js/charts.js:drawChart"),
    cal("function:js/dashboard.js:loadIntake", "function:js/dashboard.js:getCache"),
    cal("function:js/dashboard.js:loadWorld", "function:js/cards.js:renderFeed"),
    cal("function:js/dashboard.js:loadWorld", "function:js/cards.js:renderProjects"),
    cal("function:js/dashboard.js:loadWorld", "function:js/cards.js:renderCalendar"),
    cal("function:js/dashboard.js:loadWorld", "function:js/cards.js:renderNews"),
    cal("function:js/dashboard.js:loadWorld", "function:js/cards.js:renderInsights"),
    cal("function:js/dashboard.js:drawStimChart", "function:js/charts.js:drawChart"),
    cal("function:js/cards.js:renderProjects", "function:js/cards.js:fetchProjectActivity"),
    cal("function:js/cards.js:renderProjects", "function:js/charts.js:drawChart"),
    cal("function:js/cards.js:fetchProjectActivity", "function:js/charts.js:drawChart"),
    cal("function:js/history.js:loadHistory", "function:js/charts.js:drawChart"),
]
# Supabase concept edges
edges += [
    dep("file:js/config.js", "concept:SupabaseBackend", "defines_schema", 0.8),
    dep("file:js/dashboard.js", "concept:SupabaseBackend"),
    dep("file:js/quicklog.js", "concept:SupabaseBackend"),
    dep("file:js/cards.js", "concept:SupabaseBackend"),
    dep("file:js/history.js", "concept:SupabaseBackend"),
    dep("file:js/auth.js", "concept:SupabaseBackend"),
    # docs document the protocol/config
    dep("document:docs/STATE.md", "config:.hermes/config.yml", "documents", 0.5),
    dep("document:docs/GRAPH-INDEX.md", "config:.hermes/config.yml", "documents", 0.5),
]

# ---------------- LAYERS ----------------
layers = [
    {"id": "layer:entry-and-shell", "name": "Entry & shell",
     "description": "HTML shell, theme, and bootstrap/router entry points.",
     "nodeIds": ["file:index.html", "file:css/styles.css", "file:js/app.js", "file:js/nav.js"]},
    {"id": "layer:auth-and-config", "name": "Auth & config",
     "description": "Supabase client construction and session/auth flow.",
     "nodeIds": ["file:js/config.js", "file:js/auth.js"]},
    {"id": "layer:data-and-services", "name": "Data & services",
     "description": "Section loaders, logging writes, and the remote Supabase data layer.",
     "nodeIds": ["file:js/dashboard.js", "file:js/history.js", "file:js/quicklog.js", "concept:SupabaseBackend"]},
    {"id": "layer:ui-rendering", "name": "UI & rendering",
     "description": "Charting, world-tab cards, and shared helpers.",
     "nodeIds": ["file:js/charts.js", "file:js/cards.js", "file:js/utils.js"]},
    {"id": "layer:docs-and-protocol", "name": "Docs & protocol",
     "description": "Hermes protocol config and generated documentation.",
     "nodeIds": ["config:.hermes/config.yml", "document:docs/STATE.md", "document:docs/GRAPH-INDEX.md"]},
]

# ---------------- TOUR ----------------
tour = [
    {"order": 1, "title": "App shell", "description": "index.html defines the login gate, six sections, and bottom nav; it loads the two entry scripts.",
     "nodeIds": ["file:index.html"]},
    {"order": 2, "title": "Bootstrap & auth", "description": "app.js boots, config.js builds the Supabase client, auth.js handles sign-in.",
     "nodeIds": ["file:js/app.js", "file:js/config.js", "file:js/auth.js"]},
    {"order": 3, "title": "Navigation & lazy loading", "description": "nav.js switches sections and lazily imports dashboard loaders; then resizes charts.",
     "nodeIds": ["file:js/nav.js", "file:js/dashboard.js"]},
    {"order": 4, "title": "Data layer", "description": "dashboard.js fetches a 28-day cache from Supabase; quicklog.js and history.js also read/write it.",
     "nodeIds": ["file:js/dashboard.js", "concept:SupabaseBackend", "file:js/quicklog.js", "file:js/history.js"]},
    {"order": 5, "title": "Rendering", "description": "charts.js draws everything; cards.js renders the World tab from Supabase + external APIs.",
     "nodeIds": ["file:js/charts.js", "file:js/cards.js", "file:js/utils.js"]},
]

graph = {
    "version": "1.0.0",
    "project": {
        "name": PROJECT,
        "languages": ["javascript", "html", "css", "markdown", "yaml"],
        "frameworks": ["Supabase", "Chart.js"],
        "description": "LifeOS — a single-page personal-tracking web app (sleep, intake, food, training, body, world feed) backed by Supabase.",
        "analyzedAt": NOW,
        "gitCommitHash": COMMIT,
    },
    "nodes": nodes,
    "edges": edges,
    "layers": layers,
    "tour": tour,
}

os.makedirs(UA, exist_ok=True)
with open(os.path.join(UA, "knowledge-graph.json"), "w") as fh:
    json.dump(graph, fh, indent=2)

# ---------------- INLINE VALIDATION ----------------
issues, warnings = [], []
node_ids = set()
seen = {}
for i, n in enumerate(nodes):
    if not n.get("id"): issues.append(f"Node[{i}] missing id"); continue
    if not n.get("type"): issues.append(f"Node '{n['id']}' missing type")
    if not n.get("name"): issues.append(f"Node '{n['id']}' missing name")
    if not n.get("summary"): issues.append(f"Node '{n['id']}' missing summary")
    if not n.get("tags"): issues.append(f"Node '{n['id']}' missing tags")
    if n["id"] in seen: issues.append(f"Duplicate node id '{n['id']}'")
    else: seen[n["id"]] = i
    node_ids.add(n["id"])
for i, e in enumerate(edges):
    if e["source"] not in node_ids: issues.append(f"Edge[{i}] source '{e['source']}' missing")
    if e["target"] not in node_ids: issues.append(f"Edge[{i}] target '{e['target']}' missing")

file_level = {"file","config","document","service","pipeline","table","schema","resource","endpoint"}
file_nodes = [n["id"] for n in nodes if n["type"] in file_level]
assigned = set()
for layer in layers:
    for nid in layer.get("nodeIds", []):
        if nid not in node_ids: issues.append(f"Layer '{layer['id']}' refs missing node '{nid}'")
        assigned.add(nid)
for nid in file_nodes:
    if nid not in assigned: issues.append(f"File node '{nid}' not in any layer")
for step in tour:
    for nid in step.get("nodeIds", []):
        if nid not in node_ids: issues.append(f"Tour step '{step.get('title')}' refs missing node '{nid}'")

with_edges = set([e["source"] for e in edges] + [e["target"] for e in edges])
for n in nodes:
    if n["id"] not in with_edges: warnings.append(f"Node '{n['id']}' has no edges (orphan)")

stats = {
    "totalNodes": len(nodes),
    "totalEdges": len(edges),
    "totalLayers": len(layers),
    "tourSteps": len(tour),
    "nodeTypes": {},
    "edgeTypes": {},
}
for n in nodes: stats["nodeTypes"][n["type"]] = stats["nodeTypes"].get(n["type"], 0) + 1
for e in edges: stats["edgeTypes"][e["type"]] = stats["edgeTypes"].get(e["type"], 0) + 1

print("VALIDATION issues:", len(issues), "warnings:", len(warnings))
for x in issues: print("  ISSUE:", x)
for x in warnings: print("  WARN:", x)
print("STATS:", json.dumps(stats, indent=2))

# ---------------- REGENERATE GRAPH-INDEX.md FROM GRAPH ----------------
def md_table(rows):
    return "\n".join(rows)

node_lines = [f"| {t} | {stats['nodeTypes'][t]} |" for t in sorted(stats['nodeTypes'])]
edge_lines = [f"| {t} | {stats['edgeTypes'][t]} |" for t in sorted(stats['edgeTypes'])]

layer_rows = []
for layer in layers:
    layer_rows.append(f"| `{layer['id']}` | {layer['name']} | {len(layer['nodeIds'])} |")

md = f"""# LifeOS — GRAPH-INDEX.md

> Auto-generated from `.understand-anything/knowledge-graph.json`. Node and edge
> counts below are computed from that file — never hand-edited. Regenerate after
> every `/understand` run.

| | |
|---|---|
| **updated** | {NOW[:10]} |
| **commit** | {COMMIT} |
| **nodes** | {stats['totalNodes']} |
| **edges** | {stats['totalEdges']} |
| **layers** | {stats['totalLayers']} |
| **tour steps** | {stats['tourSteps']} |

## Node types

| Type | Count |
|---|---|
{chr(10).join(l for l in node_lines)}

## Edge types

| Type | Count |
|---|---|
{chr(10).join(l for l in edge_lines)}

## Layers

| Layer id | Name | Nodes |
|---|---|---|
{chr(10).join(layer_rows)}

## Tour

| # | Title | Nodes |
|---|---|---|
""" + "\n".join(f"| {s['order']} | {s['title']} | {len(s['nodeIds'])} |" for s in tour) + f"""

## Notes
- Stack: vanilla-JS SPA (ES modules) + Supabase + Chart.js. No build step; gates run `node --check`.
- Data layer is a remote Supabase backend (`concept:SupabaseBackend`); no local migrations.
- `grep`-free exploration: use the dashboard or `hermes graph` tooling against this graph.
"""

with open("/Users/gyozobaglyas/LifeOS/docs/GRAPH-INDEX.md", "w") as fh:
    fh.write(md)

print("\nWROTE knowledge-graph.json and docs/GRAPH-INDEX.md")
print("PRE-COMMIT COUNTS -> nodes:", stats['totalNodes'], "edges:", stats['totalEdges'])
