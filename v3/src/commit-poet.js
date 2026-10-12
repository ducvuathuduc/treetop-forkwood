// V3.2-CARD: the tree's "commit message" for the postcard, git-log style:
//   a1d42f feat(cypress): climbed 412 m through the starry storm
// OFFLINE by default: templates + run stats + each world's vocabulary, seeded by
// the tree hash so the same run always gets the same line, in English or
// Vietnamese. An optional AI line comes from a tiny Cloudflare Worker
// (worker/commit-poet/) only when an endpoint is configured; the client never
// holds a key, waits at most 2 s and falls back to the offline line.

// ---------------------------------------------------------------- vocabulary
// species: what the vine grows into in each world; adj: name adjectives;
// place: where it climbed (EN takes "through/over/above ..."; VI reads after "qua/trên").
export const WORLD_WORDS = {
  meadow: { sp: ['oak', 'sồi'], adj: [['Amber', 'hổ phách'], ['Windswept', 'lộng gió'], ['Golden', 'vàng óng'], ['Ember', 'than hồng']],
    place: [['the tall grass', 'đồng cỏ cao'], ['the levee wind', 'gió trên đê'], ['a sky on fire', 'bầu trời rực lửa'], ['the train-line dusk', 'hoàng hôn bên đường tàu']] },
  starry: { sp: ['cypress', 'bách'], adj: [['Cobalt', 'lam cô-ban'], ['Swirling', 'cuộn xoáy'], ['Chrome', 'vàng crôm'], ['Nightblue', 'xanh đêm']],
    place: [['the turning sky', 'bầu trời xoay'], ['a river of stars', 'dòng sông sao'], ['the village lights', 'ánh đèn làng'], ['the swirling night', 'đêm cuộn xoáy']] },
  fresco: { sp: ['olive', 'ô liu'], adj: [['Gilded', 'dát vàng'], ['Plaster', 'vôi vữa'], ['Vaulted', 'vòm cao'], ['Saintly', 'thánh thiện']],
    place: [['the painted vaults', 'những vòm bích họa'], ['the coffered ceiling', 'trần ô kẻ'], ['a dome of gold', 'mái vòm vàng'], ['the chapel hush', 'nhà nguyện lặng im']] },
  ukiyo: { sp: ['pine', 'thông'], adj: [['Prussian', 'lam Phổ'], ['Foamclaw', 'vuốt bọt'], ['Woodblock', 'khắc gỗ'], ['Windbent', 'nghiêng gió']],
    place: [['the great wave', 'con sóng lớn'], ['the claws of foam', 'móng vuốt bọt sóng'], ['the sacred mountain', 'ngọn núi thiêng'], ['the washi mist', 'làn sương giấy']] },
  lilies: { sp: ['willow', 'liễu'], adj: [['Lilac', 'tím nhạt'], ['Dappled', 'lốm đốm nắng'], ['Misty', 'mờ sương'], ['Wisteria', 'tử đằng']],
    place: [['the lily pond', 'hồ súng'], ['the green bridge', 'cây cầu xanh'], ['the wisteria', 'giàn tử đằng'], ['the morning haze', 'sương sớm']] },
  gilded: { sp: ['birch', 'bạch dương'], adj: [['Goldleaf', 'lá vàng'], ['Mosaic', 'khảm'], ['Gleaming', 'lấp lánh'], ['Tessera', 'ghép mảnh']],
    place: [['the gold leaf', 'lá vàng quỳ'], ['a mosaic forest', 'khu rừng khảm'], ['the glinting birches', 'rừng bạch dương'], ['the tesserae', 'những mảnh khảm']] },
  lacquer: { sp: ['bamboo', 'tre'], adj: [['Lacquered', 'sơn mài'], ['Eggshell', 'vỏ trứng'], ['Lanternlit', 'đèn lồng'], ['Vermilion', 'son đỏ']],
    place: [['the lotus pond', 'ao sen'], ['the bamboo', 'rặng tre'], ['the village roofs', 'mái làng'], ['the gilded moon', 'vầng trăng vàng']] },
};
const STAGE_VI = { Twig: 'Cành non', Sapling: 'Cây non', Bough: 'Cành lớn', Canopy: 'Tán lá', Treetop: 'Ngọn cây', Cloudline: 'Tầng mây', Starlight: 'Ánh sao' };
export const stageName = (name, lang) => (lang === 'vi' ? STAGE_VI[name] || name : name);
// what cut a branch (hit sources: trap ids, v2 mechanics, hazards)
const CAUSE = {
  crow: ['the crow', 'con quạ', 'crow', 'quạ'], tide: ['the tide', 'thủy triều', 'tide', 'triều'], twig: ['a snapping twig', 'cành gãy', 'twig', 'cành'],
  cap: ['a false light', 'ánh sáng giả', 'lure', 'bả'], wall: ['a false light', 'ánh sáng giả', 'lure', 'bả'], beetle: ['a beetle', 'bọ cánh cứng', 'beetle', 'bọ'],
  bolt: ['lightning', 'tia sét', 'bolt', 'sét'], boss: ['the guardian', 'kẻ canh giữ', 'boss', 'boss'], bats: ['the bats', 'bầy dơi', 'bats', 'dơi'],
  beam: ['the glare', 'tia chói', 'glare', 'tia chói'], candy: ['the crusher', 'máy nghiền', 'crusher', 'nghiền'], cone: ['a pinecone', 'quả thông', 'cone', 'quả thông'],
  hornets: ['the hornets', 'đàn ong bắp cày', 'hornets', 'ong'], icicle: ['an icicle', 'cột băng', 'icicle', 'băng'], vortex: ['the vortex', 'vòng xoáy', 'vortex', 'xoáy'],
  twins: ['the twin thorns', 'gai song sinh', 'twins', 'gai đôi'], web: ['a spider web', 'mạng nhện', 'web', 'mạng nhện'], pecker: ['the woodpecker', 'chim gõ kiến', 'woodpecker', 'gõ kiến'],
  jaws: ['the flytrap', 'cây bắt ruồi', 'flytrap', 'bắt ruồi'], spores: ['sleep spores', 'bào tử ngủ', 'spores', 'bào tử'], embers: ['the embers', 'tàn lửa', 'embers', 'tàn lửa'],
  seesaw: ['the seesaw bough', 'cành bập bênh', 'seesaw', 'bập bênh'], strangle: ['the strangler fig', 'rễ si siết', 'fig', 'rễ si'], pendulum: ['the pendulum', 'con lắc tre', 'pendulum', 'con lắc'],
  hedge: ['a gust', 'cơn gió', 'gust', 'gió'], pulse: ['the pulse', 'nhịp sóng', 'pulse', 'nhịp'], door: ['a closing door', 'cánh cửa khép', 'door', 'cửa'],
  frost: ['the frost', 'sương giá', 'frost', 'giá'], column: ['a thorn column', 'cột gai', 'thorns', 'gai'], gate: ['a thorn gate', 'cổng gai', 'thorns', 'gai'],
};
const causeOf = (src, lang) => { const c = CAUSE[src] || ['the thorns', 'bụi gai', 'thorns', 'gai']; return lang === 'vi' ? c[1] : c[0]; };
export const causeShort = (src, lang) => { const c = CAUSE[src] || ['', '', 'thorns', 'gai']; return lang === 'vi' ? c[3] : c[2]; };

