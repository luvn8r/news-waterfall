/*
 * server.js — the news service for phones, tablets and browsers.
 *
 *   npm run server        → http://localhost:8787
 *
 * Serves the waterfall at /app/ and headlines at /api/headlines.
 * Listens on your local network too, so a phone on the same Wi-Fi can open it.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Aggregator } = require('../core/aggregator.js');

const ROOT = path.resolve(__dirname, '..');
const MOUNTS = { '/app/': path.join(ROOT, 'display'), '/shared/': path.join(ROOT, 'shared') };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

function createServer(aggregator) {
  return http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400).end(); return; }
    const p = decodeURIComponent(url.pathname);
    const send = (code, type, body, extra) => {
      res.writeHead(code, Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }, extra || {}));
      res.end(body);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed');

    if (p === '/' || p === '/app') { res.writeHead(302, { Location: '/app/' }); return res.end(); }

    if (p === '/api/headlines') {
      const after = url.searchParams.has('after') ? Number(url.searchParams.get('after')) : -1;
      const limit = Number(url.searchParams.get('limit')) || 300;
      return send(200, 'application/json', JSON.stringify(aggregator.getAfter(after, limit)),
        { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    }
    if (p === '/api/health') {
      const rows = aggregator.healthReport();
      return send(200, 'application/json', JSON.stringify({
        sources: rows.length, healthy: rows.filter(r => r.healthy).length,
        headlinesInStream: aggregator.stream.length, latest: aggregator.seq, details: rows,
      }, null, 2), { 'Cache-Control': 'no-store' });
    }

    for (const [prefix, dir] of Object.entries(MOUNTS)) {
      if (!p.startsWith(prefix)) continue;
      let rel = p.slice(prefix.length) || 'index.html';
      const file = path.resolve(dir, rel);
      if (!file.startsWith(dir + path.sep)) return send(403, 'text/plain', 'Forbidden');
      return fs.readFile(file, (err, data) => {
        if (err) return send(404, 'text/plain', 'Not found');
        send(200, TYPES[path.extname(file)] || 'application/octet-stream', data, { 'Cache-Control': 'no-cache' });
      });
    }
    send(404, 'text/plain', 'Not found');
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  const agg = new Aggregator({ log: (...a) => console.log(new Date().toISOString().slice(11, 19), ...a) });
  agg.on('headlines', n => console.log(new Date().toISOString().slice(11, 19), `+${n} new headlines (stream: ${agg.stream.length})`));
  agg.start();
  createServer(agg).listen(port, host, () => {
    console.log('\n  World News Waterfall is running.\n');
    console.log(`  On this computer:   http://localhost:${port}/`);
    for (const ip of lanAddresses()) console.log(`  On your phone/tablet (same Wi-Fi):   http://${ip}:${port}/`);
    console.log(`  Source health:      http://localhost:${port}/api/health\n`);
    console.log('  Leave this window open. Press Ctrl+C to stop.\n');
  });
}

module.exports = { createServer };
