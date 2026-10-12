"""One-off refactor helper: split src/audio.js into audio.js (core, first load) and
audio-mixer.js (v2 mixer, imported after first paint). Kept for the record."""
import re, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = open(os.path.join(ROOT, 'src/audio.js')).read()
mark = '// =====================================================================================\n// Forkwood 2.0 audio'
i = src.index(mark)
legacy, v2 = src[:i], src[i:]
ci = v2.index('export class Sound extends LegacySound {')
pre = v2[:ci]
ce = v2.index('\n}\n', ci)
body = v2[ci:ce + 3]
post = v2[ce + 3:]

lines = body.split('\n')[1:-2]
members, cur = [], []
START = re.compile(r'^  (//|/\*\*|[A-Za-z_]|get |set )')
for ln in lines:
    if START.match(ln) and cur:
        prev = cur[-1].strip()
        if prev.startswith('//') or prev.startswith('/**') or prev.startswith('*'):
            cur.append(ln)
            continue
        members.append('\n'.join(cur))
        cur = [ln]
    else:
        cur.append(ln)
members.append('\n'.join(cur))


def name(m):
    for ln in m.split('\n'):
        t = ln.strip()
        if not t or t.startswith(('//', '/**', '*')):
            continue
        mm = re.match(r'(get |set )?([A-Za-z_$][\w$]*)\s*\(', t)
        return ((mm.group(1) or '') + mm.group(2)) if mm else t[:20]


KEEP = {'constructor', '_makeCtx', '_afterCtx', 'installUnlock', '_applyVolumes', 'setVolume', 'getSettings', 'setMuted',
        'get buf', 'set buf', 'sample', '_legacyMusic', '_startPad', 'startMenu', 'start', 'stop', 'setStage', 'update', '_p'}
K, M = [], []
for m in members:
    n = name(m)
    if n in KEEP or ('this._p(' in m and 'super.' in m):
        K.append(m)
    else:
        M.append((n, m))
print('keep:', [name(m) for m in K])
print('mixer:', [n for n, _ in M])
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/split'
os.makedirs(out, exist_ok=True)
open(f'{out}/K.txt', 'w').write('\n\n'.join(K))
open(f'{out}/M.txt', 'w').write('\n\n'.join(m for _, m in M))
open(f'{out}/pre.txt', 'w').write(pre)
open(f'{out}/post.txt', 'w').write(post)
open(f'{out}/legacy.txt', 'w').write(legacy)