// ---------------------------------------------------------------- seeded rng
function rngFrom(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const NUM_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
const NUM_EN = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${num(n, 'en')} times`);
const num = (n, lang) => (n <= 10 ? (lang === 'vi' ? NUM_VI : NUM_EN)[n] : String(n));

/** The run's facts the poet uses (also the payload sent to the optional AI worker: numbers and enums only). */
export function poemFacts(H, sum, world) {
  const stormsThrough = (H.storms || []).filter((s) => s.through).length;
  return {
    world: WORLD_WORDS[world] ? world : 'meadow',
    height: Math.floor(sum.height), stage: sum.stage, won: !!sum.won, end: sum.end || '',
    cause: H.endSrc || '', forks: H.forks, merges: H.merges, deaths: H.deaths.length,
    deathCauses: [...new Set(H.deaths.map((d) => d.src || 'thorns'))].slice(0, 3),
    sun: H.sun, blooms: H.blooms, storms: stormsThrough, stormIn: (H.storms || []).length > stormsThrough,
    maxMult: sum.maxMult || H.maxMult || 1, goldens: sum.goldens || H.goldens || 0, time: Math.round(sum.time || H.time || 0),
    newBest: !!sum.newBest,
  };
}

/** Tree name: "Cobalt Cypress" / "Bách lam cô-ban". */
export function treeName(F, seed, lang) {
  const W = WORLD_WORDS[F.world], r = rngFrom('name' + seed);
  const a = pick(r, W.adj);
  if (lang === 'vi') { const s = `${W.sp[1]} ${a[1]}`; return s[0].toUpperCase() + s.slice(1); }
  return `${a[0]} ${W.sp[0][0].toUpperCase()}${W.sp[0].slice(1)}`;
}

/**
 * The offline poet. Returns { sha, type, scope, line, name, text } where text is
 * the git-log oneline "sha type(scope): line". Same facts + seed -> same line.
 */
export function offlinePoem(F, seed, lang = 'en') {
  const vi = lang === 'vi';
  const W = WORLD_WORDS[F.world];
  const r = rngFrom(`poem|${seed}`); // same template in both languages: VI is the translation of EN
  const pl = pick(r, W.place)[vi ? 1 : 0];
  const h = F.height, st = vi ? stageName(F.stage, lang) : `the ${F.stage}`, sp = W.sp[vi ? 1 : 0];
  const cause = causeOf(F.cause, lang), d = F.deaths, mg = F.merges;
  // candidate lines, each with a salience weight for this run; pick by weight
  const C = [];
  const add = (w, type, en, viT) => { if (w > 0) C.push({ w, type, line: vi ? viT : en }); };
  if (h < 25) {
    add(3, 'chore', `a first green shoot by ${pl}`, `chồi xanh đầu tiên bên ${pl}`);
    add(2, 'chore', `${h} m tall, and already reaching`, `cao ${h} m, đã biết vươn lên`);
    if (F.end === 'hit' || F.cause) add(2, 'revert', `${cause} came early; the seed remembers`, `${cause} đến sớm, hạt mầm vẫn nhớ`);
  }
  if (F.won && h >= 25) {
    add(6, 'release', `reached ${st} and kept on growing`, `chạm tới ${st} rồi vẫn lớn tiếp`);
    add(4, 'release', `${h} m, all the way above ${pl}`, `${h} m, vượt hẳn lên trên ${pl}`);
  }
  if (F.storms) {
    add(5, 'feat', `climbed ${h} m through the storm over ${pl}`, `leo ${h} m xuyên cơn bão trên ${pl}`);
    add(3, 'feat', `weathered ${num(F.storms, lang)} storm${F.storms > 1 ? 's' : ''} and still reached`, `qua ${num(F.storms, lang)} cơn bão, vẫn vươn cao`);
  }
  if (F.stormIn && !F.won) add(4, 'fix', `went down singing in the storm at ${h} m`, `ngã giữa cơn bão ở ${h} m, vẫn hát`);
  if (d >= 3) {
    add(4 + d * 0.3, 'fix', `lost ${num(d, lang)} branches, grew ${h} m anyway`, `mất ${num(d, lang)} nhánh, vẫn cao ${h} m`);
    add(3, 'fix', `pruned ${times(d)}, still reaching for ${pl}`, `bị tỉa ${num(d, lang)} lần, vẫn vươn tới ${pl}`);
  } else if (d >= 1 && h >= 40) {
    const dc = causeOf(F.deathCauses[0], lang);
    add(2.5, 'fix', `gave one branch to ${dc}, kept the other`, `để lại một nhánh cho ${dc}, giữ nhánh kia`);
  }
  if (mg >= 6) {
    add(3 + mg * 0.15, 'refactor', `merged ${mg} branches into one ${h} m trunk`, `gộp ${mg} nhánh thành một thân ${h} m`);
    add(2.5, 'refactor', `forked ${F.forks} times, came home ${mg}`, `rẽ nhánh ${F.forks} lần, quay về ${mg} lần`);
  }
  if (F.maxMult >= 6) add(3, 'perf', `hit ×${F.maxMult} and caught the golden hour`, `đạt ×${F.maxMult}, đón trọn giờ vàng`);
  if (F.blooms >= 2) add(3 + F.blooms * 0.3, 'style', `bloomed ${times(F.blooms)} above ${pl}`, `nở hoa ${num(F.blooms, lang)} lần trên ${pl}`);
  if (F.sun >= 40) add(2, 'feat', `drank ${F.sun} sunlights on the way to ${st}`, `uống ${F.sun} giọt nắng trên đường tới ${st}`);
  if (F.end === 'sap' && h >= 25) add(3, 'fix', `ran out of sap at ${h} m, leaves still warm`, `cạn nhựa ở ${h} m, lá vẫn còn ấm`);
  if (F.cause && !F.won && h >= 25) add(3, 'fix', `fell to ${cause} at ${h} m, mid-reach`, `gục trước ${cause} ở ${h} m, giữa lúc vươn`);
  if (F.newBest && h >= 25) add(3, 'feat', `the tallest one yet: ${h} m over ${pl}`, `cây cao nhất từ trước tới nay: ${h} m trên ${pl}`);
  if (h >= 25) {
    add(2, 'feat', `climbed ${h} m through ${pl}`, `leo ${h} m qua ${pl}`);
    add(1.5, 'feat', `grew ${h} m toward ${st}, sun by sun`, `cao ${h} m tới ${st}, từng giọt nắng một`);
    add(1.2, 'feat', `${h} m of ${sp}, rooted in ${pl}`, `${h} m ${sp}, cắm rễ nơi ${pl}`);
  }
  if (!C.length) add(1, 'chore', `planted a ${sp} by ${pl}`, `trồng một cây ${sp} bên ${pl}`);
  const total = C.reduce((n, c) => n + c.w, 0);
  let x = r() * total, ch = C[0];
  for (const c of C) { x -= c.w; if (x <= 0) { ch = c; break; } }
  const sha = String(seed).replace(/[^0-9a-f]/gi, '').slice(0, 6).padEnd(6, '0').toLowerCase();
  return { sha, type: ch.type, scope: sp, line: ch.line, name: treeName(F, seed, lang), text: `${sha} ${ch.type}(${sp}): ${ch.line}`, src: 'offline' };
}

// ---------------------------------------------------------------- UI language
export function uiLang() {
  try {
    const s = localStorage.getItem('forkwood.lang'); if (s === 'vi' || s === 'en') return s;
    const d = document.documentElement.lang; if (d) return d.toLowerCase().startsWith('vi') ? 'vi' : 'en';
    return (navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch { return 'en'; }
}

// ---------------------------------------------------------------- optional AI path
/** Configured worker endpoint, or null (default: none, offline only). */
export function poetEndpoint() {
  try {
    if (typeof window !== 'undefined' && window.FORKWOOD_POET_URL) return String(window.FORKWOOD_POET_URL);
    const m = typeof document !== 'undefined' && document.querySelector('meta[name="forkwood-poet"]');
    if (m && m.content) return m.content;
    const ls = localStorage.getItem('forkwood.poet'); if (ls && /^https:\/\//.test(ls)) return ls;
  } catch { /* none */ }
  return null;
}

const TYPES = new Set(['feat', 'fix', 'perf', 'refactor', 'style', 'chore', 'release', 'revert', 'docs']);
/**
 * Ask the worker for a line; resolves to a poem object or null (no endpoint,
 * timeout, bad shape). Never rejects. The offline poem supplies sha/scope/name.
 */
export async function aiPoem(F, base, lang, { timeout = 2000, endpoint = poetEndpoint(), fetchFn = (typeof fetch !== 'undefined' ? fetch : null) } = {}) {
  if (!endpoint || !fetchFn) return null;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac && ac.abort(), timeout);
  try {
    const res = await Promise.race([
      fetchFn(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang, scope: base.scope, facts: F }), signal: ac ? ac.signal : undefined }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout + 50)),
    ]);
    if (!res || !res.ok) return null;
    const j = await res.json();
    const type = String(j.type || '').toLowerCase();
    let line = String(j.line || '').replace(/[\r\n\t]+/g, ' ').replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
    if (!TYPES.has(type) || line.length < 6 || line.length > 72) return null;
    return { ...base, type, line, text: `${base.sha} ${type}(${base.scope}): ${line}`, src: 'ai' };
  } catch { return null; }
  finally { clearTimeout(timer); }
}
