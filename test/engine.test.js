'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WaterfallModel } = require('../shared/engine.js');

function run(model, seconds, buffered, heights, onFrame) {
  let id = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    if (model.canSpawn() && buffered() > 0) model.spawn(++id, heights(id));
    if (onFrame) onFrame('before');
    model.step(dt, buffered());
    if (onFrame) onFrame('after');
  }
  return id;
}

test('headlines ALWAYS move downwards, never upwards', () => {
  const m = new WaterfallModel({ height: 450, gap: 22, speed: 12 });
  const lastY = new Map();
  let checks = 0;
  run(m, 120, () => 50, i => 40 + (i % 4) * 25, (phase) => {
    if (phase !== 'after') return;
    for (const it of m.items) {
      if (lastY.has(it.id)) { assert.ok(it.y >= lastY.get(it.id), `item ${it.id} moved up`); checks++; }
      lastY.set(it.id, it.y);
    }
  });
  assert.ok(checks > 1000);
});

test('new headlines enter at the TOP (above the visible area) and exit at the BOTTOM', () => {
  const m = new WaterfallModel({ height: 300, gap: 20, speed: 30 });
  const it = m.spawn(1, 60);
  assert.ok(it.y + it.h <= 0, 'starts fully above the top edge');
  let exited = [];
  for (let i = 0; i < 60 * 30 && !exited.length; i++) exited = m.step(1 / 60, 100);
  assert.deepEqual(exited, [1]);
  assert.equal(m.items.length, 0);
});

test('the feed advances automatically and items never re-enter once gone', () => {
  const m = new WaterfallModel({ height: 400, gap: 20, speed: 20 });
  const gone = new Set();
  let id = 0;
  for (let f = 0; f < 60 * 600; f++) {
    if (m.canSpawn()) m.spawn(++id, 70);
    for (const g of m.step(1 / 60, 100)) { assert.ok(!gone.has(g)); gone.add(g); }
    for (const it of m.items) assert.ok(!gone.has(it.id), 'a departed headline reappeared');
  }
  assert.ok(gone.size > 50, `advanced through ${gone.size} headlines`);
});

test('headlines never overlap and keep at least the configured gap', () => {
  const m = new WaterfallModel({ height: 500, gap: 24, speed: 15 });
  run(m, 200, () => 30, i => 30 + (i * 37) % 90, (phase) => {
    for (let i = 1; i < m.items.length; i++) {
      const above = m.items[i - 1], below = m.items[i];
      assert.ok(below.y - (above.y + above.h) >= 24 - 1e-6, 'overlap or gap too small');
    }
  });
});

test('speed is smooth: no sudden jumps even after a long stall (e.g. tab hidden)', () => {
  const m = new WaterfallModel({ height: 400, gap: 20, speed: 12 });
  m.spawn(1, 50);
  for (let i = 0; i < 600; i++) m.step(1 / 60, 50);
  const before = m.items[0].y;
  m.step(30, 50);                                       // 30-second stall
  assert.ok(m.items[0].y - before < 12 * 1.25 * 0.25 + 1, 'movement after stall is capped');
  let prevSpeed = m.speed;
  for (let i = 0; i < 600; i++) { m.step(1 / 60, i < 300 ? 500 : 2); assert.ok(Math.abs(m.speed - prevSpeed) < 0.5, 'speed changes gradually'); prevSpeed = m.speed; }
});

test('when no unseen headlines exist the waterfall eases to a stop (nothing invented or recycled) and resumes later', () => {
  const m = new WaterfallModel({ height: 400, gap: 20, speed: 12 });
  m.spawn(1, 50);
  for (let i = 0; i < 60 * 10; i++) m.step(1 / 60, 50);
  for (let i = 0; i < 60 * 20; i++) m.step(1 / 60, 0);
  assert.equal(m.speed, 0);
  const y = m.items[0].y;
  m.step(1 / 60, 0);
  assert.equal(m.items[0].y, y);
  for (let i = 0; i < 60 * 5; i++) m.step(1 / 60, 10);
  assert.ok(m.items[0].y > y, 'resumes when news arrives');
});

test('adapts to every supported size (re-wrap on resize never causes overlap or upward motion)', () => {
  for (const [h, gap] of [[280, 16], [453, 22], [800, 30], [1200, 34]]) {
    const m = new WaterfallModel({ height: h, gap, speed: 12 });
    run(m, 60, () => 40, () => 60);
    const ys = m.items.map(i => i.y);
    m.setSize(h * 0.8, gap);
    for (const it of m.items) m.resize(it.id, it.h * 1.6);   // narrower → taller wrapped text
    m.items.forEach((it, i) => assert.ok(it.y >= ys[i]));
    for (let i = 1; i < m.items.length; i++) assert.ok(m.items[i].y >= m.items[i - 1].y + m.items[i - 1].h + gap - 1e-6);
  }
});
