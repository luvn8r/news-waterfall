'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const norm = require('../shared/normalize.js');
const { Deduper } = require('../shared/dedup.js');

test('normalisation ignores case, punctuation, accents and curly quotes', () => {
  assert.equal(norm.normalizeText('Café “opens”  — TODAY!'), norm.normalizeText('cafe "opens" today'));
  assert.equal(norm.normalizeText("PM’s plan"), norm.normalizeText("PM's plan"));
});

test('entities are decoded, including double-encoded ones; HTML is stripped', () => {
  assert.equal(norm.cleanTitle('Rock &amp;amp; roll &#8217;s <b>best</b>'), 'Rock & roll ’s best');
  assert.equal(norm.cleanTitle('Big story - BBC News', 'BBC News'), 'Big story');
  assert.equal(norm.cleanTitle('VIDEO: Something happened'), 'Something happened');
});

test('canonical URLs drop tracking parameters, fragments, www and trailing slashes', () => {
  assert.equal(norm.canonicalUrl('http://www.Example.com/a/b/?utm_source=x&id=3#top'), norm.canonicalUrl('https://example.com/a/b?id=3'));
  assert.notEqual(norm.canonicalUrl('https://example.com/a?id=3'), norm.canonicalUrl('https://example.com/a?id=4'));
});

test('identical headlines are rejected', () => {
  const d = new Deduper();
  assert.equal(d.accept({ title: 'Volcano erupts on remote island, flights cancelled' }), true);
  assert.equal(d.accept({ title: 'Volcano erupts on remote island, flights cancelled' }), false);
});

test('minor punctuation / case differences are rejected', () => {
  const d = new Deduper();
  d.add({ title: 'Volcano erupts on remote island, flights cancelled' });
  const r = d.check({ title: 'VOLCANO ERUPTS ON REMOTE ISLAND — FLIGHTS CANCELLED!' });
  assert.equal(r.duplicate, true);
  assert.equal(r.reason, 'text');
});

test('same article via guid or canonical URL is rejected even if retitled', () => {
  const d = new Deduper();
  d.add({ title: 'Original wording of a headline here', url: 'https://ex.com/s/1?utm_medium=rss', guid: 'g-1' });
  assert.equal(d.check({ title: 'Completely updated wording now', url: 'https://www.ex.com/s/1' }).reason, 'url');
  assert.equal(d.check({ title: 'Another rewording entirely', guid: 'g-1' }).reason, 'guid');
});

test('near-duplicate headlines across publishers are detected', () => {
  const d = new Deduper();
  d.add({ title: 'Magnitude 7.1 earthquake strikes off coast of Japan, tsunami warning issued' });
  const r1 = d.check({ title: 'Tsunami warning issued after magnitude 7.1 earthquake strikes off Japan coast' });
  assert.equal(r1.duplicate, true);
  assert.equal(r1.reason, 'similar');
  // longer version containing the shorter one
  d.add({ title: 'Central bank raises interest rates to fight inflation' });
  assert.equal(d.check({ title: 'Central bank raises interest rates to fight stubborn inflation, markets slide' }).duplicate, true);
});

test('genuinely different stories are NOT filtered', () => {
  const d = new Deduper();
  d.add({ title: 'Magnitude 7.1 earthquake strikes off coast of Japan, tsunami warning issued' });
  const different = [
    'Japan election: ruling party loses majority in upper house',
    'Scientists discover new species of deep-sea coral near Australia',
    'Central bank raises interest rates to fight inflation',
    'Earthquake drill held in Tokyo schools',
  ];
  for (const t of different) assert.equal(d.check({ title: t }).duplicate, false, t);
});

test('memory is bounded and old entries are evicted cleanly', () => {
  const d = new Deduper({ capacity: 50 });
  for (let i = 0; i < 200; i++) d.add({ title: `Unique story number ${i} about topic${i} and subject${i}` });
  assert.equal(d.size, 50);
  assert.equal(d.check({ title: 'Unique story number 199 about topic199 and subject199' }).duplicate, true);
  // index has no dangling references to evicted slots
  for (const s of d.index.values()) for (const slot of s) assert.ok(d.entries[slot]);
});

test('state survives export/import (persistence across restarts)', () => {
  const a = new Deduper();
  a.add({ title: 'Mars rover finds evidence of ancient lake bed', url: 'https://x.org/m' });
  const b = new Deduper();
  b.importState(JSON.parse(JSON.stringify(a.exportState())));
  assert.equal(b.check({ title: 'mars rover finds evidence of ancient lake bed' }).duplicate, true);
  assert.equal(b.check({ title: 'Different words', url: 'https://x.org/m' }).duplicate, true);
});
