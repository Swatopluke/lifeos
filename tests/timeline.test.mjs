// Behavioural tests for the Sziget log display logic (js/timeline.js).
//
// Same contract as js/utils.js: the module is free of DOM access and Supabase
// imports so it loads under plain node. The suite is run twice by the `test`
// gate (TZ=UTC and TZ=America/Los_Angeles); every timestamp below is a fixed
// instant and every bucket goes through the Budapest helpers, so the host
// zone must not change the answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLog, overallTotals, isBeer, UNICUM_VIEW, FESTIVAL,
} from '../js/timeline.js';
import { budDay } from '../js/utils.js';

// The real festival window: Aug 10 06:00 → Aug 16 06:00 Budapest (CEST, +2).
const START = FESTIVAL.startISO;
const END = FESTIVAL.endISO;
assert.equal(START, '2026-08-10T04:00:00.000Z', 'start is 06:00 CEST on Aug 10');
assert.equal(END, '2026-08-16T04:00:00.000Z', 'end is 06:00 CEST on Aug 16');

// Budapest wall clock -> UTC instant on the given August day (UTC+2).
const at = (d, hh, mm = 0) => new Date(Date.UTC(2026, 7, d, hh - 2, mm)).toISOString();

const beer  = (d, hh, mm = 0) => ({ kind: 'alcohol', subtype: 'dreher_gold', taken_at: at(d, hh, mm), alcohol_units: 1.97, kcal: 198 });
const unicumRow = (d, hh, mm = 0) => ({ kind: 'alcohol', subtype: 'unicum', taken_at: at(d, hh, mm), alcohol_units: 1.58, kcal: 110 });
const coffee = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'coffee', taken_at: at(d, hh, mm), mg_caffeine: 95 });
const tea    = (d, hh, mm = 0) => ({ kind: 'caffeine', subtype: 'green_tea', taken_at: at(d, hh, mm), mg_caffeine: 30 });
const snus   = (d, hh, mm = 0) => ({ kind: 'snus', taken_at: at(d, hh, mm), quantity: 1, mg_nicotine: 9 });
const meal   = (d, hh, mm = 0, extra = {}) => ({ eaten_at: at(d, hh, mm), kcal: 600, protein_g: 45, description: 'chicken rice', meal_type: 'dinner', ...extra });

test('FESTIVAL window is the half-open Sziget week', () => {
  assert.equal(budDay(START), '2026-08-10', 'start lands on Aug 10 in Budapest');
  assert.equal(budDay(END), '2026-08-16', 'end lands on Aug 16 in Budapest');
});

test('window boundaries: 06:00 in, 05:59 out, end exclusive', () => {
  const { items, overall } = buildLog([], [
    beer(10, 5, 59),   // 05:59 Aug 10 -> out
    beer(10, 6, 0),    // 06:00 Aug 10 -> in
    beer(16, 5, 59),   // 05:59 Aug 16 -> in
    beer(16, 6, 0),    // 06:00 Aug 16 -> out (end exclusive)
    coffee(9, 23, 59), // before the window
  ], START, END);
  assert.equal(items.length, 2, 'only the two boundary-inside beers');
  assert.deepEqual(items.map(i => i.day), ['2026-08-10', '2026-08-16']);
  assert.equal(overall.beers, 2);
});

test('isBeer: only alcohol rows with a beer subtype', () => {
  assert.equal(isBeer({ kind: 'alcohol', subtype: 'dreher_gold' }), true);
  assert.equal(isBeer({ kind: 'alcohol', subtype: 'unicum' }), false);
  assert.equal(isBeer({ kind: 'caffeine', subtype: 'coffee' }), false);
  assert.equal(isBeer(null), false);
});

test('unicum view constants match the 0.5dl 40% shot', () => {
  assert.equal(UNICUM_VIEW.units, 1.58);
  assert.equal(UNICUM_VIEW.kcal, 110);
});

