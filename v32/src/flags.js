// Forkwood V3.2 build flags (gameplay stream). Read once at load; safe in node (tests) where there is no
// location. Flip the defaults here to switch behaviour for a whole build.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const PATH = typeof location !== 'undefined' ? location.pathname || '' : '';
const on = (k, dflt) => (Q.get(k) === '1' || Q.get(k) === 'all' ? true : Q.get(k) === '0' ? false : dflt);

/** Every map / world is open to everyone (demo). false = the acorn prices + free list come back. ?unlock=0 to test locks. */
export const UNLOCK_ALL_MAPS = on('unlock', typeof location !== 'undefined'); // node unit tests keep testing the lock logic
/** Contest build: no League / Pass / Shop / offers / ads, one tap to play. ?contest=1 forces it on, ?contest=0 off.
 *  Default ON for the published /v3/ build (path contains /v3/), off on a local dev server. */
export const CONTEST = on('contest', /\/v3\//.test(PATH));
/** Early showcase override for tests and screenshots: ?early=1 forces the 150 m calm + 300 m mini-boss, ?early=0 never. */
export const EARLY_PARAM = Q.has('early') ? Q.get('early') !== '0' : null;
