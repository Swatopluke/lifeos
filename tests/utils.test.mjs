// Real behavioural tests for the shared date/time helpers.
//
// These import js/utils.js directly — it is deliberately free of DOM access at
// module scope so it loads under plain node. Everything timezone-sensitive lives
// there for exactly this reason: the modules that cannot be imported (dashboard,
// cards, history all pull in the Supabase client) contain no date logic of their
// own any more, they only call these functions.
//
// The suite is run twice by the `test` gate — once under TZ=UTC and once under a
// far-away zone — because the entire class of bug being guarded against is
// invisible when the host clock happens to be set to Budapest.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  budOffsetMs, budDay, budTime, budHour, budDayStartISO,
  todayISO, daysAgoISO, dayIndex, shortDay, within24h, bucket24h,
} from '../js/utils.js';

const HOUR = 3600000;

test('budOffsetMs tracks Budapest DST', () => {
  assert.equal(budOffsetMs(new Date('2026-01-15T12:00:00Z')), 1 * HOUR, 'CET is UTC+1');
  assert.equal(budOffsetMs(new Date('2026-07-15T12:00:00Z')), 2 * HOUR, 'CEST is UTC+2');
});

test('budDay buckets by the Budapest calendar day, not UTC', () => {
  // 23:30 UTC in summer is already 01:30 the next day in Budapest.
  assert.equal(budDay('2026-07-15T23:30:00Z'), '2026-07-16');
  // 00:30 UTC in winter is 01:30 the same day.
  assert.equal(budDay('2026-01-15T00:30:00Z'), '2026-01-15');
  // 23:30 UTC in winter is 00:30 the next day.
  assert.equal(budDay('2026-01-15T23:30:00Z'), '2026-01-16');
  assert.equal(budDay(''), '');
});

test('budHour and budTime report Budapest wall clock', () => {
  assert.equal(budHour('2026-07-15T23:30:00Z'), 1);
  assert.equal(budHour('2026-01-15T23:30:00Z'), 0);
  assert.equal(budTime('2026-07-15T23:30:00Z'), '01:30');
  assert.equal(budTime('2026-01-15T06:05:00Z'), '07:05');
});

test('budDayStartISO is Budapest midnight, not UTC midnight', () => {
  // Summer: midnight Budapest = 22:00 UTC the previous day.
  assert.equal(budDayStartISO('2026-07-15'), '2026-07-14T22:00:00.000Z');
  // Winter: 23:00 UTC the previous day.
  assert.equal(budDayStartISO('2026-01-15'), '2026-01-14T23:00:00.000Z');
});

test('budDayStartISO holds across both DST transitions', () => {
  // Spring forward is 02:00→03:00 on 2026-03-29; midnight is still CET (+1).
  assert.equal(budDayStartISO('2026-03-29'), '2026-03-28T23:00:00.000Z');
  // Fall back is 03:00→02:00 on 2026-10-25; midnight is still CEST (+2).
  assert.equal(budDayStartISO('2026-10-25'), '2026-10-24T22:00:00.000Z');
});

test('budDayStartISO round-trips: the instant it returns is on that day', () => {
  for (const day of ['2026-01-15', '2026-03-29', '2026-07-15', '2026-10-25']) {
    assert.equal(budDay(budDayStartISO(day)), day, `${day} start-of-day lands on ${day}`);
    // One millisecond earlier must be the previous day.
    const before = new Date(Date.parse(budDayStartISO(day)) - 1).toISOString();
    assert.notEqual(budDay(before), day, `${day} start-of-day is the true boundary`);
  }
});

test('the supplement-log window includes the first hour of the local day', () => {
  // The bug this replaces: `day + 'T00:00:00Z'` starts the window at 02:00
  // Budapest in summer, so a 00:30 local entry fell outside it.
  const windowStart = Date.parse(budDayStartISO('2026-07-15'));
  const loggedAt0030Local = Date.parse('2026-07-14T22:30:00Z'); // 00:30 on the 15th
  assert.ok(loggedAt0030Local >= windowStart, 'entry at 00:30 local is inside the window');
  assert.ok(loggedAt0030Local < Date.parse('2026-07-15T00:00:00Z'), 'and would have been missed by UTC midnight');
});

test('todayISO and daysAgoISO agree and step one calendar day at a time', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(daysAgoISO(0), todayISO());
  for (const n of [1, 2, 7, 27, 59]) {
    assert.equal(dayIndex(todayISO()) - dayIndex(daysAgoISO(n)), n, `${n} days back is ${n} days`);
  }
});

