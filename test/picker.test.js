'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HeadlinePicker } = require('../shared/picker.js');
const { Deduper } = require('../shared/dedup.js');

const NOW = Date.parse('2026-11-10T10:00:00Z');
const MIN = 60000;
const now = () => NOW;

function items(n, source, offsetMin) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${source}-${i}`, title: `${source} reports ${source}x${i} concerning ${source}region${i} and ${source}sector${i}`,
    source, category: source.length % 2 ? 'world' : 'science', published: NOW - (offsetMin + i) * MIN,
  }));
}

test('identical headlines never repeat within a session, even if re-sent', () => {
  const p = new HeadlinePicker({ now });
  p.push(items(20, 'Alpha', 0));
  const seen = new Set();
  let h;
  while ((h = p.next())) { assert.ok(!seen.has(h.title)); seen.add(h.title); }
  p.push(items(20, 'Alpha', 0));              // the service sends the same batch again
  assert.equal(p.size, 0);
  assert.equal(p.next(), null);
});

test('near-duplicates are blocked at display time too', () => {
  const p = new HeadlinePicker({ now });
  p.push([{ id: '1', title: 'Wildfire forces thousands to evacuate in northern California', source: 'A', published: NOW }]);
  assert.ok(p.next());
  p.push([{ id: '2', title: 'Thousands evacuate as wildfire spreads in northern California', source: 'B', published: NOW }]);
  assert.equal(p.next(), null);
});

test('freshest stories come first', () => {
  const p = new HeadlinePicker({ now });
  p.push([
    { id: 'o', title: 'Older story published two hours ago today', source: 'A', published: NOW - 120 * MIN },
    { id: 'n', title: 'Newest story published one minute ago now', source: 'B', published: NOW - MIN },
  ]);
  assert.equal(p.next().id, 'n');
});

test('publishers are interleaved so one outlet never dominates', () => {
  const p = new HeadlinePicker({ now });
  p.push(items(30, 'Busy', 0));               // very fresh, prolific outlet
  p.push(items(5, 'Quiet', 20));
  p.push(items(5, 'Other', 25));
  const firstTen = Array.from({ length: 10 }, () => p.next().source);
  assert.ok(firstTen.filter(s => s === 'Busy').length <= 6, firstTen.join(','));
  assert.ok(firstTen.includes('Quiet') && firstTen.includes('Other'));
});

test('history persists across restarts so already-shown headlines stay hidden', () => {
  const a = new HeadlinePicker({ now });
  a.push(items(5, 'Alpha', 0));
  const shownTitles = [a.next().title, a.next().title];
  const saved = JSON.stringify(a.shown.exportState(2000));
  const restored = new Deduper({ capacity: 3000 });
  restored.importState(JSON.parse(saved));
  const b = new HeadlinePicker({ now, shown: restored });
  b.push(items(5, 'Alpha', 0));
  assert.equal(b.size, 3);
  let h; while ((h = b.next())) assert.ok(!shownTitles.includes(h.title));
});

test('stale items are dropped and the buffer is bounded', () => {
  const p = new HeadlinePicker({ now, maxBuffer: 50 });
  p.push([{ id: 'x', title: 'This story is three days old and too stale', source: 'A', published: NOW - 72 * 60 * MIN }]);
  assert.equal(p.size, 0);
  p.push(items(200, 'Bulk', 0));
  assert.equal(p.size, 50);
});
