// Forkwood v3 HOME: type pairings (display + UI), self-hosted OFL subsets (latin + vietnamese,
// split by unicode-range so Vietnamese text pulls only the small VI file).
//   ?font=1|2|3 (persisted in localStorage 'forkwood.font'; Settings > Dev also switches it)
//   4  Grandstander 600/800 + Nunito 700/900 (V3.2 default: organic, hand-cut, still very legible);
//      the Home logo additionally uses Sansita Swashed 900 ('FW Logo', declared in home.css)
//   1  Baloo 2 800 + Nunito 700/900       (V3.0/3.1 default: warm, rounded, casual-mobile)
//   2  Lexend 700 + Be Vietnam Pro 600/800 (clean, very legible, Vietnamese-native)
//   3  Bricolage Grotesque 800 + Plus Jakarta Sans 600/800 (studio / editorial)
// Applies to the DOM (CSS vars --display / --ui via :root[data-font]) AND to canvas text: the
// shared FONT table in render.js is mutated in place (every ctx.font is built from it per call),
// and the two legacy family names hard-coded in older canvas modules ("Bricolage", "Fraunces")
// are re-pointed at the chosen faces by @font-face aliases declared last in the document.
import { FONT } from './render.js';

const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD';
const VI = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';
// file stem, weights shipped
export const PAIRINGS = {
  1: { name: 'Baloo 2 + Nunito', display: ['baloo2', [800]], ui: ['nunito', [700, 900]] },
  2: { name: 'Lexend + Be Vietnam Pro', display: ['lexend', [700]], ui: ['bevn', [600, 800]] },
  3: { name: 'Bricolage Grotesque + Plus Jakarta Sans', display: ['bricolage', [800]], ui: ['pjs', [600, 800]] },
  4: { name: 'Grandstander + Nunito', display: ['grandstander', [600, 800]], ui: ['nunito', [700, 900]] },
};
export const DEFAULT_FONT = 4;
const KEY = 'forkwood.font';
const BASE = 'assets/fonts/v3/';
const FALLBACK_UI = '"Segoe UI", system-ui, -apple-system, sans-serif';

export function readFont() {
  try {
    const u = new URLSearchParams(location.search).get('font');
    if (PAIRINGS[u]) { localStorage.setItem(KEY, u); return +u; }
    const s = localStorage.getItem(KEY);
    if (PAIRINGS[s]) return +s;
  } catch { /* private mode */ }
  return DEFAULT_FONT;
}

// weight ranges so 400–650 requests use the lighter file and 650–1000 the heavier one
const ranges = (ws) => ws.length === 1 ? [[ws[0], '100 1000']] : [[ws[0], `100 ${Math.round((ws[0] + ws[1]) / 2) - 1}`], [ws[1], `${Math.round((ws[0] + ws[1]) / 2)} 1000`]];
function faces(family, [stem, ws]) {
  let css = '';
  for (const [w, r] of ranges(ws)) for (const [sub, ur] of [['latin', LAT], ['vi', VI]]) css += `@font-face{font-family:"${family}";src:url("${BASE}${stem}-${sub}-${w}.woff2") format("woff2");font-weight:${r};font-display:swap;unicode-range:${ur}}\n`;
  return css;
}

let current = 0;
export function applyFont(n = readFont()) {
  const P = PAIRINGS[n] || PAIRINGS[DEFAULT_FONT];
  current = PAIRINGS[n] ? n : DEFAULT_FONT;
  if (typeof document === 'undefined') return current;
  document.documentElement.dataset.font = String(current);
  let st = document.getElementById('fw-fonts');
  if (!st) { st = document.createElement('style'); st.id = 'fw-fonts'; document.head.appendChild(st); }
  // FW Display / FW UI are what every surface uses; the legacy names are aliases for older canvas code
  st.textContent = faces('FW Display', P.display) + faces('FW UI', P.ui) + faces('Fraunces', P.display) + faces('Fraunces Display', P.display) + faces('Bricolage', P.ui);
  FONT.display = `"FW Display", ${FALLBACK_UI}`;
  FONT.ui = `"FW UI", ${FALLBACK_UI}`;
  FONT.mono = FONT.ui;
  // warm the faces the first frame needs (canvas text does not trigger font loads on its own)
  try { for (const s of ['800 20px "FW Display"', '700 14px "FW UI"', '900 14px "FW UI"']) document.fonts.load(s, 'Forkwood Đêm'); } catch { /* old browser */ }
  return current;
}
export function setFont(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ } return applyFont(n); }
export const fontId = () => current;
