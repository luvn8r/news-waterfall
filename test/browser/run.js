/*
 * Real-browser test of the waterfall display (Chrome/Chromium/Edge via playwright-core).
 *   npm run test:browser
 * Uses placeholder headlines generated locally — NOT real news — so it runs offline.
 * Set CHROME_PATH if Chrome is not found automatically.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { createServer } = require('../../server/server.js');

function findChrome() {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find(p => p && fs.existsSync(p));
}

// A stand-in news service that releases placeholder headlines gradually.
function fakeAggregator() {
  const words = ['harbour', 'satellite', 'orchestra', 'glacier', 'tariff', 'vaccine', 'marathon', 'telescope', 'monsoon',
    'parliament', 'reef', 'battery', 'museum', 'drought', 'semiconductor', 'festival', 'wildlife', 'railway', 'summit', 'archive'];
  const stream = [];
  let seq = 0;
  const add = (n) => {
    for (let i = 0; i < n; i++) {
      const k = seq + 1;
      const long = k % 7 === 0;
      const title = `Placeholder ${k}: ${words[k % 20]} ${words[(k * 3) % 20]}${k} ${words[(k * 7) % 20]}${k}` +
        (long ? ' with an intentionally very long test headline that must wrap across several lines without being clipped Supercalifragilisticexpialidociouslylongword' : ' sample text');
      stream.push({ seq: ++seq, id: 'p' + k, title, source: ['Test Wire', 'Sample Times', 'Demo Herald'][k % 3], region: 'Testland', category: ['world', 'science', 'sport'][k % 3], published: Date.now() - (200 - k) * 1000 });
    }
  };
  add(40);
  return {
    stream, get seq() { return seq; }, add,
    getAfter(after) { const items = after < 0 ? stream.slice(-300) : stream.filter(s => s.seq > after); return { items, cursor: seq, latest: seq }; },
    healthReport() { return []; },
  };
}

(async () => {
  const exe = findChrome();
  if (!exe) { console.log('SKIPPED: no Chrome/Edge found. Set CHROME_PATH.'); return; }
  const agg = fakeAggregator();
  const srv = createServer(agg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/app/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const outDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const sizes = [
    { name: 'phone-3x4-widget', width: 300, height: 400, dpr: 3 },
    { name: 'desktop-widget', width: 340, height: 453, dpr: 2 },
    { name: 'tablet', width: 820, height: 1180, dpr: 2 },
    { name: 'tiny', width: 220, height: 280, dpr: 2 },
  ];
  let passed = 0;
  const ok = (msg) => { passed++; console.log('  ✓ ' + msg); };
  try {
    for (const s of sizes) {
      console.log(`\n${s.name} (${s.width}×${s.height})`);
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dpr });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(() => window.__nw && window.__nw.model.items.length >= 2, null, { timeout: 15000 });
      await page.waitForTimeout(1500);

      // 1. sample positions over time: every headline only moves down
      const samples = [];
      for (let i = 0; i < 12; i++) {
        samples.push(await page.evaluate(() => window.__nw.model.items.map(it => ({ id: it.id, y: it.y, top: window.__nw.els.get(it.id).getBoundingClientRect().top }))));
        await page.waitForTimeout(250);
      }
      const last = new Map();
      let comparisons = 0;
      for (const frame of samples) for (const it of frame) {
        if (last.has(it.id)) { assert.ok(it.top >= last.get(it.id) - 0.01, `moved up: ${it.id}`); comparisons++; }
        last.set(it.id, it.top);
      }
      const moved = samples[0].length && samples[samples.length - 1].find(x => x.id === samples[0][0].id);
      assert.ok(comparisons > 10 && moved && moved.top > samples[0][0].top, 'feed advanced automatically');
      ok(`headlines moved downward only (${comparisons} position checks) and advanced automatically`);

      // 2. no overlap, no clipped text
      const layout = await page.evaluate(() => {
        const out = [];
        for (const it of window.__nw.model.items) {
          const el = window.__nw.els.get(it.id); const r = el.getBoundingClientRect(); const h2 = el.querySelector('h2');
          out.push({ top: r.top, bottom: r.bottom, clippedX: h2.scrollWidth > h2.clientWidth + 1, clippedY: h2.scrollHeight > h2.clientHeight + 1, left: r.left, right: r.right });
        }
        return { out, vw: innerWidth };
      });
      layout.out.sort((a, b) => a.top - b.top);
      for (let i = 1; i < layout.out.length; i++) assert.ok(layout.out[i].top >= layout.out[i - 1].bottom, 'overlap');
      for (const r of layout.out) { assert.ok(!r.clippedX && !r.clippedY, 'clipped text'); assert.ok(r.left >= 0 && r.right <= layout.vw, 'outside widget'); }
      ok(`${layout.out.length} visible headlines: no overlap, no clipping, all inside the widget`);

      // 3. no controls anywhere in the live DOM; page cannot be scrolled
      const ctrls = await page.evaluate(() => document.querySelectorAll('a,button,input,select,textarea,[role=button],[contenteditable],[tabindex]').length);
      assert.equal(ctrls, 0);
      await page.mouse.wheel(0, 2000);
      assert.equal(await page.evaluate(() => scrollY), 0);
      ok('no buttons/links/inputs; manual scrolling has no effect');

      // 4. fresh news enters; nothing ever repeats
      const before = agg.seq;
      agg.add(15);
      await page.waitForTimeout(1500);
      await page.evaluate(() => new Promise(r => setTimeout(r, 0)));
      const r = await page.evaluate(async (after) => {
        // the widget polls every 30 s; query the same endpoint directly instead of waiting
        const res = await fetch('../api/headlines?after=' + after); const j = await res.json();
        return j.items.length;
      }, before);
      assert.equal(r, 15);
      ok('service publishes newly arrived headlines to the widget');
      const shownTitles = await page.evaluate(() => [...window.__nw.els.values()].map(e => e.querySelector('h2').textContent));
      assert.equal(new Set(shownTitles).size, shownTitles.length);
      ok('no duplicate headline on screen');

      assert.deepEqual(errors, []);
      // fast-forward until the widget is full, then return to normal pace for a screenshot
      await page.evaluate(async () => { const m = window.__nw.model; const b = m.baseSpeed; m.baseSpeed = b * 25; await new Promise(r => setTimeout(r, 2500)); m.baseSpeed = b; m.speed = b; await new Promise(r => setTimeout(r, 400)); });
      await page.screenshot({ path: path.join(outDir, s.name + '.png') });
      ok('no script errors; screenshot saved');
      await ctx.close();
    }

    // 5. end-to-end over time with a fast clock: run many minutes, verify no repeats
    console.log('\nlong run (accelerated)');
    const ctx = await browser.newContext({ viewport: { width: 300, height: 400 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.__nw && window.__nw.model.items.length >= 1);
    const res = await page.evaluate(async () => {
      const { model, picker } = window.__nw;
      model.baseSpeed = 400;  // fast-forward
      const spawnedTitles = [];
      const origNext = picker.next.bind(picker);
      picker.next = () => { const h = origNext(); if (h) spawnedTitles.push(h.title); return h; };
      await new Promise(r => setTimeout(r, 6000));
      return { spawned: spawnedTitles.length, unique: new Set(spawnedTitles).size, remaining: picker.size, speed: model.speed, exited: model.exited };
    });
    assert.equal(res.spawned, res.unique);
    assert.ok(res.exited > 5);
    ok(`fast-forward: ${res.exited} headlines flowed out the bottom, ${res.unique} entered at the top, zero repeats`);
    await ctx.close();
    console.log(`\nAll browser checks passed (${passed}).`);
  } catch (e) {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
