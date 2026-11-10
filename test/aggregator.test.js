'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Aggregator } = require('../core/aggregator.js');
const { rss, response, fakeFetch, clock } = require('./helpers.js');

const MIN = 60000;
const A = { name: 'Outlet A', url: 'https://a.test/feed', category: 'world', region: 'X', every: 10 };
const B = { name: 'Outlet B', url: 'https://b.test/feed', category: 'science', region: 'Y', every: 10 };
const C = { name: 'Outlet C', url: 'https://c.test/feed', category: 'sport', region: 'Z', every: 10 };

function mk(routes, sources, extra) {
  const now = clock();
  const fetchImpl = fakeFetch(routes(now));
  const agg = new Aggregator(Object.assign({ sources: sources || [A, B], fetchImpl, now, random: () => 0.5 }, extra || {}));
  return { agg, now, fetchImpl };
}

test('ingests several sources and removes cross-publisher duplicates', async () => {
  const { agg } = mk(now => ({
    [A.url]: () => response(200, rss([
      { title: 'Magnitude 7.1 earthquake strikes off coast of Japan, tsunami warning issued', url: 'https://a.test/1', published: now() - 5 * MIN },
      { title: 'Parliament passes landmark data privacy law after long debate', url: 'https://a.test/2', published: now() - 9 * MIN },
    ])),
    [B.url]: () => response(200, rss([
      { title: 'Tsunami warning issued after magnitude 7.1 earthquake strikes off Japan coast', url: 'https://b.test/1', published: now() - 2 * MIN },
      { title: 'Astronomers detect water vapour on distant rocky exoplanet', url: 'https://b.test/2', published: now() - 3 * MIN },
    ])),
  }));
  const got = await agg.tick();
  assert.equal(got.length, 3);
  const titles = agg.stream.map(s => s.title);
  // exactly ONE version of the story reported by both outlets survives
  const versions = titles.filter(t => /7\.1 earthquake/.test(t));
  assert.equal(versions.length, 1);
});

test('fresh news keeps entering on later checks; repeats never re-enter', async () => {
  let round = 0;
  const { agg, now } = mk(now => ({
    [A.url]: () => {
      round++;
      const items = [{ title: 'Long-running story that every check of this feed still contains', url: 'https://a.test/old', published: now() - 30 * MIN }];
      for (let i = 0; i < round; i++) items.push({ title: `Distinct development number ${i} in topic${i} region${i} today`, url: `https://a.test/n${i}`, published: now() - i * MIN });
      return response(200, rss(items));
    },
    [B.url]: () => response(304),
  }));
  await agg.tick();
  assert.equal(agg.stream.length, 2);
  now.advance(11 * MIN);
  await agg.tick();
  assert.equal(agg.stream.length, 3);
  now.advance(11 * MIN);
  await agg.tick();
  assert.equal(agg.stream.length, 4);
  const titles = agg.stream.map(s => s.title);
  assert.equal(new Set(titles).size, titles.length, 'no repeats in the stream');
  // sequence numbers strictly increase
  agg.stream.reduce((p, s) => { assert.ok(s.seq > p); return s.seq; }, 0);
});

test('sources are only re-checked when due (schedule + jitter respected)', async () => {
  const { agg, now, fetchImpl } = mk(() => ({ [A.url]: () => response(304), [B.url]: () => response(304) }));
  await agg.tick();
  assert.equal(fetchImpl.calls.length, 2);
  now.advance(5 * MIN); await agg.tick();
  assert.equal(fetchImpl.calls.length, 2, 'not due yet');
  now.advance(6 * MIN); await agg.tick();
  assert.equal(fetchImpl.calls.length, 4);
});

test('conditional requests send ETag / Last-Modified back to the publisher', async () => {
  const { agg, now, fetchImpl } = mk(now => ({
    [A.url]: () => response(200, rss([{ title: 'A story long enough to be accepted here', url: 'https://a.test/x', published: now() }]), { ETag: '"abc"', 'Last-Modified': 'Tue, 10 Nov 2026 09:00:00 GMT' }),
  }), [A]);
  await agg.tick();
  now.advance(11 * MIN); await agg.tick();
  const h = fetchImpl.calls[1].init.headers;
  assert.equal(h['If-None-Match'], '"abc"');
  assert.equal(h['If-Modified-Since'], 'Tue, 10 Nov 2026 09:00:00 GMT');
});

test('failing source backs off exponentially and others keep working', async () => {
  const { agg, now, fetchImpl } = mk(now => ({
    [A.url]: () => response(500),
    [B.url]: () => response(200, rss([{ title: 'Healthy source keeps delivering its headlines', url: 'https://b.test/h', published: now() }])),
  }));
  await agg.tick();
  assert.equal(agg.stream.length, 1);
  const hA = agg.health.get(A.url);
  assert.equal(hA.failures, 1);
  assert.equal(hA.nextFetchAt - now(), 20 * MIN);    // 10 min × 2^1
  now.advance(21 * MIN); await agg.tick();
  assert.equal(agg.health.get(A.url).failures, 2);
  assert.equal(agg.health.get(A.url).nextFetchAt - now(), 40 * MIN);
  assert.ok(fetchImpl.calls.length >= 4);
  const report = agg.healthReport();
  assert.equal(report.find(r => r.url === A.url).healthy, false);
  assert.equal(report.find(r => r.url === B.url).healthy, true);
});

