/*
 * build-web.js — prepares the phone app's web content in ./www
 *   npm run build:web
 *
 * 1. Bundles the news engine (core/ + shared/ + fast-xml-parser) into www/engine.js
 * 2. Copies the waterfall display and shared scripts
 * 3. Adjusts index.html for the app (script paths, engine, network policy)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');

function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip.includes(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'display'), OUT, ['sw.js', 'manifest.webmanifest']);
copyDir(path.join(ROOT, 'shared'), path.join(OUT, 'shared'));

esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'mobile', 'bridge.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome90', 'safari15'],
  minify: true,
  legalComments: 'none',
  outfile: path.join(OUT, 'engine.js'),
});

let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.split('../shared/').join('shared/');
html = html.replace('<script src="app.js"></script>', '<script src="engine.js"></script>\n  <script src="app.js"></script>');
html = html.replace(/<link rel="manifest"[^>]*>\s*/, '');
// The app shell (Capacitor) injects its own bridge script into the page, which a strict
// Content-Security-Policy would block. Headlines are always inserted as plain text, never HTML.
html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

const size = fs.statSync(path.join(OUT, 'engine.js')).size;
console.log(`www/ ready (engine.js ${(size / 1024).toFixed(0)} KB). Next: npx cap sync`);
