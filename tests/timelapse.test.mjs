// Behavioural tests for the Sziget timelapse event model (js/timelapse.js).
//
// Same contract as js/timeline.js: buildTimelapse/countsAt are DOM-free, so
// this loads under plain node. The `test` gate runs the suite twice (TZ=UTC
// and TZ=America/Los_Angeles); every instant below is fixed and every bucket
// goes through the Budapest helpers, so the host zone must not change answers.
//
// The load-bearing property is the last test: whatever the timelapse counts at
// the end of the run has to equal the Sziget log's Overall chips, or the two
// views of the same festival would disagree.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimelapse, countsAt, bacAt, bacPolyline, dayText,
  SERIES, DURATION_MS, BURN_PER_H, WIDMARK_R, GRAMS_PER_UNIT, DEFAULT_WEIGHT_KG,
} from '../js/timelapse.js';
import { overallTotals, FESTIVAL, UNICUM_VIEW } from '../js/timeline.js';

const START = FESTIVAL.startISO;
const END = FESTIVAL.endISO;

// Budapest wall clock -> UTC instant on the given August day (UTC+2).
const at = (d, hh, mm = 0) => new Date(Date.UTC(2026, 7, d, hh - 2, mm)).toISOString();

const beer   = (d, hh, mm = 0) => ({ kind: 'alcohol', subtype: 'dreher_gold', taken_at: at(d, hh, mm), alcohol_units: 1.97, kcal: 198 });
const coffee = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'coffee', taken_at: at(d, hh, mm), mg_caffeine: 95 });
const tea    = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'green_tea', taken_at: at(d, hh, mm), mg_caffeine: 30 });
const snus   = (d, hh, mm = 0) => ({ kind: 'snus', taken_at: at(d, hh, mm), quantity: 1, mg_nicotine: 9 });
const meal   = (d, hh, mm = 0) => ({ eaten_at: at(d, hh, mm), kcal: 600, meal_type: 'dinner' });

const keys = ev => ev.map(e => e.key);

test('the run is 10 seconds and covers the five requested series', () => {
  assert.equal(DURATION_MS, 10000);
  assert.deepEqual(SERIES.map(s => s.key), ['beer', 'unicum', 'snus', 'coffee', 'meal']);
});

test('one event per logged row, in chronological order', () => {
  const { events } = buildTimelapse(
    [meal(11, 13)],
    [snus(11, 9), beer(11, 20), coffee(11, 11)],
    START, END);
  assert.deepEqual(keys(events), ['snus', 'coffee', 'meal', 'beer']);
});

test('two beers in the same minute become one beer + one unicum', () => {
  const { events, totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 51)], START, END);
  assert.deepEqual(keys(events), ['unicum', 'beer']);
  assert.equal(totals.beer, 1);
  assert.equal(totals.unicum, 1);
});

test('three in the same minute are one unicum plus the rest as beer', () => {
  const { totals } = buildTimelapse([], [beer(16, 0, 55), beer(16, 0, 55), beer(16, 0, 55)], START, END);
  assert.equal(totals.beer, 2);
  assert.equal(totals.unicum, 1);
});

test('the pair rule is per day+minute, not per minute-of-day', () => {
  const { totals } = buildTimelapse([], [beer(11, 20, 51), beer(12, 20, 51)], START, END);
  assert.equal(totals.beer, 2, 'same clock minute on different days is not a pair');
  assert.equal(totals.unicum, 0);
});

test('beers a minute apart stay two separate beers', () => {
  const { totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 52)], START, END);
  assert.equal(totals.beer, 2);
  assert.equal(totals.unicum, 0);
});

test('rows outside the half-open window are ignored', () => {
  const { events } = buildTimelapse(
    [meal(16, 6)],                          // end is exclusive -> out
    [beer(10, 5, 59), beer(10, 6, 0)],      // 05:59 out, 06:00 in
    START, END);
  assert.deepEqual(keys(events), ['beer']);
});

