#!/usr/bin/env node
// Convention gate: no module may derive a date, day or hour from the browser's
// local timezone. AGENTS.md/CLAUDE.md state that all bucketing is Budapest, but
// nothing enforced it, so three separate modules drifted back to Date#getHours
// and Date#getDate. The drift is invisible on a laptop set to Budapest, which is
// why review never caught it — so it gets caught mechanically instead.
//
// js/utils.js is the sanctioned home for this logic and is exempt.
// A genuinely-correct local-time use can opt out with a trailing
//   // tz-ok: <reason>
// on the same line. The reason is required; a bare marker is rejected.
//
// Exit 0 clean, 1 on any violation.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'js');
const EXEMPT = new Set(['utils.js']);

const RULES = [
  {
    re: /\.get(?:Hours|Minutes|Seconds|Date|Month|Day|FullYear)\s*\(/,
    msg: 'local-time accessor — use budHour/budDay/budTime from utils.js (or the getUTC* form for a date-only value)',
  },
  {
    re: /\.set(?:Hours|Date|Month|FullYear)\s*\(/,
    msg: 'local-time mutator — derive the day with daysAgoISO/dayIndex instead',
  },
  {
    re: /\.toLocale(?:Date|Time)String\s*\(/,
    msg: 'toLocale*String without an explicit timeZone renders in the host zone',
    // Satisfied when the same line pins a zone.
    ok: line => /timeZone\s*:/.test(line),
  },
  {
    re: /toISOString\s*\(\s*\)\s*\.slice\s*\(\s*0\s*,\s*10\s*\)/,
    msg: 'UTC date of an instant — use budDay() for the Budapest calendar day',
  },
  {
    re: /['"`]T00:00:00Z['"`]/,
    msg: 'UTC midnight used as a day boundary — use budDayStartISO() for a query bound',
    // Legitimate for a date-only value being parsed deterministically as UTC.
    ok: line => /new Date\s*\(/.test(line) && !/\.gte\s*\(|\.lt\s*\(|\.lte\s*\(|\.gt\s*\(/.test(line),
  },
];

const OPT_OUT = /\/\/\s*tz-ok:\s*\S+/;
const BARE_OPT_OUT = /\/\/\s*tz-ok:?\s*$/;

let violations = 0;
let scanned = 0;

for (const file of readdirSync(SRC).filter(f => f.endsWith('.js')).sort()) {
  if (EXEMPT.has(basename(file))) continue;
  scanned++;
  const lines = readFileSync(join(SRC, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (BARE_OPT_OUT.test(line)) {
      console.error(`js/${file}:${i + 1}: tz-ok marker without a reason`);
      console.error(`    ${line.trim()}`);
      violations++;
      return;
    }
    if (OPT_OUT.test(line)) return;
    // Prose in a comment is not code. Checked after the opt-out rules so an
    // annotation still has to carry a reason.
    const bare = line.trim();
    if (bare.startsWith('//') || bare.startsWith('*') || bare.startsWith('/*')) return;
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      if (rule.ok && rule.ok(line)) continue;
      console.error(`js/${file}:${i + 1}: ${rule.msg}`);
      console.error(`    ${line.trim()}`);
      violations++;
    }
  });
}

if (violations) {
  console.error(`\ncheck-tz: ${violations} timezone-convention violation(s) in ${scanned} file(s).`);
  console.error('Fix them, or annotate the line with "// tz-ok: <why this is correct>".');
  process.exit(1);
}
console.log(`check-tz: OK (${scanned} files, no local-timezone date logic outside js/utils.js)`);
