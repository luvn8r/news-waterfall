/*
 * mobile/bridge.js — runs the full news engine INSIDE the phone app.
 * Bundled by scripts/build-web.js into www/engine.js and loaded before app.js.
 *
 * In the installed app, Capacitor's native HTTP layer (CapacitorHttp) carries every request,
 * so publishers' feeds can be read directly — no computer, server or account needed.
 */
'use strict';
const { Aggregator } = require('../core/aggregator.js');

const agg = new Aggregator({
  fetchImpl: (url, init) => window.fetch(url, init),
  concurrency: 4,
  // Native HTTP layers can mishandle "304 Not Modified" replies, so always ask for the full feed.
  conditionalRequests: false,
  log: (...a) => { try { console.log('[news]', ...a); } catch (e) { /* ignore */ } },
});

window.newsBridge = {
  getAfter: async (after) => agg.getAfter(Number(after), 500),
  health: () => agg.healthReport(),
};

agg.start();

// Phones pause apps in the background. When the app comes back, check for news right away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') agg.tick().catch(() => {});
});

window.__newsEngine = agg;   // used by automated tests only
