/*
 * normalize.js — text and URL normalisation shared by the news service and the display.
 * Works in Node (require) and in the browser (window.NW.normalize).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NW = root.NW || {}; root.NW.normalize = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
    ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', eacute: '\u00E9',
    euro: '\u20AC', pound: '\u00A3', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
  };

  /** Decode HTML entities. Runs twice to cope with double-encoded feeds (&amp;#8217;). */
  function decodeEntities(s) {
    let out = String(s == null ? '' : s);
    for (let pass = 0; pass < 2; pass++) {
      out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body) => {
        if (body[0] === '#') {
          const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
        }
        const v = NAMED[body.toLowerCase()];
        return v !== undefined ? v : m;
      });
    }
    return out;
  }

  /** Turn a raw feed title into clean display text. */
  function cleanTitle(raw, sourceName) {
    let t = decodeEntities(String(raw == null ? '' : raw));
    t = t.replace(/<[^>]*>/g, ' ');          // strip any HTML tags
    t = t.replace(/[\u0000-\u001F\u007F]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    // Remove trailing " - Publisher" / " | Publisher" if it repeats the source name.
    if (sourceName) {
      const base = String(sourceName).replace(/\s*\(.*\)\s*$/, '').trim();
      if (base) {
        const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        t = t.replace(new RegExp('\\s+[-\u2013\u2014|:]\\s+' + esc + '\\s*$', 'i'), '').trim();
      }
    }
    // Remove common prefixes that are labels, not news ("VIDEO:", "Live:" kept — it is meaningful).
    t = t.replace(/^(watch|video|audio|podcast|gallery|in pictures|photos)\s*[:\-\u2013|]\s*/i, '');
    return t;
  }

  /** Lowercase, strip accents/punctuation, collapse spaces — for exact-match keys. */
  function normalizeText(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\u2018\u2019\u201B\u2032`']/g, '')     // apostrophes join words: "it's" -> "its"
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const STOP = new Set(('a an the and or but of to in on at for from by with as is are was were be been being ' +
    'it its this that these those after before over under into out up down off about amid says say said ' +
    'will would could should can may might has have had do does did not no new news live latest update updates ' +
    'how why what who when where which than then there their they them he she his her we our you your i ' +
    'just more most very also vs via per').split(' '));

  /** Light stemming so "talks"/"talk", "rises"/"rise" compare equal. */
  function stem(w) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && w.endsWith('es') && /(sh|ch|x|z|ss)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
    return w;
  }

  /** Significant word tokens used for near-duplicate detection. */
  function tokens(s) {
    const words = normalizeText(s).split(' ');
    const out = new Set();
    for (const w of words) {
      if (!w || STOP.has(w)) continue;
      if (w.length < 2 && !/\d/.test(w)) continue;
      out.add(stem(w));
    }
    return out;
  }

  const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|cmpid$|ocid$|at_medium$|at_campaign$|at_custom|CMP$|src$|rss$|ito$)/i;

  /** Canonical form of an article URL (drops tracking params, fragments, www., trailing slash). */
  function canonicalUrl(u) {
    if (!u) return '';
    try {
      const url = new URL(String(u).trim());
      url.hash = '';
      url.protocol = 'https:';
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^amp\./, '');
      const keep = [];
      url.searchParams.forEach((v, k) => { if (!TRACKING.test(k)) keep.push([k, v]); });
      keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      url.search = keep.length ? '?' + keep.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
      url.pathname = url.pathname.replace(/\/amp\/?$/, '/').replace(/\/+$/, '') || '/';
      let s = url.toString();
      s = s.replace(/\/+$/, '');
      return s;
    } catch (e) {
      return String(u).trim().toLowerCase();
    }
  }

  /** Fast, synchronous 64-bit-ish hash (two FNV-1a passes), returned as hex. */
  function hash(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + i; h2 = Math.imul(h2, 0x5bd1e995); h2 ^= h2 >>> 15;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  return { decodeEntities, cleanTitle, normalizeText, tokens, stem, canonicalUrl, hash, STOP };
});
