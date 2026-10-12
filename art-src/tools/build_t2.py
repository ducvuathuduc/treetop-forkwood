"""V2-INT: atlases for the MECH trap ids ART had not drawn (+ redesigned meadow seesaw bough-bridge, readable lacquer
mosquito net). Sources: art-src/raw/trap2-<world>.png (generate_image, prompts in PROMPTS-V2.md §V2-INT) sliced by
slice_t2.py. Output: assets/v2/<world>/<world>.traps2.webp + registry entries (art-src/reg/traps2.json), merged
into assets/v2/registry.json (replacing ids that already exist). python3 build_t2.py"""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import build_sprites as B
from artlib import ROOT, OUT
T2 = {
 'meadow': [('meadow.trap.dewweb', '00', 176, 'web', 'dew orb web; tear = split along threads'), ('meadow.trap.squirrel', '01', 160, 'cone', 'throws an acorn at the locked circle'),
            ('meadow.trap.seesaw', '02', 320, 'seesaw', 'fallen branch rope bridge (replaces the off-theme railway crossing); drawn stretched over the solid span')],
 'starry': [('starry.trap.swallows', '02', 176, 'bats', 'swooping swallow'), ('starry.trap.fallingstar', '00', 160, 'icicle', 'haloed impasto star falling (tail up)')],
 'fresco': [('fresco.trap.censer', '00', 176, 'pendulum', 'swinging thurible'), ('fresco.trap.belfrybats', '01', 176, 'bats', 'belfry bat')],
 'ukiyo': [('ukiyo.trap.pinebough', '00', 320, 'seesaw', 'pine bough'), ('ukiyo.trap.oarsweep', '01', 300, 'pecker', 'sweeping oar (tiled along the span)'), ('ukiyo.trap.rocks', '02', 260, 'jaws', 'closing sea rocks')],
 'lilies': [('lilies.trap.reedweb', '00', 176, 'web', 'reed web'), ('lilies.trap.turtle', '01', 176, 'jaws', 'snapping turtle'), ('lilies.trap.pollen', '02', 160, 'spores', 'pollen puff (spins in code)'),
            ('lilies.trap.weeds', '04', 300, 'strangle', 'pondweed tendrils (tiled along the span)')],
 'gilded': [('gilded.trap.glare', '00', 300, 'beam', 'gold glare shaft (stretched to the beam)'), ('gilded.trap.birchbough', '01', 320, 'seesaw', 'birch bough'),
            ('gilded.trap.tendrils', '02', 300, 'strangle', 'gold spiral tendrils (tiled)'), ('gilded.trap.flakes', '03', 176, 'embers', 'gold flake cluster with ember core')],
 'lacquer': [('lacquer.trap.mosquitonet', '00', 230, 'web', 'mosquito net in a lacquer bamboo frame (readable mesh)'), ('lacquer.trap.lanternswing', '01', 176, 'pendulum', 'swinging paper lantern'),
             ('lacquer.trap.firecracker', '02', 160, 'cone', 'firecracker string'), ('lacquer.trap.screen', '03', 260, 'candy', 'folding screen panel (drawn on both sides of the candy box)')],
}
def despill(f):
    b, g, r = f[..., 0], f[..., 1], f[..., 2]; mx = np.maximum(b, r) + 0.04
    f[..., 1] = np.where(g > mx, mx, g); return f
reg = []
for w, lst in T2.items():
    groups = []
    for id_, src, mx, mech, note in lst:
        fr, sc = B.frames_for([f'trap2-{w}/{src}'], mx, {})
        fr = [despill(f) for f in fr]
        groups.append(dict(id=id_, frames=fr + [B.warn_variant(fr[0])], fps=0, anchor=[0.5, 0.5], mech=mech, anim='still; frames 0..0 normal, frame 1 = frame 0 with baked red-orange (#FF5A2A) warn glow (cross-fade it in over the telegraph)', warnFrames=[1], notes=note))
    n0 = len(B.REG); B.emit(f'{w}.traps2', w, groups, w); reg += B.REG[n0:]
json.dump(reg, open(os.path.join(ROOT, 'art-src', 'reg', 'traps2.json'), 'w'), indent=0)
json.dump(B.QA, open(os.path.join(ROOT, 'art-src', 'reg', 'qa-traps2.json'), 'w'), indent=0)
R = json.load(open(os.path.join(OUT, 'registry.json')))
new = {e['id'] for e in reg}
R = [e for e in R if e['id'] not in new and e['id'] != 'meadow.trap.crossing'] + reg  # crossing retired (off-theme, unused by MECH)
json.dump(R, open(os.path.join(OUT, 'registry.json'), 'w'), indent=1)
print('registry', len(R), 'new', len(reg))
