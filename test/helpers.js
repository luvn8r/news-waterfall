'use strict';
// Test helpers: a fake clock and a fake network that serves generated feeds.

function rss(items) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>' +
    items.map(i => `<item><title>${esc(i.title)}</title><link>${esc(i.url)}</link>` +
      (i.guid ? `<guid>${esc(i.guid)}</guid>` : '') +
      `<pubDate>${new Date(i.published).toUTCString()}</pubDate></item>`).join('') +
    '</channel></rss>';
}

function response(status, body, headers) {
  const h = new Map(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, ok: status >= 200 && status < 300, headers: { get: k => h.get(k.toLowerCase()) || null }, text: async () => body || '' };
}

/** routes: url -> function(reqInit, callCount) returning response or throwing. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (!r) return response(404, 'nope');
    return r(init, calls.filter(c => c.url === url).length);
  };
  fn.calls = calls;
  return fn;
}

function clock(start) {
  let t = start || Date.parse('2026-11-10T10:00:00Z');
  const now = () => t;
  now.advance = ms => { t += ms; };
  return now;
}

module.exports = { rss, response, fakeFetch, clock };