test('two beers at the same time render as one beer + unicum row', () => {
  const { items, overall } = buildLog([], [beer(11, 19, 5), beer(11, 19, 5)], START, END);
  assert.equal(items.length, 1, 'one combined timeline row');
  assert.equal(items[0].label, 'Beer + Unicum');
  assert.equal(items[0].icon, '🍺🥃');
  assert.equal(items[0].time, '19:05');
  assert.equal(items[0].day, '2026-08-11');
  // 1.97 + 1.97 + 1.58 units, 198 + 198 + 110 kcal
  assert.equal(items[0].dose, '5.52u · 506 kcal');
  assert.equal(overall.beers, 1, 'counts as one beer');
  assert.equal(overall.unicum, 1, 'plus one unicum');
});

test('same minute on DIFFERENT days does not collapse', () => {
  const { items, overall } = buildLog([], [beer(11, 19, 5), beer(12, 19, 5)], START, END);
  assert.equal(items.length, 2, 'two separate rows');
  assert.ok(items.every(i => i.label === 'Beer'));
  assert.equal(overall.beers, 2);
  assert.equal(overall.unicum, 0, 'pair rule is per day+minute');
});

test('beers in different minutes stay two beers', () => {
  const { items, overall } = buildLog([], [beer(11, 18, 0), beer(11, 19, 5)], START, END);
  assert.equal(items.length, 2);
  assert.equal(overall.beers, 2);
  assert.equal(overall.unicum, 0);
});

test('three beers in one minute collapse the first pair only', () => {
  const { items, overall } = buildLog([], [beer(13, 21, 0), beer(13, 21, 0), beer(13, 21, 0)], START, END);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Beer ×2 + Unicum');
  assert.equal(overall.beers, 2);
  assert.equal(overall.unicum, 1);
});

test('a real unicum row is untouched by the pair rule', () => {
  const { items, overall } = buildLog([], [unicumRow(13, 21, 0), beer(13, 21, 0)], START, END);
  assert.equal(items.length, 2);
  assert.equal(overall.beers, 1);
  assert.equal(overall.unicum, 0, 'unicum counts come only from collapsed pairs');
});

test('overall totals cover all four categories plus kcal/units/caffeine', () => {
  const { overall } = buildLog(
    [meal(10, 12, 0, { kcal: 600 }), meal(15, 19, 30, { kcal: 800 })],
    [coffee(10, 8, 15), coffee(14, 14, 0), tea(11, 10, 0), snus(10, 10, 30), snus(14, 16, 0), beer(12, 20, 0)],
    START, END,
  );
  assert.equal(overall.coffees, 2);
  assert.equal(overall.greenTeas, 1);
  assert.equal(overall.snus, 2);
  assert.equal(overall.beers, 1);
  assert.equal(overall.unicum, 0);
  assert.equal(overall.mealsN, 2);
  assert.equal(overall.kcal, 600 + 800 + 198, 'meals + beer kcal (coffee/snus carry none)');
  assert.equal(overall.units, 1.97);
  assert.equal(overall.caffeine, 95 * 2 + 30);
});

test('timeline merges meals and intake in chronological order with days', () => {
  const { items } = buildLog(
    [meal(11, 19, 30)],
    [coffee(10, 8, 15), beer(11, 19, 5), snus(12, 12, 0)],
    START, END,
  );
  assert.deepEqual(items.map(i => i.time), ['08:15', '19:05', '19:30', '12:00']);
  assert.deepEqual(items.map(i => i.day), ['2026-08-10', '2026-08-11', '2026-08-11', '2026-08-12']);
  assert.deepEqual(items.map(i => i.icon), ['☕', '🍺', '🍽', '⬤']);
  assert.equal(items[2].label, 'dinner');
  assert.equal(items[2].dose, '600 kcal · chicken rice');
});

test('rows outside the window are excluded', () => {
  const prev = { ...beer(9, 22, 0), taken_at: '2026-08-09T20:00:00Z' }; // before Aug 10 06:00
  const next = { ...coffee(16, 9, 0), taken_at: '2026-08-16T07:00:00Z' }; // after Aug 16 06:00
  const { items, overall } = buildLog([], [prev, next, coffee(10, 10, 0)], START, END);
  assert.equal(items.length, 1);
  assert.equal(overall.coffees, 1);
});

test('empty window yields no items and zero totals', () => {
  const { items, overall } = buildLog([], [], START, END);
  assert.deepEqual(items, []);
  assert.equal(overallTotals([], [], START, END).kcal, 0);
  assert.equal(overall.beers + overall.unicum + overall.mealsN, 0);
});
