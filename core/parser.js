/*
 * parser.js — turns RSS 2.0, RSS 1.0 (RDF) and Atom XML into plain headline records.
 */
'use strict';
const { XMLParser } = require('fast-xml-parser');
const norm = require('../shared/normalize.js');

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
});

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] != null ? v['#text'] : v['@_href'] || '');
  return '';
}

function pickLink(links) {
  if (!links) return '';
  const arr = Array.isArray(links) ? links : [links];
  // Atom: prefer rel="alternate" (or no rel); RSS: plain string
  for (const l of arr) {
    if (typeof l === 'string') return l;
    if (l && typeof l === 'object') {
      const rel = l['@_rel'];
      if ((!rel || rel === 'alternate') && l['@_href']) return l['@_href'];
      if (l['#text']) return l['#text'];
    }
  }
  const first = arr[0];
  return first && first['@_href'] ? first['@_href'] : '';
}

function parseDate(s, fallback) {
  const t = Date.parse(text(s));
  if (!Number.isFinite(t)) return fallback;
  // Some feeds stamp items in the future (bad time zones). Never trust > 10 min ahead.
  if (t > fallback + 10 * 60 * 1000) return fallback;
  return t;
}

/**
 * @param {string} xmlText
 * @param {{name:string, region?:string, category?:string}} source
 * @param {number} [now]
 * @returns {Array<{title,url,guid,published,source,region,category}>}
 */
function parseFeed(xmlText, source, now) {
  now = now || Date.now();
  if (source && source.type === 'gdelt') return parseGdelt(xmlText, source, now);
  let doc;
  try { doc = xml.parse(String(xmlText)); } catch (e) { throw new Error('Unreadable XML: ' + e.message); }
  if (!doc || typeof doc !== 'object') throw new Error('Not a feed');

  let raw = [];
  let kind = '';
  if (doc.rss && doc.rss.channel) {
    const ch = Array.isArray(doc.rss.channel) ? doc.rss.channel[0] : doc.rss.channel;
    raw = ch.item || []; kind = 'rss';
  } else if (doc['rdf:RDF']) {
    raw = doc['rdf:RDF'].item || []; kind = 'rdf';
  } else if (doc.feed) {
    raw = doc.feed.entry || []; kind = 'atom';
  } else {
    throw new Error('Not an RSS or Atom feed');
  }

  const out = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const title = norm.cleanTitle(text(it.title), source.name);
    if (!title) continue;
    const url = kind === 'atom' ? pickLink(it.link) : (pickLink(it.link) || text(it['@_rdf:about']));
    const guid = text(it.guid) || text(it.id) || text(it['@_rdf:about']) || '';
    const published = parseDate(it.pubDate || it.published || it.updated || it['dc:date'] || it['a10:updated'], now);
    out.push({
      title,
      url: url.trim(),
      guid: guid.trim(),
      published,
      source: source.name,
      region: source.region || '',
      category: source.category || '',
    });
  }
  return out;
}

/** GDELT "seendate" looks like 20261110T101500Z. */
function gdeltDate(s, fallback) {
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(String(s || ''));
  if (!m) return fallback;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return t > fallback + 10 * 60 * 1000 ? fallback : t;
}

function prettyDomain(d) {
  return String(d || '').toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
}

/**
 * GDELT DOC 2.0 "ArtList" JSON: one free, key-less index covering news sites worldwide.
 * Each article is credited to its own outlet (its web domain), not to GDELT.
 */
function parseGdelt(body, source, now) {
  let data;
  try { data = JSON.parse(String(body)); } catch (e) {
    throw new Error('GDELT answered with a message instead of data: ' + String(body).slice(0, 120));
  }
  const arts = (data && Array.isArray(data.articles)) ? data.articles : [];
  const out = [];
  for (const a of arts) {
    if (!a || !a.title || !a.url) continue;
    const domain = prettyDomain(a.domain || (() => { try { return new URL(a.url).hostname; } catch (e) { return ''; } })());
    const title = norm.cleanTitle(a.title, '');
    if (!title || !domain) continue;
    out.push({
      title,
      url: String(a.url).trim(),
      guid: '',
      published: gdeltDate(a.seendate, now),
      source: domain,
      region: a.sourcecountry || source.region || '',
      category: source.category || 'world',
    });
  }
  return out;
}

module.exports = { parseFeed, parseGdelt, gdeltDate };
