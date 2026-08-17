// Behavioural tests for the Today's log display logic (js/timeline.js).
//
// Same contract as js/utils.js: the module is free of DOM access and Supabase
// imports so it loads under plain node. The suite is run twice by the `test`
// gate (TZ=UTC and TZ=America/Los_Angeles); every timestamp below is a fixed
// instant and every bucket goes through the Budapest helpers, so the host
// zone must not change the answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTodayLog, overallTotals, isBeer, UNICUM_VIEW,
} from '../js/timeline.js';
import { budDay } from '../js/utils.js';

// Fixed Budapest summer day (CEST = UTC+2) so wall-clock math is exact.
const DAY = '2026-07-15';
// Budapest wall clock -> UTC instant on that day (negative hours roll back
// into the previous UTC day, which is exactly the DST-shape we want to test).
const at = (hh, mm = 0) => new Date(Date.UTC(2026, 6, 15, hh - 2, mm)).toISOString();

const beer  = (hh, mm = 0) => ({ kind: 'alcohol', subtype: 'dreher_gold', taken_at: at(hh, mm), alcohol_units: 1.97, kcal: 198 });
const unicumRow = (hh, mm = 0) => ({ kind: 'alcohol', subtype: 'unicum', taken_at: at(hh, mm), alcohol_units: 1.58, kcal: 110 });
const coffee = (hh, mm = 0) => ({ kind: 'caffeine', subtype: 'coffee', taken_at: at(hh, mm), mg_caffeine: 95 });
const tea    = (hh, mm = 0) => ({ kind: 'caffeine', subtype: 'green_tea', taken_at: at(hh, mm), mg_caffeine: 30 });
const snus   = (hh, mm = 0) => ({ kind: 'snus', taken_at: at(hh, mm), quantity: 1, mg_nicotine: 9 });
const meal   = (hh, mm = 0, extra = {}) => ({ eaten_at: at(hh, mm), kcal: 600, protein_g: 45, description: 'chicken rice', meal_type: 'dinner', ...extra });

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
  const { items, overall } = buildTodayLog([], [beer(19, 5), beer(19, 5)], DAY);
  assert.equal(items.length, 1, 'one combined timeline row');
  assert.equal(items[0].label, 'Beer + Unicum');
  assert.equal(items[0].icon, '🍺🥃');
  assert.equal(items[0].time, '19:05');
  // 1.97 + 1.97 + 1.58 units, 198 + 198 + 110 kcal
  assert.equal(items[0].dose, '5.52u · 506 kcal');
  assert.equal(overall.beers, 1, 'counts as one beer');
  assert.equal(overall.unicum, 1, 'plus one unicum');
});

test('beers in different minutes stay two beers', () => {
  const { items, overall } = buildTodayLog([], [beer(18, 0), beer(19, 5)], DAY);
  assert.equal(items.length, 2);
  assert.ok(items.every(i => i.label === 'Beer'));
  assert.equal(overall.beers, 2);
  assert.equal(overall.unicum, 0);
});

test('three beers in one minute collapse the first pair only', () => {
  const { items, overall } = buildTodayLog([], [beer(21, 0), beer(21, 0), beer(21, 0)], DAY);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Beer ×2 + Unicum');
  assert.equal(overall.beers, 2);
  assert.equal(overall.unicum, 1);
});

test('a real unicum row is untouched by the pair rule', () => {
  const { items, overall } = buildTodayLog([], [unicumRow(21, 0), beer(21, 0)], DAY);
  assert.equal(items.length, 2);
  assert.equal(overall.beers, 1);
  assert.equal(overall.unicum, 0, 'unicum counts come only from collapsed pairs');
});

test('overall totals cover all four categories plus kcal/units/caffeine', () => {
  const { overall } = buildTodayLog(
    [meal(12, 0, { kcal: 600 }), meal(19, 30, { kcal: 800 })],
    [coffee(8, 15), coffee(14, 0), tea(10, 0), snus(10, 30), snus(16, 0), beer(20, 0)],
    DAY,
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

test('timeline merges meals and intake in chronological order', () => {
  const { items } = buildTodayLog(
    [meal(19, 30)],
    [coffee(8, 15), beer(19, 5), snus(12, 0)],
    DAY,
  );
  assert.deepEqual(items.map(i => i.time), ['08:15', '12:00', '19:05', '19:30']);
  assert.deepEqual(items.map(i => i.icon), ['☕', '⬤', '🍺', '🍽']);
  assert.equal(items[3].label, 'dinner');
  assert.equal(items[3].dose, '600 kcal · chicken rice');
});

test('Budapest midnight rows land on the right day, other days are excluded', () => {
  // 00:30 local July 15 = 22:30 UTC July 14 — a real DST/UTC trap.
  assert.equal(at(0, 30), '2026-07-14T22:30:00.000Z');
  assert.equal(budDay(at(0, 30)), DAY);
  const { items } = buildTodayLog([], [beer(0, 30), coffee(23, 45)], DAY);
  assert.deepEqual(items.map(i => i.time), ['00:30', '23:45'], 'both ends of the Budapest day');

  const prev = { ...beer(22, 0), taken_at: '2026-07-13T20:00:00Z' };  // 22:00 local on the 13th
  const next = { ...coffee(9, 0), taken_at: '2026-07-16T07:00:00Z' }; // 09:00 local on the 16th
  const { items: kept, overall } = buildTodayLog([], [prev, next, coffee(10, 0)], DAY);
  assert.equal(kept.length, 1);
  assert.equal(overall.coffees, 1);
});

test('empty day yields no items and zero totals', () => {
  const { items, overall } = buildTodayLog([], [], DAY);
  assert.deepEqual(items, []);
  assert.equal(overallTotals([], [], DAY).kcal, 0);
  assert.equal(overall.beers + overall.unicum + overall.mealsN, 0);
});
