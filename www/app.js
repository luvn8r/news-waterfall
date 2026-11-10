/*
 * app.js — the waterfall display. Runs unchanged in:
 *   • the desktop widget (Electron provides window.newsBridge), and
 *   • any browser / phone / tablet (talks to the news service over HTTP).
 * There are deliberately no controls of any kind.
 */
(function () {
  'use strict';
  const { WaterfallModel } = NW.engine;
  const { HeadlinePicker } = NW.picker;
  const { Deduper } = NW.dedup;

  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  const root = document.documentElement;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Remember what has been shown (survives restarts, minimises repeats) ──
  const STORE_KEY = 'nw.shown.v1';
  const shown = new Deduper({ capacity: 3000 });
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: session-only memory */ } }
  try { const saved = safeGet(STORE_KEY); if (saved) shown.importState(JSON.parse(saved)); } catch (e) { /* ignore corrupt history */ }
  function saveShown() { safeSet(STORE_KEY, JSON.stringify(shown.exportState(2000))); }
  setInterval(saveShown, 30000);
  window.addEventListener('pagehide', saveShown);

  const picker = new HeadlinePicker({ shown });

  // ── Where headlines come from ──
  const bridge = window.newsBridge || {
    async getAfter(after) {
      const r = await fetch('../api/headlines?limit=500&after=' + encodeURIComponent(after), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
  };

  let cursor = -1;
  let everReceived = false;
  let failures = 0;
  const local = !!window.newsBridge;              // engine runs inside this app: asking is free
  async function poll() {
    let delay = local ? 10000 : 30000;
    try {
      const r = await bridge.getAfter(cursor);
      failures = 0;
      if (r && typeof r.latest === 'number' && r.latest < cursor) { cursor = -1; delay = 500; } // service restarted
      else if (r) {
        if (r.items && r.items.length) { picker.push(r.items); everReceived = true; }
        cursor = r.cursor;
        if (r.latest > cursor) delay = 1000;                      // more waiting: fetch the rest soon
        else if (!everReceived) delay = 2000;                     // engine still starting: ask again shortly
      }
      setStatus(everReceived || picker.size ? '' : 'Gathering the world’s headlines…');
    } catch (e) {
      failures++;
      delay = Math.min(60000, 3000 * Math.pow(2, failures - 1));
      if (!model.items.length) setStatus('Waiting for a connection…');
    }
    setTimeout(poll, delay);
  }

  function setStatus(text) {
    if (text && !model.items.length) { status.textContent = text; status.classList.remove('hidden'); }
    else status.classList.add('hidden');
  }

  // ── Sizing: everything scales with the widget, so any size stays readable ──
  let metrics = null;
  function computeMetrics() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    const fs = Math.max(13, Math.min(24, Math.round(w * 0.052 + h * 0.006)));
    const pad = Math.round(Math.max(12, Math.min(28, w * 0.055)));
    root.style.setProperty('--fs', fs + 'px');
    root.style.setProperty('--pad', pad + 'px');
    const lineH = fs * 1.32;
    return {
      width: w, height: h, fs,
      gap: Math.round(fs * 1.35),
      speed: lineH * (reducedMotion ? 0.3 : 0.5),   // ≈ half a line per second
    };
  }

  metrics = computeMetrics();
  const model = new WaterfallModel({ height: metrics.height, gap: metrics.gap, speed: metrics.speed });
  const els = new Map();
  let nextId = 1;

  function makeEl(item) {
    const el = document.createElement('article');
    el.className = 'headline';
    const h2 = document.createElement('h2');
    h2.textContent = item.title;                 // textContent: headlines can never inject markup
    const p = document.createElement('p');
    p.textContent = item.source + (item.region && item.source.indexOf(item.region) === -1 && item.region !== 'International' ? ' · ' + item.region : '');
    el.append(h2, p);
    return el;
  }

  function spawnNext() {
    const item = picker.next();
    if (!item) return false;
    const el = makeEl(item);
    el.style.transform = 'translate3d(0,-10000px,0)';
    stage.appendChild(el);
    const extra = Math.round(metrics.fs * 0.65);  // room for the little divider under each story
    const h = el.offsetHeight + extra;
    const id = nextId++;
    els.set(id, el);
    model.spawn(id, h);
    setStatus('');
    return true;
  }

  function onResize() {
    metrics = computeMetrics();
    model.setSize(metrics.height, metrics.gap, metrics.speed);
    const extra = Math.round(metrics.fs * 0.65);
    for (const it of model.items) model.resize(it.id, els.get(it.id).offsetHeight + extra);
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  // ── The animation loop ──
  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (model.canSpawn() && picker.size) spawnNext();
    const gone = model.step(dt, picker.size);
    for (const id of gone) { const el = els.get(id); if (el) el.remove(); els.delete(id); }
    for (const it of model.items) {
      const el = els.get(it.id);
      if (el) el.style.transform = 'translate3d(0,' + it.y.toFixed(2) + 'px,0)';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Block anything that could act like a control.
  ['contextmenu', 'wheel', 'touchmove', 'keydown', 'dblclick'].forEach(ev =>
    window.addEventListener(ev, e => { if (ev !== 'keydown' || [' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) e.preventDefault(); }, { passive: false }));

  // Keep a phone screen awake while the page is open (only where the browser allows it).
  async function keepAwake() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) { /* not permitted here */ }
  }
  document.addEventListener('visibilitychange', keepAwake);
  keepAwake();

  if ('serviceWorker' in navigator && !window.newsBridge && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.__nw = { model, picker, shown, els };   // used by automated tests only
  setStatus('Gathering the world’s headlines…');
  poll();
})();
