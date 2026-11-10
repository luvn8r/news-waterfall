/*
 * End-to-end test of the PHONE APP bundle (www/): the real news engine running inside a
 * phone-sized browser, exactly as it runs inside the app's web view.
 *   npm run test:app
 * Every publisher feed and the GDELT index are simulated with placeholder headlines (NOT real
 * news), so this runs offline and is repeatable.
 */
'use strict';
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const sources = require('../../core/sources.js');

const WWW = path.join(__dirname, '..', '..', 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

function findChrome() {
  return [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
}

// unique, letter-only tag per feed URL so each feed's placeholder headlines are distinct
const slug = u => { let h = 7; for (const c of u) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]); };
let round = 1;
// Wait for any running check to finish, then make every source due and check again now.
// (GDELT spacing is shortened here only to keep the test quick.)
const FORCE_CHECK = async () => {
  const e = window.__newsEngine;
  while (e._running) await new Promise(r => setTimeout(r, 200));
  for (const s of e.sources) if (s.hostGapMs) s.hostGapMs = 150;
  for (const h of e.health.values()) h.nextFetchAt = 0;
  await e.tick();
};
const offlineHosts = new Set();

function feedFor(url) {
  const s = slug(url);
  const now = Date.now();
  const n = 3 + round;                              // each round, every feed has one more story
  const src = sources.find(x => x.url === url);
  if (src && src.type === 'gdelt') {
    const articles = [];
    for (let i = 0; i < n; i++) articles.push({
      url: `https://outlet${i}.${s}.example/story/${i}`, title: `Placeholder ${s}g${i} ${s}h${i} ${s}k${i} wire report`,
      seendate: new Date(now - i * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'),
      domain: `outlet${i}.${s}.example`, language: 'English', sourcecountry: 'Testland',
    });
    return { type: 'application/json', body: JSON.stringify({ articles }) };
  }
  let items = '';
  for (let i = 0; i < n; i++) {
    items += `<item><title>Placeholder ${s}a${i} ${s}b${i} ${s}c${i} sample</title><link>https://${s}.example/${i}</link>` +
      `<pubDate>${new Date(now - i * 90000).toUTCString()}</pubDate></item>`;
  }
  return { type: 'application/rss+xml', body: `<?xml version="1.0"?><rss version="2.0"><channel><title>${s}</title>${items}</channel></rss>` };
}

(async () => {
  const exe = findChrome();
  if (!exe) { console.log('SKIPPED: no Chrome/Edge found. Set CHROME_PATH.'); return; }
  if (!fs.existsSync(path.join(WWW, 'engine.js'))) throw new Error('Run "npm run build:web" first');

  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.resolve(WWW, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(WWW)) { res.writeHead(403).end(); return; }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;

  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  });
  let feedRequests = 0;
  await ctx.route(/^https:\/\//, async (route) => {
    const req = route.request();
    const host = new URL(req.url()).host;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (offlineHosts.has('*') || offlineHosts.has(host)) return route.abort('internetdisconnected');
    feedRequests++;
    const f = feedFor(req.url());
    return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': f.type }, cors), body: f.body });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let passed = 0;
  const ok = m => { passed++; console.log('  ✓ ' + m); };
  try {
    console.log('\nphone app (393×852, Android-like)');
    const t0 = Date.now();
    await page.goto(base);
    await page.waitForFunction(() => window.__nw && window.__nw.model.items.length >= 1, null, { timeout: 15000 });
    ok(`engine runs inside the app; first headline on screen after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    // let the engine work through the first pass (GDELT queries are spaced ~6 s apart)
    await page.waitForFunction(() => window.__newsEngine.healthReport().filter(h => h.healthy).length >= 80, null, { timeout: 90000 });
    const h = await page.evaluate(() => { const r = window.__newsEngine.healthReport(); return { total: r.length, healthy: r.filter(x => x.healthy).length, stream: window.__newsEngine.stream.length }; });
    assert.ok(h.healthy >= 80);
    ok(`${h.healthy}/${h.total} sources fetched & parsed in-app; ${h.stream} unique headlines in the stream`);

    const labels = await page.evaluate(() => window.__newsEngine.stream.filter(s => /\.example$/.test(s.source) && /^outlet/.test(s.source)).length);
    assert.ok(labels > 0);
    ok(`worldwide index results credited to their own outlets (${labels} headlines)`);

    // downward-only motion, auto-advance
    const samples = [];
    for (let i = 0; i < 10; i++) { samples.push(await page.evaluate(() => window.__nw.model.items.map(it => [it.id, window.__nw.els.get(it.id).getBoundingClientRect().top]))); await page.waitForTimeout(300); }
    const last = new Map(); let checks = 0;
    for (const fr of samples) for (const [id, top] of fr) { if (last.has(id)) { assert.ok(top >= last.get(id) - 0.01, 'moved up'); checks++; } last.set(id, top); }
    assert.ok(checks > 10);
    ok(`headlines move only downward (${checks} checks)`);

    // fresh news keeps arriving on later checks
    const before = await page.evaluate(() => window.__newsEngine.seq);
    round++;
    await page.evaluate(FORCE_CHECK);
    const after = await page.evaluate(() => window.__newsEngine.seq);
    assert.ok(after > before);
    ok(`fresh headlines keep entering (+${after - before} on the next check)`);

    // offline: nothing breaks, sources not penalised, recovery when back
    offlineHosts.add('*');
    await page.evaluate(FORCE_CHECK);
    const off = await page.evaluate(() => [...window.__newsEngine.health.values()].filter(h => h.failures > 0).length);
    assert.equal(off, 0);
    ok('loss of internet detected as "offline" (no source penalised); the waterfall keeps flowing from what it already has');
    offlineHosts.clear(); round++;
    const s0 = await page.evaluate(() => window.__newsEngine.seq);
    await page.evaluate(FORCE_CHECK);
    assert.ok(await page.evaluate(() => window.__newsEngine.seq) > s0);
    ok('recovers automatically when the connection returns');

    // accelerated run: nothing ever repeats on screen
    const run = await page.evaluate(async () => {
      const { model, picker } = window.__nw;
      const titles = [];
      const orig = picker.next.bind(picker);
      picker.next = () => { const x = orig(); if (x) titles.push(x.title); return x; };
      const b = model.baseSpeed; model.baseSpeed = b * 30;
      await new Promise(r => setTimeout(r, 8000));
      model.baseSpeed = b; model.speed = b;
      await new Promise(r => setTimeout(r, 600));
      return { n: titles.length, unique: new Set(titles).size, exited: model.exited };
    });
    assert.equal(run.n, run.unique);
    ok(`fast-forward: ${run.unique} headlines entered, ${run.exited} left the bottom, zero repeats`);

    const ctrls = await page.evaluate(() => document.querySelectorAll('a,button,input,select,textarea,[role=button],[contenteditable],[tabindex]').length);
    assert.equal(ctrls, 0);
    ok('no buttons, links or inputs');
    assert.deepEqual(errors, []);
    ok(`no script errors (${feedRequests} simulated feed requests served)`);
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone-app.png') });
    console.log(`\nAll app checks passed (${passed}).`);
  } catch (e) {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
