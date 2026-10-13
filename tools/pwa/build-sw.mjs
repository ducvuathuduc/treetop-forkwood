// 1.0 PWA: bakes tools/pwa/shell.json (+ the WebGL path and icons) into sw.js with a content-hash cache version.
// Run after changing any shipped file: node tools/pwa/build-sw.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
const R = new URL('../../', import.meta.url).pathname;
const extra = ['manifest.webmanifest', 'icon-180.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png',
  'src/imgfade.js', 'src/vendor/pixi.mjs', 'src/gfx/gl.js', 'src/gfx/atlas.js', 'src/gfx/living.js', 'src/gfx/living-data.js', 'src/gfx/skins.js', 'src/gfx/vine-art.js'];
const shell = [...new Set([...JSON.parse(readFileSync(R + 'tools/pwa/shell.json', 'utf8')), ...extra])].filter((p) => p === './' || existsSync(R + p));
const h = createHash('sha1');
for (const p of shell) h.update(p).update(readFileSync(R + (p === './' ? 'index.html' : p)));
const VER = 'fw-1.0-' + h.digest('hex').slice(0, 10);
const src = readFileSync(R + 'tools/pwa/sw.template.js', 'utf8').replace('__VERSION__', VER).replace('__SHELL__', JSON.stringify(shell));
writeFileSync(R + 'sw.js', src);
console.log('sw.js', VER, shell.length, 'files');
