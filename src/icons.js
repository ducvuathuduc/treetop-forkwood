// Hand-drawn interface icons as inline SVG, inked like the rest of the game
// (warm ink outline, flat print colours, no emoji, no gradients).
const svg = (body, vb = '0 0 40 40') => `<svg viewBox="${vb}" aria-hidden="true" class="ico">${body}</svg>`;
const K = 'fill="none" stroke="#1e1a16" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
const F = (c) => `fill="${c}" stroke="#1e1a16" stroke-width="2.6" stroke-linejoin="round"`;

export const ICON = {
  acorn: svg(`<ellipse cx="20" cy="23" rx="9" ry="11" ${F('#d99a52')}/><path d="M16 25c0 3 1.5 5 3 6" stroke="#f3cf8e" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M8.5 18c0-6 5-9.5 11.5-9.5S31.5 12 31.5 18c-3 1.6-7 2.2-11.5 2.2S11.5 19.6 8.5 18z" ${F('#7a4a22')}/><path d="M14 13.5l2 3M20 11.5v3.6M26 13.5l-2 3" stroke="#1e1a16" stroke-width="1.6" stroke-linecap="round"/><path d="M20 8.5c0-2.5 1.3-4.4 3.6-5" ${K}/>`),
  goals: svg(`<path d="M10 7h20v26H10z" ${F('#f4ecd8')}/><path d="M7 7.5c0-2 1.4-3 3-3h22c-1.6 0-3 1-3 3" ${F('#ebdfc4')}/><path d="M7 33c0 2 1.4 3 3 3h22c-1.6 0-3-1-3-3" ${F('#ebdfc4')}/><path d="M14 14l2.4 2.4L20.5 12M14 21.5l2.4 2.4 4.1-4.4" stroke="#6f9a4a" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M23.5 15h3M23.5 22.5h3M14 29h12.5" ${K}/>`),
  shop: svg(`<path d="M8 17v17h24V17" ${F('#f4ecd8')}/><path d="M5 10l3-5h24l3 5v3.5a3.75 3.75 0 0 1-7.5 0 3.75 3.75 0 0 1-7.5 0 3.75 3.75 0 0 1-7.5 0A3.75 3.75 0 0 1 5 13.5z" ${F('#e2603f')}/><path d="M12.5 10v3.5M20 10v3.5M27.5 10v3.5" stroke="#1e1a16" stroke-width="2" /><path d="M16 34v-9h8v9" ${F('#f2b33d')}/>`),
  charms: svg(`<path d="M20 4c3 0 5 2 5 5" ${K}/><circle cx="20" cy="23" r="12" ${F('#f2b33d')}/><circle cx="20" cy="23" r="7" ${F('#f4ecd8')}/><path d="M20 18c3 1.5 3.5 4.5 0 9-3.5-4.5-3-7.5 0-9z" ${F('#6f9a4a')}/><path d="M15 9c0-3 2-5 5-5" ${K}/>`),
  badges: svg(`<path d="M13 24l-5 12 6-2 3 5 4-11M27 24l5 12-6-2-3 5-4-11" ${F('#e2603f')}/><path d="M20 3l3.4 2.6 4.2-.5 1.6 4 4 1.6-.5 4.2L35 18l-2.6 3.4.5 4.2-4 1.6-1.6 4-4.2-.5L20 33l-3.4-2.6-4.2.5-1.6-4-4-1.6.5-4.2L5 18l2.6-3.4-.5-4.2 4-1.6 1.6-4 4.2.5z" ${F('#f2b33d')}/><circle cx="20" cy="18" r="6.5" ${F('#f4ecd8')}/>`),
  profile: svg(`<circle cx="20" cy="20" r="15" ${F('#d99a52')}/><circle cx="20.5" cy="19.5" r="10.5" fill="none" stroke="#7a4a22" stroke-width="2"/><circle cx="21" cy="19" r="6.5" fill="none" stroke="#7a4a22" stroke-width="2"/><circle cx="21.5" cy="18.5" r="2.6" ${F('#f4ecd8')}/><path d="M33 12l-6 5" ${K}/>`),
  gift: svg(`<path d="M7 16h26v6H7z" ${F('#e2603f')}/><path d="M9 22h22v13H9z" ${F('#e2603f')}/><path d="M20 16v19" stroke="#f2b33d" stroke-width="4"/><path d="M20 16v19" stroke="#1e1a16" stroke-width="1.2"/><path d="M20 16c-3-6-10-8-10-3.5 0 3 5 3.5 10 3.5zM20 16c3-6 10-8 10-3.5 0 3-5 3.5-10 3.5z" ${F('#f2b33d')}/>`),
  close: svg(`<path d="M11 11l18 18M29 11L11 29" fill="none" stroke="#1e1a16" stroke-width="3.6" stroke-linecap="round"/>`),
  lock: svg(`<path d="M13 18v-4a7 7 0 0 1 14 0v4" ${K}/><rect x="9" y="18" width="22" height="16" rx="3" ${F('#ebdfc4')}/><circle cx="20" cy="25" r="2.2" fill="#1e1a16"/><path d="M20 26v4" stroke="#1e1a16" stroke-width="2.4" stroke-linecap="round"/>`),
  tick: svg(`<path d="M9 21l7 7L31 12" fill="none" stroke="#1e1a16" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
  flame: svg(`<path d="M20 36c-7 0-11-4.5-11-10.5 0-7 6-9 6-16 4 2 6.5 5.5 6.5 9 1.5-1.5 2-3.5 2-5.5 4 3 7.5 7 7.5 12.5C31 31.5 27 36 20 36z" ${F('#e2603f')}/><path d="M20 35c-3 0-5-2-5-5 0-3.5 3-4.5 3-8 3 2 7 4.5 7 8.5 0 2.5-2 4.5-5 4.5z" ${F('#f2b33d')}/>`),
  frost: svg(`<path d="M20 5v30M7 12.5l26 15M7 27.5l26-15" ${K}/><path d="M16 7l4 3.5L24 7M16 33l4-3.5 4 3.5" ${K}/><circle cx="20" cy="20" r="4" ${F('#cfe6ff')}/>`),
  level: svg(`<path d="M20 4l4.5 9.5L35 15l-7.5 7.2L29.3 33 20 28l-9.3 5 1.8-10.8L5 15l10.5-1.5z" ${F('#f2b33d')}/>`),
  map: svg(`<path d="M5 9l9-3 12 4 9-3v24l-9 3-12-4-9 3z" ${F('#f4ecd8')}/><path d="M14 6v24M26 10v24" stroke="#1e1a16" stroke-width="2"/><path d="M9 25c3-1 4-5 8-6s5 3 9 1 4-6 6-7" fill="none" stroke="#e2603f" stroke-width="2.4" stroke-dasharray="2.5 3" stroke-linecap="round"/><circle cx="31" cy="12" r="2.6" ${F('#f2b33d')}/>`),
  star: svg(`<path d="M20 3.5l4.9 10.2 11.1 1.5-8.1 7.7 2 11-9.9-5.4-9.9 5.4 2-11L4 15.2l11.1-1.5z" ${F('#f2b33d')}/>`),
  starOff: svg(`<path d="M20 3.5l4.9 10.2 11.1 1.5-8.1 7.7 2 11-9.9-5.4-9.9 5.4 2-11L4 15.2l11.1-1.5z" fill="#e6dac0" stroke="#1e1a16" stroke-width="2.2" stroke-linejoin="round"/>`),
  chest: svg(`<path d="M6 18h28v15H6z" ${F('#a8744a')}/><path d="M6 18c0-7 4-11 14-11s14 4 14 11z" ${F('#c98a4a')}/><path d="M6 18h28" stroke="#1e1a16" stroke-width="2.6"/><path d="M12 8.5V33M28 8.5V33" stroke="#6b4429" stroke-width="2.4"/><rect x="16.5" y="15" width="7" height="8" rx="1.5" ${F('#f2b33d')}/>`),
  modes: svg(`<circle cx="13" cy="13" r="7" ${F('#86d66b')}/><circle cx="27" cy="13" r="7" ${F('#f2b33d')}/><circle cx="13" cy="27" r="7" ${F('#8fd0e6')}/><circle cx="27" cy="27" r="7" ${F('#e2603f')}/>`),
  play: svg(`<path d="M12 7v26l21-13z" ${F('#f2b33d')}/>`),
};
