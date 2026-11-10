'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createServer } = require('../server/server.js');
const sources = require('../core/sources.js');

const ROOT = path.join(__dirname, '..');
const fakeAgg = {
  stream: [{ seq: 1, id: 'a', title: 'Fixture headline for API test only', source: 'Test', published: Date.now() }],
  seq: 1,
  getAfter(after) { return { items: after < 1 ? this.stream : [], cursor: 1, latest: 1 }; },
  healthReport() { return [{ name: 'Test', healthy: true }]; },
};

async function withServer(fn) {
  const srv = createServer(fakeAgg);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}

test('API returns headlines with cursor semantics', () => withServer(async (base) => {
  const r = await (await fetch(base + '/api/headlines?after=-1')).json();
  assert.equal(r.items.length, 1);
  const r2 = await (await fetch(base + '/api/headlines?after=1')).json();
  assert.equal(r2.items.length, 0);
}));

test('serves the widget and shared scripts; blocks path traversal', () => withServer(async (base) => {
  const home = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(home.status, 302);
  assert.equal((await fetch(base + '/app/')).status, 200);
  assert.equal((await fetch(base + '/shared/engine.js')).status, 200);
  const bad = await fetch(base + '/app/..%2f..%2fpackage.json');
  assert.ok([403, 404].includes(bad.status));
}));

test('the interface contains no user controls, links or inputs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'display/index.html'), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  for (const tag of ['<button', '<a ', '<input', '<select', '<textarea', '<form', '<nav', '<header', '<menu', '<details']) {
    assert.ok(!body.includes(tag), `found ${tag}`);
  }
  const js = fs.readFileSync(path.join(ROOT, 'display/app.js'), 'utf8');
  assert.ok(!/createElement\(['"](a|button|input|select|textarea)['"]\)/.test(js), 'app.js creates a control');
  assert.ok(!/innerHTML\s*=/.test(js), 'headlines must be inserted as text, never HTML');
  const css = fs.readFileSync(path.join(ROOT, 'display/style.css'), 'utf8');
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /overflow:\s*hidden/);
});

test('no paid, keyed or restricted feeds are required', () => {
  assert.ok(sources.length >= 30, 'broad coverage');
  for (const s of sources) {
    assert.match(s.url, /^https:\/\//, s.url);
    assert.ok(!/(api[_-]?key|apikey|token|key=|secret)/i.test(s.url), `credential in ${s.url}`);
  }
  const regions = new Set(sources.map(s => s.region));
  const cats = new Set(sources.map(s => s.category));
  assert.ok(regions.size >= 12, `regions: ${[...regions]}`);
  for (const c of ['world', 'business', 'science', 'technology', 'health', 'environment', 'sport', 'culture']) assert.ok(cats.has(c), c);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // only free, open-source (MIT) runtime libraries: the feed reader and the Capacitor app shell
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@capacitor/android', '@capacitor/core', '@capacitor/ios', 'fast-xml-parser']);
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.equal(app.plugins.CapacitorHttp.enabled, true, 'native HTTP lets the app read feeds directly');
});
