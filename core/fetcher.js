/*
 * fetcher.js — polite HTTP fetching of one feed.
 * Uses conditional requests (ETag / Last-Modified) so unchanged feeds cost almost nothing.
 */
'use strict';

const USER_AGENT = 'NewsWaterfall/1.0 (headline reader; +https://github.com/)';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @returns {Promise<{status:'ok'|'not-modified'|'error', code?:number, body?:string,
 *           etag?:string, lastModified?:string, retryAfterMs?:number, error?:string}>}
 */
async function fetchFeed(url, cache, opts) {
  opts = opts || {};
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || 15000;
  const ctrl = new AbortController();
  let timer;
  // Some native HTTP layers (e.g. in the phone app) ignore abort signals, so also race a timer.
  const timeout = new Promise(resolve => { timer = setTimeout(() => { ctrl.abort(); resolve({ status: 'error', error: 'Timed out' }); }, timeoutMs); });
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
  };
  if (opts.conditional !== false) {
    if (cache && cache.etag) headers['If-None-Match'] = cache.etag;
    if (cache && cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;
  }
  const attempt = (async () => {
    const res = await fetchImpl(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    if (res.status === 304) return { status: 'not-modified', code: 304 };
    if (!res.ok) {
      let retryAfterMs;
      const ra = res.headers && res.headers.get && res.headers.get('retry-after');
      if (ra) {
        const secs = Number(ra);
        retryAfterMs = Number.isFinite(secs) ? secs * 1000 : Math.max(0, Date.parse(ra) - Date.now());
      }
      return { status: 'error', code: res.status, error: 'HTTP ' + res.status, retryAfterMs };
    }
    const body = await res.text();
    if (body.length > MAX_BYTES) return { status: 'error', code: res.status, error: 'Feed too large' };
    return {
      status: 'ok', code: res.status, body,
      etag: (res.headers && res.headers.get && res.headers.get('etag')) || undefined,
      lastModified: (res.headers && res.headers.get && res.headers.get('last-modified')) || undefined,
    };
  })().catch(e => ({ status: 'error', error: e && e.name === 'AbortError' ? 'Timed out' : String((e && e.message) || e) }));
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchFeed, USER_AGENT };