test('snus carries its quantity, green tea and matcha are not plotted', () => {
  const { totals } = buildTimelapse([], [
    { kind: 'snus', taken_at: at(11, 9), quantity: 2 },
    tea(11, 10),
    { kind: 'caffeine', subtype: 'matcha', taken_at: at(11, 12), mg_caffeine: 70 },
  ], START, END);
  assert.equal(totals.snus, 2, 'quantity 2 counts as two');
  assert.equal(totals.coffee, 0, 'only subtype=coffee feeds the coffee series');
});

test('countsAt accumulates up to the playhead and resumes from an index', () => {
  const { events, startMs } = buildTimelapse([], [beer(11, 10), beer(11, 12), beer(11, 14)], START, END);
  const HOUR = 3600000;
  const noon = startMs + 5 * HOUR;                  // 11:00 Budapest on Aug 10

  const first = countsAt(events, Date.parse(at(11, 10)));
  assert.equal(first.counts.beer, 1);
  assert.equal(first.index, 1);

  // resuming from the previous index must match a scan from scratch
  const resumed = countsAt(events, Date.parse(at(11, 14)), first.index, first.counts);
  assert.equal(resumed.counts.beer, 3);
  assert.deepEqual(countsAt(events, Date.parse(at(11, 14))).counts.beer, 3);
  assert.equal(countsAt(events, noon).counts.beer, 0, 'nothing logged yet at 11:00 Aug 10');
});

test('final counters match the Sziget log Overall chips', () => {
  const meals = [meal(11, 13), meal(12, 14), meal(15, 19)];
  const intake = [
    beer(11, 20, 51), beer(11, 20, 51),   // pair -> beer + unicum
    beer(12, 4, 21), beer(12, 4, 21),     // pair -> beer + unicum
    beer(16, 0, 55), beer(16, 0, 55), beer(16, 0, 55), // triple -> 2 beer + unicum
    beer(13, 18), beer(14, 22, 30),
    snus(11, 9), snus(11, 10), snus(13, 23),
    coffee(11, 11), coffee(15, 16),
    tea(12, 9),
  ];
  const { totals } = buildTimelapse(meals, intake, START, END);
  const overall = overallTotals(meals, intake, START, END);

  assert.equal(totals.beer, overall.beers, 'beer');
  assert.equal(totals.unicum, overall.unicum, 'unicum');
  assert.equal(totals.snus, overall.snus, 'snus');
  assert.equal(totals.coffee, overall.coffees, 'coffee');
  assert.equal(totals.meal, overall.mealsN, 'meals');
  // 9 beer rows in 3 same-minute groups (2 + 2 + 3): each group gives up one
  // beer to a unicum, so 9 - 3 = 6 beers and 3 unicums.
  assert.equal(totals.beer, 6);
  assert.equal(totals.unicum, 3);
});

/* ---- blood alcohol ---------------------------------------------------- */

const HOUR = 3600000;
const W = 100;                                   // round number keeps the sums readable

test('one beer raises BAC by the Widmark amount', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  // 1.97u -> 19.7g into 100kg: 19.7 / (100000 * 0.68) * 100
  const expected = (1.97 * GRAMS_PER_UNIT) / (W * 1000 * WIDMARK_R) * 100;
  assert.ok(Math.abs(bacAt(events, t, W) - expected) < 1e-9);
  assert.ok(expected > 0.02 && expected < 0.04, 'a 5dl beer lands around 0.03%');
});

test('BAC burns off at 0.015%/h and never goes negative', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  const peak = bacAt(events, t, W);
  const afterAnHour = bacAt(events, t + HOUR, W);
  assert.ok(Math.abs(peak - afterAnHour - BURN_PER_H) < 1e-9, 'exactly one hour of burn');
  assert.equal(bacAt(events, t + 40 * HOUR, W), 0, 'floors at zero, never negative');
});

test('a dry stretch does not bank negative credit against the next drink', () => {
  // one beer, two days of nothing, then another: the second peak must equal
  // the first, not be cancelled out by the gap.
  const { events } = buildTimelapse([], [beer(10, 12), beer(13, 12)], START, END);
  const first = bacAt(events, Date.parse(at(10, 12)), W);
  const second = bacAt(events, Date.parse(at(13, 12)), W);
  assert.ok(Math.abs(first - second) < 1e-9);
});

