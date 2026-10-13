// Forkwood 1.0: no blank frames or broken-image icons while art streams in. Every <img> that is not
// decoded yet gets a soft shimmer fill (.fw-ld), fades in once decoded, and hides itself if it fails.
const SEEN = new WeakSet();
function watch(img) {
  if (SEEN.has(img)) return; SEEN.add(img);
  const done = () => {
    if (!img.classList.contains('fw-ld')) return;
    img.classList.remove('fw-ld'); img.classList.add('fw-in');
    setTimeout(() => img.classList.remove('fw-in'), 450);
  };
  const ready = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { if (img.naturalWidth) done(); });
  const fail = () => { img.classList.remove('fw-ld'); img.classList.add('fw-err'); };
  img.addEventListener('load', () => { img.classList.remove('fw-err'); ready(); });
  img.addEventListener('error', () => { if (img.getAttribute('src')) fail(); });
  arm(img);
}
function arm(img) {
  // only while a real fetch is in flight (data-src thumbnails wait for their src); never on a done image
  if (!img.getAttribute('src') || (img.complete && img.naturalWidth)) { img.classList.remove('fw-ld'); return; }
  img.classList.add('fw-ld');
}
function scan(root) {
  if (root.tagName === 'IMG') watch(root);
  else if (root.querySelectorAll) for (const im of root.querySelectorAll('img')) watch(im);
}
export function initImgFade() {
  scan(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes') { if (m.target.tagName === 'IMG') { watch(m.target); arm(m.target); } continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}
