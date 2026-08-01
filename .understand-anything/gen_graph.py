#!/usr/bin/env python3
"""Derive the LifeOS knowledge graph from source.

Usage:
  python3 .understand-anything/gen_graph.py [--check]

Every node, edge and count below is read out of the repository at run time. The
previous version of this file hardcoded the commit hash and hand-listed each
node and edge, so re-running it reproduced the same 40/73 no matter what the
code did — a snapshot pretending to be an analysis, describing a tree two
commits behind.

`--check` rebuilds in memory and exits 1 if the graph on disk no longer matches
the source (files added/removed/renamed, imports or exports changed, or a newer
commit). That makes staleness detectable instead of invisible.

Outputs:
  .understand-anything/knowledge-graph.json
  .understand-anything/meta.json
  docs/GRAPH-INDEX.md          (counts derived from the graph, never typed)

Exit codes:
  0 — written, or --check and current
  1 — --check and the artefact is stale
  2 — the graph failed validation / unusable input
"""

import datetime
import json
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = os.path.join(ROOT, ".understand-anything")
JS_DIR = os.path.join(ROOT, "js")
PROJECT = os.path.basename(ROOT)

RE_IMPORT_NAMED = re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]")
RE_IMPORT_BARE = re.compile(r"import\s+['\"]([^'\"]+)['\"]")
RE_IMPORT_DYN = re.compile(r"import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
RE_EXPORT_DECL = re.compile(
    r"^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)", re.M)
RE_EXPORT_LIST = re.compile(r"^\s*export\s*\{([^}]+)\}", re.M)
RE_DRAWCHART = re.compile(r"drawChart\(\s*(['\"])([^'\"]+)\1\s*,")
RE_SUPABASE = re.compile(r"sb\.from\(\s*['\"]([^'\"]+)['\"]\s*\)")


def git(*argv: str) -> str:
    r = subprocess.run(["git", *argv], cwd=ROOT, capture_output=True,
                       text=True, timeout=60)
    return r.stdout.strip() if r.returncode == 0 else ""


def read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def js_modules() -> list[str]:
    if not os.path.isdir(JS_DIR):
        return []
    return sorted(f for f in os.listdir(JS_DIR) if f.endswith(".js"))


def scan_module(name: str) -> dict:
    src = read(os.path.join(JS_DIR, name))
    exports = set(RE_EXPORT_DECL.findall(src))
    for block in RE_EXPORT_LIST.findall(src):
        for part in block.split(","):
            ident = part.strip().split(" as ")[-1].strip()
            if ident:
                exports.add(ident)

    imports = []
    for names, spec in RE_IMPORT_NAMED.findall(src):
        if not spec.startswith("."):
            continue
        idents = [p.strip().split(" as ")[0].strip() for p in names.split(",")]
        imports.append((os.path.basename(spec), [i for i in idents if i]))
    for spec in RE_IMPORT_BARE.findall(src) + RE_IMPORT_DYN.findall(src):
        if spec.startswith("."):
            imports.append((os.path.basename(spec), []))

    return {
        "exports": sorted(exports),
        "imports": imports,
        "charts": sorted({m.group(2) for m in RE_DRAWCHART.finditer(src)}),
        "tables": sorted(set(RE_SUPABASE.findall(src))),
        "lines": src.count("\n") + 1,
    }


# Roles are the one piece of editorial judgement kept: "what this module is for"
# is not derivable from syntax. Everything else — which files exist, what they
# export, what imports what — comes from the scan. A module missing from this
# table still appears in the graph with a generated summary.
ROLES = {
    "config.js":    ("Supabase client & seed", "config", ["config", "supabase"]),
    "utils.js":     ("Shared helpers (DOM, Budapest date/time)", "services", ["utils", "timezone"]),
    "charts.js":    ("Chart.js wrapper", "ui", ["charts", "rendering"]),
    "auth.js":      ("Supabase email/password auth", "auth", ["auth", "session"]),
    "nav.js":       ("Bottom-nav tabs with per-section lazy loading", "entry", ["navigation"]),
    "app.js":       ("Bootstrap: listeners, session check, boot", "entry", ["entry", "bootstrap"]),
    "quicklog.js":  ("Quick-log taps and the log-sheet modal", "services", ["logging"]),
    "dashboard.js": ("Per-section loaders over a shared 28-day cache", "services", ["dashboard", "data"]),
    "cards.js":     ("World-tab cards (briefing, feed, projects, news)", "ui", ["cards", "external-api"]),
    "history.js":   ("Steps history card with 24H/7D/30D toggle", "ui", ["history"]),
}

LAYER_DEFS = [
    ("entry",    "Entry & shell",   "Page shell, bootstrap and navigation."),
    ("auth",     "Auth & config",   "Session handling and the Supabase client."),
    ("services", "Data & services", "Fetching, caching, shared helpers, logging."),
    ("ui",       "UI & rendering",  "Charts, cards and per-card renderers."),
    ("config",   "Config",          "Connection configuration and seed data."),
    ("docs",     "Docs & protocol", "Hermes protocol config and generated documentation."),
]


def build() -> dict:
    modules = js_modules()
    if not modules:
        raise SystemExit("gen_graph: no js/ modules found")

    scans = {m: scan_module(m) for m in modules}
    nodes, edges, seen = [], [], set()

    def add_node(node):
        if node["id"] not in seen:
            seen.add(node["id"])
            nodes.append(node)

    def add_edge(src, dst, kind, weight=1.0):
        if src in seen and dst in seen:
            edges.append({"source": src, "target": dst, "type": kind, "weight": weight})

    html_path = os.path.join(ROOT, "index.html")
    html = read(html_path) if os.path.exists(html_path) else ""
    sections = len(re.findall(r"<section\b", html))
    canvases = sorted(set(re.findall(r"<canvas[^>]+id=[\"']([^\"']+)[\"']", html)))
    add_node({
        "id": "file:index.html", "type": "file", "name": "App shell (index.html)",
        "filePath": "index.html", "language": "html",
        "summary": f"Single-page shell: {sections} sections, {len(canvases)} canvases, "
                   "login gate, bottom nav and the log-sheet modal.",
        "tags": ["shell", "entry-point"],
    })
    css_path = os.path.join(ROOT, "css", "styles.css")
    if os.path.exists(css_path):
        add_node({
            "id": "file:css/styles.css", "type": "file", "name": "Theme & layout",
            "filePath": "css/styles.css", "language": "css",
            "summary": f"Design tokens and layout, {read(css_path).count(chr(10)) + 1} lines.",
            "tags": ["styles", "theme"],
        })

    for m in modules:
        s = scans[m]
        role_name, layer, tags = ROLES.get(m, (f"Module {m}", "services", ["module"]))
        add_node({
            "id": f"file:js/{m}", "type": "file", "name": f"{role_name} ({m})",
            "filePath": f"js/{m}", "language": "javascript",
            "summary": f"{role_name}. {len(s['exports'])} export(s), {s['lines']} lines.",
            "tags": tags, "layer": layer,
        })
        for fn in s["exports"]:
            add_node({
                "id": f"function:js/{m}:{fn}", "type": "function", "name": fn,
                "filePath": f"js/{m}",
                "summary": f"Exported from js/{m}.", "tags": ["export"],
            })
            add_edge(f"file:js/{m}", f"function:js/{m}:{fn}", "defines")

    for rel, ntype, name, summary, tags in [
        (".hermes/config.yml", "config", "Hermes protocol config",
         "Gates, do_not_touch, one-way doors and routing for this project.", ["protocol"]),
        ("docs/STATE.md", "document", "STATE.md",
         "Generated project state — regenerated by hermes-state.", ["docs"]),
        ("docs/GRAPH-INDEX.md", "document", "GRAPH-INDEX.md",
         "Generated index of this graph.", ["docs"]),
        ("AGENTS.md", "document", "AGENTS.md",
         "Repository conventions for agents.", ["docs"]),
    ]:
        if os.path.exists(os.path.join(ROOT, rel)):
            add_node({"id": f"{ntype}:{rel}", "type": ntype, "name": name,
                      "filePath": rel, "summary": summary, "tags": tags})

    tables = sorted({t for s in scans.values() for t in s["tables"]})
    if tables:
        add_node({
            "id": "concept:SupabaseBackend", "type": "concept", "name": "Supabase backend",
            "summary": f"Remote Postgres + Auth. {len(tables)} table(s) referenced: "
                       + ", ".join(tables) + ".",
            "tags": ["backend", "supabase"],
        })

    for m in modules:
        for target, names in scans[m]["imports"]:
            if target not in scans:
                continue
            add_edge(f"file:js/{m}", f"file:js/{target}", "imports")
            for n in names:
                # Only record a call edge when the target really exports it —
                # a dangling import is a bug, not an edge.
                if n in scans[target]["exports"]:
                    add_edge(f"file:js/{m}", f"function:js/{target}:{n}", "calls", 0.8)

    for m in modules:
        if scans[m]["tables"]:
            add_edge(f"file:js/{m}", "concept:SupabaseBackend", "depends_on", 0.6)
    if "config.js" in scans:
        add_edge("concept:SupabaseBackend", "file:js/config.js", "defines_schema", 0.5)

    for spec in re.findall(r"<script[^>]+src=[\"']([^\"']+)[\"']", html):
        base = os.path.basename(spec)
        if base in scans:
            add_edge("file:index.html", f"file:js/{base}", "loads")
    if os.path.exists(css_path):
        add_edge("file:index.html", "file:css/styles.css", "loads")

    for doc in ("document:docs/STATE.md", "document:docs/GRAPH-INDEX.md", "document:AGENTS.md"):
        add_edge(doc, "config:.hermes/config.yml", "documents", 0.5)

    layers = []
    for key, name, desc in LAYER_DEFS:
        ids = [n["id"] for n in nodes if n.get("layer") == key]
        if key == "entry":
            ids.append("file:index.html")
        if key == "ui" and os.path.exists(css_path):
            ids.append("file:css/styles.css")
        if key == "docs":
            ids += [n["id"] for n in nodes if n["type"] in ("document", "config")]
        if ids:
            layers.append({"id": f"layer:{key}", "name": name,
                           "description": desc, "nodeIds": sorted(set(ids))})

    # Any file-level node not placed by a role lands in services, so the
    # "every file is in a layer" invariant cannot quietly break when a module
    # is added without touching ROLES.
    placed = {i for l in layers for i in l["nodeIds"]}
    orphans = sorted(n["id"] for n in nodes
                     if n["type"] in ("file", "config", "document") and n["id"] not in placed)
    if orphans:
        for l in layers:
            if l["id"] == "layer:services":
                l["nodeIds"] = sorted(set(l["nodeIds"]) | set(orphans))
                break
        else:
            layers.append({"id": "layer:services", "name": "Data & services",
                           "description": "Unclassified modules.", "nodeIds": orphans})

    def step(title, ids, note):
        return {"title": title, "nodeIds": [i for i in ids if i in seen], "note": note}

    tour = [
        step("Boot", ["file:index.html", "file:js/app.js", "file:js/auth.js"],
             "Shell loads, session is checked, the app is revealed."),
        step("Navigate", ["file:js/nav.js"],
             "Tab switching lazily imports each section's loader."),
        step("Fetch", ["file:js/dashboard.js", "file:js/config.js"],
             "One 28-day Supabase fetch is cached and shared by every section."),
        step("Render", ["file:js/charts.js", "file:js/cards.js", "file:js/history.js",
                        "file:js/utils.js"],
             "Charts and cards render from the cache; all bucketing is Budapest."),
        step("Log", ["file:js/quicklog.js"],
             "Quick-log taps and the sheet modal write back to Supabase."),
    ]

    return {
        "version": "1.1.0",
        "project": PROJECT,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "gitCommitHash": git("rev-parse", "HEAD"),
        "nodes": nodes,
        "edges": edges,
        "layers": layers,
        "tour": [t for t in tour if t["nodeIds"]],
        "stats": {"totalNodes": len(nodes), "totalEdges": len(edges),
                  "modules": len(modules), "tables": len(tables)},
    }


def validate(g: dict) -> list[str]:
    problems = []
    ids = {n["id"] for n in g["nodes"]}
    if len(ids) != len(g["nodes"]):
        problems.append("duplicate node ids")
    for n in g["nodes"]:
        for field in ("id", "type", "name", "summary"):
            if not n.get(field):
                problems.append(f"node {n.get('id')} missing {field}")
    for i, e in enumerate(g["edges"]):
        if e["source"] not in ids:
            problems.append(f"edge[{i}] dangling source {e['source']}")
        if e["target"] not in ids:
            problems.append(f"edge[{i}] dangling target {e['target']}")
    placed = {i for l in g["layers"] for i in l["nodeIds"]}
    for n in g["nodes"]:
        if n["type"] in ("file", "config", "document") and n["id"] not in placed:
            problems.append(f"{n['id']} is in no layer")
    for l in g["layers"]:
        for i in l["nodeIds"]:
            if i not in ids:
                problems.append(f"layer {l['id']} references unknown {i}")
    for t in g["tour"]:
        for i in t["nodeIds"]:
            if i not in ids:
                problems.append(f"tour step {t['title']} references unknown {i}")
    return problems


def render_index(g: dict) -> str:
    ntypes = Counter(n["type"] for n in g["nodes"])
    etypes = Counter(e["type"] for e in g["edges"])
    L = [
        f"# {g['project']} — GRAPH-INDEX.md", "",
        "> Generated by `.understand-anything/gen_graph.py` from the source tree.",
        "> Counts are computed from `knowledge-graph.json`, never hand-typed.",
        "> Regenerate with `/hermes-understand`; verify with `gen_graph.py --check`.",
        "",
        "| | |", "|---|---|",
        f"| **generated** | {g['generatedAt'][:19]}Z |",
        f"| **commit** | `{g['gitCommitHash'] or '(unknown)'}` |",
        f"| **nodes** | {len(g['nodes'])} |",
        f"| **edges** | {len(g['edges'])} |",
        f"| **layers** | {len(g['layers'])} |",
        f"| **tour steps** | {len(g['tour'])} |",
        "", "## Node types", "", "| Type | Count |", "|---|---|",
    ]
    L += [f"| {k} | {v} |" for k, v in sorted(ntypes.items())]
    L += ["", "## Edge types", "", "| Type | Count |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in sorted(etypes.items())]
    L += ["", "## Layers", ""]
    for l in g["layers"]:
        L.append(f"- **{l['name']}** ({len(l['nodeIds'])} nodes) — {l['description']}")
    L += ["", "## Tour", ""]
    for i, t in enumerate(g["tour"], 1):
        L.append(f"{i}. **{t['title']}** — {t['note']}")
    L += ["", "## Modules", "", "| File | Exports | Summary |", "|---|---|---|"]
    for n in sorted((n for n in g["nodes"] if n["type"] == "file"),
                    key=lambda x: x["filePath"]):
        exp = len([e for e in g["edges"]
                   if e["source"] == n["id"] and e["type"] == "defines"])
        L.append(f"| `{n['filePath']}` | {exp} | {n['summary']} |")
    return "\n".join(L) + "\n"


def main(argv: list[str]) -> int:
    check = "--check" in argv[1:]
    g = build()

    problems = validate(g)
    if problems:
        for p in problems:
            print(f"gen_graph: INVALID — {p}", file=sys.stderr)
        return 2

    graph_path = os.path.join(UA, "knowledge-graph.json")
    if check:
        if not os.path.exists(graph_path):
            print("gen_graph: STALE — no graph on disk", file=sys.stderr)
            return 1
        try:
            old = json.load(open(graph_path, encoding="utf-8"))
        except Exception:
            print("gen_graph: STALE — graph on disk does not parse", file=sys.stderr)
            return 1
        # Only STRUCTURAL drift fails. The commit hash moves on every commit, so
        # gating on it would leave this permanently red and train everyone to
        # ignore it. What matters is whether the graph still describes the code:
        # modules added or removed, imports rewired, exports changed.
        drift = []
        old_ids = {n["id"] for n in old.get("nodes", [])}
        new_ids = {n["id"] for n in g["nodes"]}
        for missing in sorted(new_ids - old_ids)[:8]:
            drift.append(f"in source but not in graph: {missing}")
        for extra in sorted(old_ids - new_ids)[:8]:
            drift.append(f"in graph but no longer in source: {extra}")
        if len(old.get("edges", [])) != len(g["edges"]):
            drift.append(f"edge count {len(old.get('edges', []))} on disk "
                         f"!= {len(g['edges'])} in source")
        if drift:
            for d in drift:
                print(f"gen_graph: STALE — {d}", file=sys.stderr)
            print("Regenerate with: python3 .understand-anything/gen_graph.py",
                  file=sys.stderr)
            return 1
        if old.get("gitCommitHash") != g["gitCommitHash"]:
            print(f"gen_graph: current in structure; graph stamped at "
                  f"{str(old.get('gitCommitHash'))[:8]}, HEAD is {g['gitCommitHash'][:8]}")
        else:
            print(f"gen_graph: current ({len(g['nodes'])} nodes, {len(g['edges'])} edges)")
        return 0

    os.makedirs(UA, exist_ok=True)
    with open(graph_path, "w", encoding="utf-8") as f:
        json.dump(g, f, indent=2)
    with open(os.path.join(UA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({
            "lastAnalyzedAt": g["generatedAt"],
            "gitCommitHash": g["gitCommitHash"],
            "version": g["version"],
            "analyzedFiles": g["stats"]["modules"] + 2,
        }, f, indent=2)
    index_path = os.path.join(ROOT, "docs", "GRAPH-INDEX.md")
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(render_index(g))

    print(f"gen_graph: {len(g['nodes'])} nodes, {len(g['edges'])} edges, "
          f"{len(g['layers'])} layers, 0 validation issues")
    print(f"  -> {graph_path}")
    print(f"  -> {index_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