test('a collapsed pair contributes one beer plus one unicum of ethanol', () => {
  const { events, totals } = buildTimelapse([], [beer(11, 20, 51), beer(11, 20, 51)], START, END);
  assert.equal(totals.beer, 1);
  assert.equal(totals.unicum, 1);
  const units = events.reduce((a, e) => a + e.units, 0);
  assert.ok(Math.abs(units - (1.97 + UNICUM_VIEW.units)) < 1e-9,
    'the second tap counts as a shot, not a second pint');
});

test('alcohol that is neither beer nor a pair still moves BAC', () => {
  const rows = [{ kind: 'alcohol', subtype: 'palinka', taken_at: at(12, 21), alcohol_units: 2 }];
  const { events, totals } = buildTimelapse([], rows, START, END);
  assert.equal(totals.beer, 0, 'it is not a beer');
  assert.equal(totals.unicum, 0, 'and not a collapsed pair, so no unicum chip');
  assert.ok(bacAt(events, Date.parse(at(12, 21)), W) > 0, 'but it is still alcohol');
});

test('a nondrinking window reads zero throughout', () => {
  const { events } = buildTimelapse([], [snus(11, 9), coffee(11, 11)], START, END);
  assert.equal(bacAt(events, Date.parse(at(11, 12)), W), 0);
  assert.deepEqual(bacPolyline(events, Date.parse(at(11, 12)), W), []);
});

test('the curve is piecewise linear with a vertex per drink', () => {
  // an hour apart, so 0.015% of burn cannot exhaust the ~0.029% peak and the
  // curve never reaches the floor between them
  const { events } = buildTimelapse([], [beer(11, 20), beer(11, 21)], START, END);
  const pts = bacPolyline(events, Date.parse(at(11, 22)), W);
  // drink one (floor + peak), drink two (burnt-down + peak), tail to playhead
  assert.equal(pts.length, 5);
  assert.ok(pts.every((p, i) => i === 0 || p.ms >= pts[i - 1].ms), 'vertices run forward');
  assert.ok(pts.every(p => p.bac >= 0), 'never dips below the floor');
  assert.ok(pts.slice(1, -1).every(p => p.bac > 0), 'and does not touch it mid-session');
});

test('a long enough gap puts a zero vertex before the next drink', () => {
  // ~0.029% burns off in just under two hours, so a three-hour gap must land
  // the curve on the floor and hold it there rather than crossing below.
  const { events } = buildTimelapse([], [beer(11, 20), beer(11, 23)], START, END);
  const pts = bacPolyline(events, Date.parse(at(11, 23)), W);
  const t1 = Date.parse(at(11, 20)), t2 = Date.parse(at(11, 23));
  const floor = pts.find(p => p.bac === 0 && p.ms > t1 && p.ms <= t2);
  assert.ok(floor, 'a zero crossing is recorded');
  assert.ok(floor.ms < t2, 'and it happens before the next drink');
  assert.ok(pts.every(p => p.bac >= 0));
});

test('heavier drinker, lower peak', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  assert.ok(bacAt(events, t, 120) < bacAt(events, t, 80));
});

test('weight falls back to the last recorded figure when none is passed', () => {
  const { events } = buildTimelapse([], [beer(11, 20)], START, END);
  const t = Date.parse(at(11, 20));
  assert.equal(bacAt(events, t), bacAt(events, t, DEFAULT_WEIGHT_KG));
  assert.equal(DEFAULT_WEIGHT_KG, 95);
});

test('the header day is the Budapest day, whatever the host zone', () => {
  // 00:30 Budapest on Aug 13 is still Aug 12 in UTC — the header must say 13.
  assert.match(dayText(Date.parse(at(13, 0, 30))), /13 Aug/);
  assert.match(dayText(Date.parse(at(10, 6))), /10 Aug/);
});
