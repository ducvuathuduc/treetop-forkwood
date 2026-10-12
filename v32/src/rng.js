// Small deterministic helpers shared by the game and the headless bot.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC date as YYYYMMDD number, used as the Daily Tree seed. */
export function dailySeed(date = new Date()) {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

export function dailyLabel(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a over numbers -> 6 hex chars, a "commit hash" for a finished tree. */
export function treeHash(nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    let v = Math.round(n) | 0;
    for (let k = 0; k < 4; k++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>= 8;
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
