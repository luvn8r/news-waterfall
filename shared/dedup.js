/*
 * dedup.js — the no-repetition engine.
 *
 * A headline is treated as already seen if ANY of these match something remembered:
 *   1. the publisher's article id (guid)                    -> "guid"
 *   2. the canonical article URL                             -> "url"
 *   3. the normalised headline text (punctuation/case-proof) -> "text"
 *   4. a near-duplicate headline (same story, other words)   -> "similar"
 *
 * Near-duplicates are found with an inverted index of significant words, then scored with
 * Jaccard similarity and a containment score (catches one headline being a longer version
 * of another). Works in Node and the browser.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const norm = isNode ? require('./normalize.js') : root.NW.normalize;
  const mod = factory(norm);
  if (isNode) module.exports = mod;
  else { root.NW = root.NW || {}; root.NW.dedup = mod; }
})(typeof self !== 'undefined' ? self : this, function (norm) {
  'use strict';

  const DEFAULTS = {
    capacity: 5000,          // how many headlines to remember for similarity checks
    jaccard: 0.6,            // word-overlap ratio that counts as "same story"
    containment: 0.8,        // share of the shorter headline's words found in the longer one
    minTokensForContainment: 5,
    minTokensForSimilarity: 3,
  };

  class Deduper {
    constructor(opts) {
      this.opts = Object.assign({}, DEFAULTS, opts || {});
      this.exact = new Set();        // guid:, url:, txt: keys
      this.exactOrder = [];          // FIFO so memory stays bounded
      this.entries = [];             // ring buffer of { tokens:Set, title }
      this.head = 0;
      this.index = new Map();        // token -> Set(entry slot)
    }

    static keysFor(item) {
      const keys = [];
      if (item.guid) keys.push('guid:' + norm.hash(String(item.guid).trim()));
      const cu = norm.canonicalUrl(item.url);
      if (cu) keys.push('url:' + norm.hash(cu));
      const nt = norm.normalizeText(item.title);
      if (nt) keys.push('txt:' + norm.hash(nt));
      return keys;
    }

    /** Returns { duplicate: boolean, reason?: string, match?: string } without remembering. */
    check(item) {
      const keys = Deduper.keysFor(item);
      for (const k of keys) {
        if (this.exact.has(k)) return { duplicate: true, reason: k.slice(0, k.indexOf(':')) === 'txt' ? 'text' : k.slice(0, k.indexOf(':')) };
      }
      const toks = norm.tokens(item.title);
      const m = this._similar(toks);
      if (m) return { duplicate: true, reason: 'similar', match: m.title, score: m.score };
      return { duplicate: false };
    }

    /** Remember an item so it (and close variants) are rejected from now on. */
    add(item) {
      for (const k of Deduper.keysFor(item)) this._addExact(k);
      const toks = norm.tokens(item.title);
      if (toks.size === 0) return;
      const cap = this.opts.capacity;
      const slot = this.entries.length < cap ? this.entries.length : this.head;
      if (this.entries.length >= cap) {
        const old = this.entries[slot];
        if (old) for (const t of old.tokens) { const s = this.index.get(t); if (s) { s.delete(slot); if (!s.size) this.index.delete(t); } }
        this.head = (this.head + 1) % cap;
      }
      this.entries[slot] = { tokens: toks, title: item.title };
      for (const t of toks) { let s = this.index.get(t); if (!s) this.index.set(t, (s = new Set())); s.add(slot); }
    }

    /** check() + add() in one step. Returns true if the item is new (and was accepted). */
    accept(item) {
      const r = this.check(item);
      if (r.duplicate) return false;
      this.add(item);
      return true;
    }

    _addExact(k) {
      if (this.exact.has(k)) return;
      this.exact.add(k); this.exactOrder.push(k);
      const max = this.opts.capacity * 3;
      if (this.exactOrder.length > max * 1.2) {
        const drop = this.exactOrder.splice(0, this.exactOrder.length - max);
        for (const d of drop) this.exact.delete(d);
      }
    }

    _similar(toks) {
      const n = toks.size;
      if (n < this.opts.minTokensForSimilarity) return null;
      const overlap = new Map();
      for (const t of toks) {
        const s = this.index.get(t);
        if (!s) continue;
        for (const slot of s) overlap.set(slot, (overlap.get(slot) || 0) + 1);
      }
      let best = null;
      for (const [slot, inter] of overlap) {
        const e = this.entries[slot];
        const m = e.tokens.size;
        if (m < this.opts.minTokensForSimilarity) continue;
        const jac = inter / (n + m - inter);
        const minSize = Math.min(n, m);
        const cont = minSize >= this.opts.minTokensForContainment ? inter / minSize : 0;
        const hit = jac >= this.opts.jaccard || cont >= this.opts.containment;
        if (hit) {
          const score = Math.max(jac, cont);
          if (!best || score > best.score) best = { title: e.title, score };
        }
      }
      return best;
    }

    /** Serialise for persistence (titles are enough to rebuild everything). */
    exportState(limit) {
      const out = [];
      const n = this.entries.length;
      for (let i = 0; i < n; i++) {
        const e = this.entries[(this.head + i) % n];
        if (e) out.push(e.title);
      }
      return { v: 1, titles: limit ? out.slice(-limit) : out, keys: this.exactOrder.slice(-(limit ? limit * 3 : undefined)) };
    }

    importState(state) {
      if (!state || state.v !== 1) return;
      for (const k of state.keys || []) this._addExact(k);
      for (const t of state.titles || []) this.add({ title: t });
    }

    get size() { return this.entries.length; }
  }

  return { Deduper, DEFAULTS };
});