test('daysAgoISO produces a strictly descending, gapless run', () => {
  const days = [];
  for (let i = 27; i >= 0; i--) days.push(daysAgoISO(i));
  assert.equal(new Set(days).size, 28, 'no duplicate days (a DST day is not swallowed)');
  for (let i = 1; i < days.length; i++) {
    assert.equal(dayIndex(days[i]) - dayIndex(days[i - 1]), 1, 'consecutive');
  }
});

test('dayIndex is pure date arithmetic', () => {
  assert.equal(dayIndex('2026-07-16') - dayIndex('2026-07-15'), 1);
  assert.equal(dayIndex('2027-01-01') - dayIndex('2026-01-01'), 365);
  // Across the spring-forward day: still exactly one day.
  assert.equal(dayIndex('2026-03-30') - dayIndex('2026-03-29'), 1);
});

test('shortDay renders DD.MM', () => {
  assert.equal(shortDay('2026-07-15'), '15.07');
});

test('within24h is a rolling window, closed at 24h', () => {
  const now = Date.now();
  assert.equal(within24h(new Date(now).toISOString()), true, 'now');
  assert.equal(within24h(new Date(now - HOUR).toISOString()), true, '1h ago');
  assert.equal(within24h(new Date(now - 23 * HOUR).toISOString()), true, '23h ago');
  assert.equal(within24h(new Date(now - 25 * HOUR).toISOString()), false, '25h ago');
  assert.equal(within24h(new Date(now + HOUR).toISOString()), false, 'the future');
  assert.equal(within24h('not a date'), false);
  assert.equal(within24h(null), false);
});

test('within24h keeps late-yesterday entries that a calendar-day filter dropped', () => {
  // The original bug: at 01:00 Budapest, a meal logged at 23:00 the previous
  // evening is a different calendar day but two hours ago.
  const twoHoursAgo = new Date(Date.now() - 2 * HOUR);
  assert.equal(within24h(twoHoursAgo.toISOString()), true);
});

test('bucket24h returns 24 aligned hourly slots', () => {
  const now = Date.now();
  const { labels, buckets } = bucket24h([]);
  assert.equal(labels.length, 24);
  assert.equal(buckets.length, 24);
  assert.ok(buckets.every(v => v === 0));
  // Last slot is the hour happening now, in Budapest.
  assert.equal(labels[23], String(budHour(new Date(now))).padStart(2, '0') + ':00');
  assert.equal(labels[0], String(budHour(new Date(now - 23 * HOUR))).padStart(2, '0') + ':00');
});

test('bucket24h places values in the right slot and drops the rest', () => {
  const now = Date.now();
  const { buckets } = bucket24h([
    { t: new Date(now).toISOString(), v: 100 },
    { t: new Date(now - HOUR).toISOString(), v: 10 },
    { t: new Date(now - 23 * HOUR).toISOString(), v: 5 },
    { t: new Date(now - 25 * HOUR).toISOString(), v: 999 },   // outside
    { t: new Date(now + HOUR).toISOString(), v: 888 },        // future
    { t: 'garbage', v: 777 },
  ]);
  assert.equal(buckets[23], 100);
  assert.equal(buckets[22], 10);
  assert.equal(buckets[0], 5);
  assert.equal(buckets.reduce((a, b) => a + b, 0), 115, 'excluded rows contribute nothing');
});

test('bucket24h sums repeat entries in the same hour and tolerates missing values', () => {
  const now = Date.now();
  const { buckets } = bucket24h([
    { t: new Date(now).toISOString(), v: 3 },
    { t: new Date(now).toISOString(), v: 4 },
    { t: new Date(now).toISOString() },
  ]);
  assert.equal(buckets[23], 7);
  assert.equal(bucket24h(null).buckets.reduce((a, b) => a + b, 0), 0);
});

test('bucket24h labels are Budapest hours, independent of the host clock', () => {
  // Reconstructed from budHour, which is Intl-backed. If bucket24h ever reverts
  // to Date#getHours this fails on any host not set to Budapest — which is
  // precisely why the gate runs the suite under a second timezone.
  const now = Date.now();
  const { labels } = bucket24h([]);
  const expected = [];
  for (let h = 23; h >= 0; h--) expected.push(String(budHour(new Date(now - h * HOUR))).padStart(2, '0') + ':00');
  assert.deepEqual(labels, expected);
});
