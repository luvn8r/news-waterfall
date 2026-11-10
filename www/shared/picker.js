/*
 * picker.js — decides which waiting headline enters the waterfall next.
 *
 * - Freshest stories first.
 * - Spreads publishers and categories out so one outlet never dominates.
 * - Final no-repeat gate: every pick is checked against everything already shown
 *   (exact AND near-duplicate), so a headline can never re-enter during a session.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const dd = isNode ? require('./dedup.js') : root.NW.dedup;
  const norm = isNode ? require('./normalize.js') : root.NW.normalize;
  const mod = factory(dd, norm);
  if (isNode) module.exports = mod;
  else { root.NW = root.NW || {}; root.NW.picker = mod; }
})(typeof self !== 'undefined' ? self : this, function (dd, norm) {
  'use strict';

  const HOUR = 3600 * 1000;

  class HeadlinePicker {
    constructor(opts) {
      opts = opts || {};
      this.maxAgeMs = opts.maxAgeMs || 48 * HOUR;
      this.maxBuffer = opts.maxBuffer || 1500;
      this.now = opts.now || (() => Date.now());
      this.shown = opts.shown || new dd.Deduper({ capacity: 3000 });
      this.queue = [];
      this.queuedKeys = new Set();
      this.recentSources = [];
      this.recentCategories = [];
    }

    /** Add candidate headlines. Returns how many were queued. */
    push(items) {
      let added = 0;
      for (const it of items || []) {
        if (!it || !it.title) continue;
        const key = it.id || norm.hash(norm.normalizeText(it.title));
        if (this.queuedKeys.has(key)) continue;
        if (this.shown.check(it).duplicate) continue;
        this.queuedKeys.add(key);
        this.queue.push(Object.assign({ _key: key }, it));
        added++;
      }
      this._trim();
      return added;
    }

    _trim() {
      const cutoff = this.now() - this.maxAgeMs;
      if (this.queue.some(q => (q.published || 0) < cutoff)) {
        this.queue = this.queue.filter(q => {
          const ok = (q.published || 0) >= cutoff;
          if (!ok) this.queuedKeys.delete(q._key);
          return ok;
        });
      }
      if (this.queue.length > this.maxBuffer) {
        this.queue.sort((a, b) => (b.published || 0) - (a.published || 0));
        for (const q of this.queue.splice(this.maxBuffer)) this.queuedKeys.delete(q._key);
      }
    }

    _score(q, now) {
      const ageH = Math.max(0, (now - (q.published || 0)) / HOUR);
      let s = -ageH;
      const si = this.recentSources.indexOf(q.source);
      if (si !== -1) s -= 6 * (1 - si / 6);          // recently used outlet: push it back
      const ci = this.recentCategories.indexOf(q.category);
      if (ci !== -1) s -= 1.5 * (1 - ci / 3);        // vary topics a little
      return s;
    }

    /** Take the next headline to display, or null if nothing new is available. */
    next() {
      this._trim();
      const now = this.now();
      while (this.queue.length) {
        let bestI = 0, best = -Infinity;
        for (let i = 0; i < this.queue.length; i++) {
          const sc = this._score(this.queue[i], now);
          if (sc > best) { best = sc; bestI = i; }
        }
        const pick = this.queue.splice(bestI, 1)[0];
        this.queuedKeys.delete(pick._key);
        if (!this.shown.accept(pick)) continue;   // became a duplicate of something shown since queuing
        this.recentSources.unshift(pick.source); this.recentSources.length = Math.min(this.recentSources.length, 6);
        this.recentCategories.unshift(pick.category); this.recentCategories.length = Math.min(this.recentCategories.length, 3);
        delete pick._key;
        return pick;
      }
      return null;
    }

    get size() { return this.queue.length; }
  }

  return { HeadlinePicker };
});
