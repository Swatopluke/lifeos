#!/usr/bin/env node
// Structural smoke test for the app shell.
//
// There is no build step and no browser in the gate, so the failure mode this
// guards is the one that actually happens: JS that references a DOM node the
// shell does not have (or a module file that was renamed), which parses fine,
// passes every syntax check, and blows up only when the tab is opened.
//
// The previous smoke gate opened each module file and discarded it, which
// proved nothing beyond "the files exist".
//
// Exit 0 clean, 1 on any failure.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const jsFiles = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort();

const failures = [];
const fail = m => failures.push(m);

// ---- 1. section structure -------------------------------------------------
const opens = (html.match(/<section\b/g) || []).length;
const closes = (html.match(/<\/section>/g) || []).length;
if (opens !== closes) fail(`unbalanced <section>: ${opens} open vs ${closes} close`);
if (opens !== 7) fail(`expected 7 sections (overview/sleep/body/training/intake/world/calendar), found ${opens}`);

// ---- 2. every local asset the shell references exists ---------------------
const assets = [
  ...[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]),
  ...[...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map(m => m[1]),
];
for (const a of assets) {
  if (/^(https?:)?\/\//.test(a) || a.startsWith('data:')) continue;
  const p = join(ROOT, a.replace(/^\.?\//, '').split('?')[0]);
  if (!existsSync(p)) fail(`index.html references missing local asset: ${a}`);
}

// ---- 3. every module's relative imports resolve ---------------------------
for (const f of jsFiles) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  const specs = [
    ...[...src.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map(m => m[1]),
    ...[...src.matchAll(/\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map(m => m[1]),
  ];
  for (const s of specs) {
    if (!existsSync(join(ROOT, 'js', s))) fail(`js/${f} imports missing module: ${s}`);
  }
}

// ---- 4. every canvas drawn by the JS exists in the shell ------------------
// This is the check that would have caught a chart wired in code but never
// given a <canvas> — the exact shape of the 24h-graph work.
const canvasIds = new Set([...html.matchAll(/<canvas[^>]+id=["']([^"']+)["']/g)].map(m => m[1]));
for (const f of jsFiles) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  // Only static ids. Requiring a `,` right after the closing quote skips
  // composed ids like drawChart('pa-'+key, …), whose canvases the card
  // renderers create at runtime.
  for (const m of src.matchAll(/drawChart\(\s*(['"])([^'"]+)\1\s*,/g)) {
    if (!canvasIds.has(m[2])) fail(`js/${f} draws chart "${m[2]}" but index.html has no <canvas id="${m[2]}">`);
  }
}

// ---- 5. every named export a module imports is actually exported ----------
// Catches the class of crash that took the whole dashboard down before:
// importing a helper that was never exported.
const exportsOf = new Map();
for (const f of jsFiles) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    });
  }
  exportsOf.set(f, names);
}
for (const f of jsFiles) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    const target = m[2];
    const known = exportsOf.get(target);
    if (!known) continue; // non-js or unresolved; covered by check 3
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !known.has(name)) fail(`js/${f} imports { ${name} } from ./${target}, which does not export it`);
    }
  }
}

if (failures.length) {
  for (const f of failures) console.error(`smoke: ${f}`);
  console.error(`\nsmoke: ${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`smoke: OK (${opens} sections, ${assets.length} assets, ${jsFiles.length} modules, ${canvasIds.size} canvases)`);
