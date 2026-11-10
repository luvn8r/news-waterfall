/*
 * aggregator.js — the news service brain. Runs in Node (desktop app, server) AND inside the
 * phone app's web view (bundled), so it uses no Node-only modules.
 *
 *  - Checks each source on its own schedule (with jitter so requests are spread out).
 *  - Retries failed sources with exponential back-off; honours Retry-After (rate limits).
 *  - Spaces out requests to the same host when a source asks for it (e.g. GDELT: 1 per ~6 s).
 *  - Detects "we're offline" (everything failing at once) and simply waits, without
 *    punishing the sources.
 *  - Releases headlines as soon as each source answers, so the first ones appear quickly.
 *  - Removes duplicates and near-duplicates across ALL publishers before anything is
 *    released, then appends new headlines to a numbered stream that clients follow.
 */
'use strict';
const { parseFeed } = require('./parser.js');
const { fetchFeed } = require('./fetcher.js');
const { Deduper } = require('../shared/dedup.js');
const norm = require('../shared/normalize.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Aggregator {
  constructor(opts) {
    opts = opts || {};
    this.sources = opts.sources || require('./sources.js');
    this.fetchImpl = opts.fetchImpl;
    this.now = opts.now || (() => Date.now());
    this.maxAgeMs = (opts.maxAgeHours || 48) * HOUR;
    this.streamCap = opts.streamCap || 3000;
    this.concurrency = opts.concurrency || 4;
    this.timeoutMs = opts.timeoutMs || 15000;
    this.tickMs = opts.tickMs || 30 * 1000;
    this.random = opts.random || Math.random;
    this.log = opts.log || (() => {});
    this.conditional = opts.conditionalRequests !== false;
    this.dedup = new Deduper({ capacity: 8000 });
    this.stream = [];
    this.seq = 0;
    this.health = new Map();
    this._listeners = {};
    this._hostNext = new Map();
    for (const s of this.sources) {
      this.health.set(s.url, {
        name: s.name, url: s.url, category: s.category, region: s.region,
        failures: 0, nextFetchAt: 0, lastOkAt: 0, lastError: '', lastCode: 0,
        etag: undefined, lastModified: undefined, accepted: 0, seen: 0,
      });
    }
    this._timer = null;
    this._running = false;
  }

  on(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this._listeners[ev] || []) { try { fn(...a); } catch (e) { this.log('listener error', e); } } }

  start() {
    if (this._timer) return;
    const loop = () => { this.tick().catch(e => this.log('tick error', e)); };
    loop();
    this._timer = setInterval(loop, this.tickMs);
    if (this._timer.unref) this._timer.unref();
  }

  stop() { clearInterval(this._timer); this._timer = null; }

  _jitter(ms) { return Math.round(ms * (0.9 + this.random() * 0.2)); }

  /** Wait so requests to one host are at least `gap` ms apart (real time). */
  async _throttle(src) {
    const gap = src.hostGapMs || 0;
    if (!gap) return;
    let host;
    try { host = new URL(src.url).host; } catch (e) { return; }
    const t = Date.now();
    const at = Math.max(t, this._hostNext.get(host) || 0);
    this._hostNext.set(host, at + gap);
    if (at > t) await sleep(at - t);
  }

  /** Fetch every source that is due. Returns the headlines accepted in this round. */
  async tick() {
    if (this._running) return [];
    this._running = true;
    try {
      const start = this.now();
      const due = this.sources.filter(s => this.health.get(s.url).nextFetchAt <= start);
      if (!due.length) return [];
      const accepted = [];
      // Offline detection: hold the first few results until we know the network works.
      const detect = due.length >= 3;
      let reachable = !detect, offline = false, completed = 0;
      const held = [];
      let i = 0;

      const worker = async () => {
        while (!offline && i < due.length) {
          const src = due[i++];
          await this._throttle(src);
          if (offline) break;
          const res = await fetchFeed(src.url, this.health.get(src.url), { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, conditional: this.conditional });
          if (offline) break;                                  // decided while this request was in flight
          completed++;
          if (res.status !== 'error' || res.code) {           // any HTTP answer proves we're online
            if (!reachable) { reachable = true; for (const h of held.splice(0)) this._handle(h.src, h.res, accepted); }
          }
          if (reachable) { this._handle(src, res, accepted); continue; }
          held.push({ src, res });
          if (completed >= 3) {
            offline = true;
            held.length = 0;
            const t = this.now();
            for (const s of due) {
              const h = this.health.get(s.url);
              h.lastError = 'offline'; h.nextFetchAt = t + this._jitter(2 * MIN);
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(this.concurrency, due.length) }, worker));
      if (!offline) for (const h of held.splice(0)) this._handle(h.src, h.res, accepted);   // < 3 completed
      if (this.stream.length > this.streamCap) this.stream.splice(0, this.stream.length - this.streamCap);
      return accepted;
    } finally {
      this._running = false;
    }
  }

  _handle(src, res, acceptedOut) {
    const h = this.health.get(src.url);
    const t = this.now();
    if (res.status === 'error') {
      h.failures++; h.lastError = res.error; h.lastCode = res.code || 0;
      let wait = Math.min((src.every || 15) * MIN * Math.pow(2, h.failures), 6 * HOUR);
      if (res.code === 404 || res.code === 410) wait = 6 * HOUR;
      if (res.retryAfterMs) wait = Math.max(wait, res.retryAfterMs);
      h.nextFetchAt = t + this._jitter(wait);
      this.log(`[source] ${src.name} (${src.category}) failed: ${res.error}; retry in ${Math.round(wait / MIN)} min`);
      return;
    }
    h.failures = 0; h.lastError = ''; h.lastCode = res.code; h.lastOkAt = t;
    h.nextFetchAt = t + this._jitter((src.every || 15) * MIN);
    if (res.status === 'not-modified') return;
    h.etag = res.etag; h.lastModified = res.lastModified;
    let items;
    try { items = parseFeed(res.body, src, t); } catch (e) {
      h.failures++; h.lastError = e.message;
      h.nextFetchAt = t + this._jitter(Math.min((src.every || 15) * MIN * Math.pow(2, h.failures), 6 * HOUR));
      return;
    }
    h.seen += items.length;
    // Newest first so the freshest version of a story wins the dedup race.
    items.sort((a, b) => b.published - a.published);
    const cutoff = t - this.maxAgeMs;
    const batch = [];
    for (const it of items) {
      if (it.published < cutoff) continue;
      const words = it.title.split(' ').length;
      if (words < 4 || it.title.length > 300) continue;   // skip section labels / junk
      if (!this.dedup.accept(it)) continue;
      h.accepted++;
      batch.push(it);
    }
    batch.reverse();                                     // oldest-first into the stream
    for (const it of batch) {
      this.stream.push({
        seq: ++this.seq,
        id: norm.hash(norm.canonicalUrl(it.url) || it.guid || norm.normalizeText(it.title)),
        title: it.title,
        source: it.source,
        region: it.region,
        category: it.category,
        published: it.published,
      });
      acceptedOut.push(it);
    }
    if (batch.length) this.emit('headlines', batch.length);
  }

  /**
   * Headlines released after sequence number `after`. A new client passes after = -1
   * and receives the most recent `limit` headlines to start with.
   */
  getAfter(after, limit) {
    limit = Math.max(1, Math.min(limit || 300, 1000));
    after = Number.isFinite(+after) ? +after : -1;
    let items;
    if (after < 0) items = this.stream.slice(-limit);
    else {
      const idx = this.stream.findIndex(x => x.seq > after);
      items = idx === -1 ? [] : this.stream.slice(idx, idx + limit);
    }
    return { items, cursor: items.length ? items[items.length - 1].seq : Math.max(after, 0), latest: this.seq };
  }

  healthReport() {
    const now = this.now();
    return [...this.health.values()].map(h => ({
      name: h.name, category: h.category, region: h.region, url: h.url,
      healthy: h.failures === 0 && h.lastOkAt > 0,
      failures: h.failures, lastError: h.lastError, lastCode: h.lastCode,
      lastOkMinutesAgo: h.lastOkAt ? Math.round((now - h.lastOkAt) / MIN) : null,
      nextCheckInMinutes: Math.max(0, Math.round((h.nextFetchAt - now) / MIN)),
      headlinesAccepted: h.accepted,
    }));
  }
}

module.exports = { Aggregator };
