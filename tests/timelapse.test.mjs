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

import { buildTimelapse, countsAt, SERIES, DURATION_MS } from '../js/timelapse.js';
import { overallTotals, FESTIVAL } from '../js/timeline.js';

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
