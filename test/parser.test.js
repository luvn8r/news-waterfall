'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseFeed } = require('../core/parser.js');

const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const NOW = Date.parse('2026-11-10T10:00:00Z');

test('RSS 2.0: titles cleaned, CDATA + entities handled, dates parsed as UTC', () => {
  const items = parseFeed(fx('rss2.xml'), { name: 'Fixture News', category: 'world', region: 'X' }, NOW);
  assert.equal(items[0].title, 'Fixture: City council approves ‘green’ transport plan');
  assert.equal(items[0].published, Date.parse('2026-11-10T08:00:00Z'));
  assert.equal(items[0].guid, 'fixture-1');
  assert.equal(items[1].title, 'Fixture: Researchers map deep ocean currents with new sensors & drones');
  assert.equal(items[0].source, 'Fixture News');
  assert.equal(items[0].category, 'world');
});

test('future timestamps are clamped to now (bad publisher time zones)', () => {
  const items = parseFeed(fx('rss2.xml'), { name: 'F' }, NOW);
  assert.equal(items.find(i => i.title.includes('future')).published, NOW);
});

test('Atom: alternate link chosen, HTML stripped, time-zone offsets respected', () => {
  const items = parseFeed(fx('atom.xml'), { name: 'A' }, NOW);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://atom.example.org/a/1');
  assert.equal(items[0].title, 'Fixture: Atom entry about solar farm opening in desert region');
  assert.equal(items[0].published, Date.parse('2026-11-09T23:15:00Z'));
});

test('RSS 1.0 / RDF feeds are supported', () => {
  const items = parseFeed(fx('rdf.xml'), { name: 'R' }, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://rdf.example.net/n/1');
});

test('garbage input throws a clear error instead of crashing the service', () => {
  assert.throws(() => parseFeed('<html><body>Not a feed</body></html>', { name: 'x' }), /Not an RSS or Atom feed/);
});

test('GDELT JSON: each article credited to its own outlet; seendate parsed as UTC', () => {
  const body = JSON.stringify({ articles: [
    { url: 'https://www.example.com.au/news/1', title: 'Fixture: Regional council opens new flood levee', seendate: '20261110T091500Z', domain: 'example.com.au', language: 'English', sourcecountry: 'Australia' },
    { url: 'https://news.example.ng/2', title: 'Fixture: Lagos port expansion begins with new terminal', seendate: '20261110T090000Z', domain: 'news.example.ng', language: 'English', sourcecountry: 'Nigeria' },
    { url: 'https://bad.example/3', title: '' },
  ] });
  const items = parseFeed(body, { type: 'gdelt', name: 'GDELT: worldwide', category: 'world' }, NOW);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'example.com.au');
  assert.equal(items[0].region, 'Australia');
  assert.equal(items[0].published, Date.parse('2026-11-10T09:15:00Z'));
  assert.equal(items[1].source, 'news.example.ng');
});

test('GDELT empty result and error text are handled', () => {
  assert.deepEqual(parseFeed('{}', { type: 'gdelt', name: 'g' }, NOW), []);
  assert.throws(() => parseFeed('Please limit requests to one every 5 seconds', { type: 'gdelt', name: 'g' }, NOW), /GDELT answered/);
});