test('rate limits: Retry-After is honoured', async () => {
  const { agg, now } = mk(() => ({ [A.url]: () => response(429, '', { 'Retry-After': '7200' }) }), [A]);
  await agg.tick();
  assert.ok(agg.health.get(A.url).nextFetchAt - now() >= 7200 * 1000);
});

test('network interruption: everything failing at once is treated as offline, not as broken sources', async () => {
  let online = false;
  const throwOrServe = (u) => (init) => {
    if (!online) throw new TypeError('fetch failed');
    return response(200, rss([{ title: `Back online ${u}alpha ${u}beta ${u}gamma ${u}delta`, url: `${u}/1`, published: Date.parse('2026-11-10T10:00:00Z') }]));
  };
  const { agg, now } = mk(() => ({ [A.url]: throwOrServe('a'), [B.url]: throwOrServe('b'), [C.url]: throwOrServe('c') }), [A, B, C]);
  await agg.tick();
  for (const h of agg.health.values()) {
    assert.equal(h.failures, 0, 'sources not penalised');
    assert.ok(h.nextFetchAt - now() <= 2.2 * MIN, 'retries soon');
  }
  online = true;
  now.advance(3 * MIN);
  await agg.tick();
  assert.equal(agg.stream.length, 3);
});

test('timeouts are handled (no hang, no crash)', async () => {
  const slow = (init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const { agg } = mk(() => ({ [A.url]: slow }), [A], { timeoutMs: 50 });
  await agg.tick();
  assert.equal(agg.health.get(A.url).lastError, 'Timed out');
});

test('malformed feed does not break the service', async () => {
  const { agg } = mk(() => ({ [A.url]: () => response(200, '<html>oops</html>') }), [A]);
  await agg.tick();
  assert.equal(agg.health.get(A.url).failures, 1);
  assert.equal(agg.stream.length, 0);
});

test('old stories (> 48h) and section labels are ignored', async () => {
  const { agg } = mk(now => ({
    [A.url]: () => response(200, rss([
      { title: 'A very old story that should never be shown again now', url: 'https://a.test/old', published: now() - 72 * 3600000 },
      { title: 'Sport', url: 'https://a.test/sport', published: now() },
      { title: 'A recent story that qualifies for display today', url: 'https://a.test/new', published: now() },
    ])),
  }), [A]);
  await agg.tick();
  assert.deepEqual(agg.stream.map(s => s.title), ['A recent story that qualifies for display today']);
});

test('getAfter: new clients get recent backlog; cursors return only newer items', async () => {
  const items = [];
  const base = Date.parse('2026-11-10T09:00:00Z');
  for (let i = 0; i < 30; i++) items.push({ title: `Separate headline ${i} about place${i} and thing${i}`, url: `https://a.test/${i}`, published: base + i * MIN });
  const { agg } = mk(() => ({ [A.url]: () => response(200, rss(items)) }), [A]);
  await agg.tick();
  const first = agg.getAfter(-1, 10);
  assert.equal(first.items.length, 10);
  assert.equal(first.cursor, 30);
  assert.equal(agg.getAfter(30).items.length, 0);
  const mid = agg.getAfter(25);
  assert.deepEqual(mid.items.map(i => i.seq), [26, 27, 28, 29, 30]);
});

test('requests to a host that asks for spacing (GDELT) are spaced out', async () => {
  const times = [];
  const G1 = { type: 'gdelt', name: 'G1', url: 'https://g.test/doc?q=1', every: 15, hostGapMs: 120 };
  const G2 = { type: 'gdelt', name: 'G2', url: 'https://g.test/doc?q=2', every: 15, hostGapMs: 120 };
  const G3 = { type: 'gdelt', name: 'G3', url: 'https://g.test/doc?q=3', every: 15, hostGapMs: 120 };
  const serve = () => { times.push(Date.now()); return response(200, '{"articles":[]}'); };
  const { agg } = mk(() => ({ [G1.url]: serve, [G2.url]: serve, [G3.url]: serve }), [G1, G2, G3]);
  await agg.tick();
  assert.equal(times.length, 3);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 110, `gap ${times[i] - times[i - 1]}ms`);
});

test('headlines are released as each source answers (a slow source does not hold up the rest)', async () => {
  let release;
  const slow = () => new Promise(r => { release = () => r(response(200, rss([{ title: 'Slow outlet finally answers with its story', url: 'https://c.test/s', published: Date.parse('2026-11-10T09:59:00Z') }]))); });
  const fast = (u) => () => response(200, rss([{ title: `Quick outlet ${u} delivers ${u}story ${u}today`, url: `https://${u}.test/f`, published: Date.parse('2026-11-10T09:58:00Z') }]));
  const { agg } = mk(() => ({ [A.url]: fast('a'), [B.url]: fast('b'), [C.url]: slow }), [A, B, C]);
  let emitted = 0;
  agg.on('headlines', n => { emitted += n; });
  const p = agg.tick();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(agg.stream.length, 2, 'fast sources already in the stream');
  release();
  await p;
  assert.equal(agg.stream.length, 3);
  assert.equal(emitted, 3);
});
