"""Forkwood 2.0 sound effects: every cue synthesised from scratch (no samples).

CATALOG maps a sound id to (group, description, generator, flags). Groups become
audio sprites: `ui` and `play` are shared, and each world has its own sprite
(its traps and boss) that loads with the world. Tonal cues in the shared groups
are written in C and flagged `tonal`, so audio.js can retune them to the key of
the world's music with playbackRate.
"""
import numpy as np
from synth import *

P = [0, 2, 4, 7, 9]  # major pentatonic


def deg(d, base=72, scale=P):
    o, i = divmod(d, len(scale))
    return base + 12 * o + scale[i]


def mixl(parts, tail=0.0):
    """parts: list of (t_sec, array, gain). Returns a mono mix."""
    n = max(int(t * SR) + len(x) for t, x, g in parts) + int(tail * SR)
    out = np.zeros(n)
    for t, x, g in parts:
        i = int(t * SR)
        out[i:i + len(x)] += x * g
    return out


def arp(inst, notes, step=0.05, vel=0.6, g=1.0, t0=0.0, dur=0.6, **kw):
    return [(t0 + i * step, inst(m, dur, vel, **kw) if kw else inst(m, dur, vel), g) for i, m in enumerate(notes)]


def whoosh(dur=0.4, f0=400, f1=2500, q=1.4, vel=0.5, shape='bell'):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = noise(n)
    # sweep a band-pass by blocks
    out = np.zeros(n)
    blk = 256
    fr = np.geomspace(f0, f1, n // blk + 1)
    zi = None
    from scipy.signal import butter, sosfilt, sosfilt_zi
    for b in range(0, n, blk):
        fc = fr[b // blk]
        lo, hi = fc / q, min(fc * q, SR * 0.45)
        sos = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos')
        if zi is None: zi = sosfilt_zi(sos) * 0
        seg, zi = sosfilt(sos, x[b:b + blk], zi=zi)
        out[b:b + blk] = seg
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.5 if shape == 'bell' else 0.6)
    if shape == 'in': e = np.clip(t / dur, 0, 1) ** 2 * np.exp(-np.maximum(0, t - dur * 0.9) / 0.02)
    if shape == 'out': e = np.exp(-t / (dur * 0.3)) * np.minimum(1, t / 0.01)
    return fade(out * e, 0.003, 0.02) * 0.6 * vel


def pop(f=600, f_end=None, dur=0.12, vel=0.6, q=0.03):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fe = f_end or f * 1.8
    fr = f + (fe - f) * (1 - np.exp(-t / q))
    x = np.sin(osc_phase(fr)) * np.exp(-t / (dur * 0.3)) * np.minimum(1, t / 0.001)
    return fade(x, 0, 0.01) * 0.5 * vel


def thud(f0=160, f1=60, dur=0.3, vel=0.6, skin=0.3):
    return drum_low(vel, f0, f1, dur * 0.4, skin, dur)


def click(f=2400, vel=0.5, dur=0.03):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004) + bp(noise(n), f * 0.7, f * 1.6) * np.exp(-t / 0.003) * 0.6
    return fade(x, 0, 0.005) * 0.5 * vel


def crackle(dur=0.4, density=60, vel=0.5, lo=1500, hi=7000, seed=3):
    n = int(dur * SR)
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for _ in range(int(density * dur)):
        i = r.integers(0, max(1, n - 400))
        k = r.integers(40, 300)
        out[i:i + k] += r.standard_normal(k) * np.exp(-np.arange(k) / (k / 4)) * r.uniform(0.3, 1)
    out = bp(out, lo, hi)
    t = np.arange(n) / SR
    return fade(out * np.exp(-t / (dur * 0.6)), 0, 0.02) * 0.4 * vel


def buzz(f=180, dur=0.6, vel=0.5, trem=28, rise=1.0, bright=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.04 * np.sin(2 * np.pi * 7 * t)) * (rise ** (t / dur))
    x = additive_saw(fr, 12, 1.3, 3000) * (0.6 + 0.4 * np.sin(2 * np.pi * trem * t))
    x = lp(x, 900 + 1800 * bright)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.8
    return fade(x * e, 0.01, 0.03) * 0.12 * vel


def swell(m=60, dur=0.8, vel=0.5, inst=None):
    """Reverse-ish swell into a downbeat (soft pad rising)."""
    inst = inst or (lambda mm, d, v: softpad(mm, d, v, att=d * 0.9, rel=0.05, cutoff=2400))
    x = inst(m, dur, vel)
    return x


def rustle(dur=0.5, vel=0.5, seed=5):
    return crackle(dur, 140, vel, 2000, 9000, seed) * 0.8 + whoosh(dur, 1500, 4000, 2.0, vel * 0.4)


def water_drop(f=900, vel=0.6):
    return pop(f, f * 2.6, 0.09, vel, 0.012)


def splash(dur=0.6, vel=0.6):
    return crackle(dur, 260, vel, 800, 6000, 11) + whoosh(dur, 600, 3000, 1.6, vel * 0.5, 'out')


def gong(m=48, dur=2.5, vel=0.5):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for r, a in [(1, 1), (1.49, 0.6), (2.11, 0.5), (2.73, 0.3), (3.3, 0.2)]:
        fr = f * r * (1 + 0.004 * np.exp(-t / 0.4))
        x += a * np.sin(osc_phase(fr)) * np.exp(-t / (dur * 0.45 / r ** 0.5))
    return fade(x * np.minimum(1, t / 0.01), 0, 0.1) * 0.12 * vel


def chain_clink(vel=0.5, n=4, seed=2):
    r = np.random.default_rng(seed)
    return mixl([(i * r.uniform(0.03, 0.06), glock(r.integers(96, 104), 0.25, r.uniform(0.3, 0.6)), 0.6) for i in range(n)])


def warn_tick(m=84, vel=0.6, inst=None):
    """THE warning family: a soft, ascending two-note tick-tick (a fourth up)."""
    inst = inst or (lambda mm, d, v: kalimba(mm, 0.25, v))
    return mixl([(0, inst(m, 0.2, vel), 1.0), (0.11, inst(m + 5, 0.2, vel), 1.0)])


# ------------------------------------------------------------------ world palettes
WORLD = {
    'meadow': dict(root=62, scale=P, inst=lambda m, d, v: piano(m, d, v * 0.9), hi=kalimba, desc='piano + kalimba, D major'),
    'starry': dict(root=63, scale=P, inst=celesta, hi=celesta, desc='celesta, Eb major'),
    'fresco': dict(root=57, scale=[0, 3, 5, 7, 10], inst=lambda m, d, v: bell(m, max(d, 1.2), v), hi=glock, desc='bells + choir, A minor'),
    'ukiyo': dict(root=62, scale=[0, 1, 5, 7, 8], inst=lambda m, d, v: koto(m, max(d, 0.9), v), hi=lambda m, d, v: koto(m, 0.8, v), desc='koto + wood, D in-scale'),
    'lilies': dict(root=61, scale=P, inst=lambda m, d, v: piano(m, d, v * 0.8, 0.8), hi=lambda m, d, v: piano(m, d, v * 0.7), desc='soft piano + water, Db'),
    'gilded': dict(root=64, scale=P, inst=lambda m, d, v: harp(m, d, v), hi=lambda m, d, v: harp(m, d, v), desc='harp + triangle, E major'),
    'lacquer': dict(root=60, scale=[0, 2, 5, 7, 9], inst=lambda m, d, v: tranh(m, max(d, 0.9), v), hi=lambda m, d, v: tranh(m, 0.8, v), desc='đàn tranh + mõ, C Bắc'),
}


def wdeg(w, d, oct=1):
    W = WORLD[w]
    return deg(d, W['root'] + 12 * oct, W['scale'])


CATALOG = {}


def S(id, group, desc, fn, tonal=False, duck=0.0, vol=None, cls='fx'):
    CATALOG[id] = dict(group=group, desc=desc, fn=fn, tonal=tonal, duck=duck, cls=cls)


K = kalimba
# ====================================================================== UI (menus, meta, rewards)
S('ui.click', 'ui', 'Soft wooden tap for any button', lambda: mixl([(0, woodblock(1500, 0.5, 0.08, 0.012), 0.8), (0, click(3200, 0.25), 0.4)]), cls='ui')
S('ui.toggle', 'ui', 'Two-step tick for switches and checkboxes', lambda: mixl([(0, woodblock(1300, 0.4, 0.06, 0.01), 0.8), (0.045, woodblock(1800, 0.35, 0.06, 0.01), 0.7)]), cls='ui')
S('ui.tab', 'ui', 'Paper-light tab change', lambda: lp(mixl([(0, whoosh(0.09, 2000, 4000, 2, 0.4), 0.6), (0.02, woodblock(1700, 0.3, 0.05, 0.008), 0.6)]), 6000), cls='ui')
S('ui.open', 'ui', 'Panel/modal opens: rising airy two-note', lambda: mixl([(0, whoosh(0.22, 500, 2400, 1.6, 0.4), 0.7)] + arp(K, [72, 79], 0.06, 0.35, 0.7)), tonal=True, cls='ui')
S('ui.close', 'ui', 'Panel/modal closes: falling airy two-note', lambda: mixl([(0, whoosh(0.2, 2400, 600, 1.6, 0.35), 0.7)] + arp(K, [79, 72], 0.06, 0.3, 0.6)), tonal=True, cls='ui')
S('ui.back', 'ui', 'Back / cancel: single low wooden tap', lambda: woodblock(900, 0.5, 0.1, 0.015), cls='ui')
S('ui.deny', 'ui', 'Not allowed / not enough acorns: muted double knock, never harsh', lambda: mixl([(0, woodblock(520, 0.5, 0.1, 0.02), 1), (0.09, woodblock(470, 0.45, 0.1, 0.02), 1)]), cls='ui')
S('ui.page', 'ui', 'Page turn / swipe between cards', lambda: whoosh(0.16, 900, 3200, 1.8, 0.5, 'out'), cls='ui')
S('ui.notify', 'ui', 'Toast / mission complete: a gentle three-note chime', lambda: mixl(arp(glock, [79, 84, 88], 0.07, 0.4, 0.8, dur=0.9)), tonal=True, cls='ui')
S('ui.purchase', 'ui', 'Buy confirmed in the store: wooden ka-chunk + bright arpeggio', lambda: mixl([(0, woodblock(700, 0.7, 0.12, 0.02), 0.9), (0.04, thud(220, 110, 0.15, 0.4), 0.6)] + arp(K, [72, 76, 79, 84], 0.06, 0.45, 0.7, t0=0.06)), tonal=True, duck=0.3, cls='reward')
S('ui.equip', 'ui', 'Equip a skin/critter: soft leather snap + note', lambda: mixl([(0, click(1800, 0.4), 0.6), (0.01, K(76, 0.5, 0.45), 0.8)]), tonal=True, cls='ui')
S('ui.unlock', 'ui', 'World or item unlocked: harp-like rising run into a bell', lambda: mixl(arp(K, [deg(i, 67) for i in range(7)], 0.045, 0.4, 0.6) + [(0.33, bell(84, 2.0, 0.5), 0.8)]), tonal=True, duck=0.5, cls='reward')
S('ui.levelup', 'ui', 'Account / critter level up: sparkle + resolved five-note run', lambda: mixl(arp(glock, [84, 88, 91, 96], 0.06, 0.35, 0.6) + arp(K, [72, 74, 76, 79, 84], 0.08, 0.45, 0.8, t0=0.1)), tonal=True, duck=0.4, cls='reward')
S('ui.stamp', 'ui', 'Ink stamp on a postcard/trophy: felt thump + paper', lambda: mixl([(0, thud(150, 70, 0.22, 0.6, 0.6), 1), (0, crackle(0.12, 200, 0.4, 2000, 7000), 0.6)]), cls='reward')
S('reward.claim', 'ui', 'Claim a reward (daily, mission, pass tier): warm gold chord bloom', lambda: mixl(arp(K, [72, 76, 79, 84, 88], 0.035, 0.45, 0.8, dur=1.0) + [(0, softpad(60, 0.6, 0.6, att=0.02, rel=0.6), 0.8), (0.05, triangle_inst(0.4, 1.2, 3200), 0.6)]), tonal=True, duck=0.4, cls='reward')
S('reward.chest.ratchet', 'ui', 'Chest reveal wind-up: soft wooden ratchet clicks (1 s, loopable feel)', lambda: mixl([(i * (0.11 - i * 0.005), woodblock(1200 + 40 * i, 0.35 + 0.03 * i, 0.06, 0.01), 0.8) for i in range(12)]), cls='reward')
S('reward.chest.open', 'ui', 'Chest lid opens: wood creak, whoosh and a golden shimmer', lambda: mixl([(0, whoosh(0.35, 300, 2600, 1.6, 0.6), 0.8), (0.05, thud(120, 60, 0.3, 0.4), 0.6)] + arp(glock, [84, 88, 91, 96, 100], 0.04, 0.35, 0.6, t0=0.18) + [(0.2, triangle_inst(0.5, 1.4), 0.7)]), tonal=True, duck=0.5, cls='reward')
S('reward.chest.stamp', 'ui', 'Chest loot lands: rarity stamp thump + chord', lambda: mixl([(0, thud(170, 70, 0.25, 0.7, 0.5), 1)] + arp(K, [60, 67, 72, 76], 0.0, 0.5, 0.6, dur=1.0)), tonal=True, cls='reward')
S('currency.fly', 'ui', 'Acorns/coins start flying to the counter: airy rising swish with twinkles', lambda: mixl([(0, whoosh(0.4, 700, 4000, 1.8, 0.45, 'in'), 0.7)] + arp(glock, [91, 96, 100], 0.09, 0.25, 0.5, t0=0.1)), tonal=True, cls='reward')
S('currency.tick', 'ui', 'One acorn lands in the counter (pitched up per acorn via rate)', lambda: mixl([(0, K(84, 0.25, 0.4), 0.8), (0, click(3500, 0.2), 0.3)]), tonal=True, cls='ui')
S('currency.land', 'ui', 'Counter finishes: round wooden pop + bright note', lambda: mixl([(0, pop(300, 520, 0.1, 0.6), 0.8), (0.02, K(88, 0.5, 0.5), 0.8)]), tonal=True, cls='reward')
S('ring.offer', 'ui', 'Growth Rings draft appears (slow-mo): a breath in, three medallion chimes', lambda: mixl([(0, whoosh(0.7, 300, 1800, 1.4, 0.5, 'in'), 0.6)] + arp(bell, [79, 83, 86], 0.16, 0.35, 0.6, t0=0.25, dur=1.2)), tonal=True, duck=0.55, cls='reward')
S('ring.pick', 'ui', 'Take a ring: bright click-in + rising fifth', lambda: mixl([(0, click(2600, 0.5), 0.5), (0, K(79, 0.5, 0.55), 0.8), (0.07, K(86, 0.7, 0.5), 0.8), (0.05, triangle_inst(0.3, 0.8), 0.5)]), tonal=True, cls='reward')
S('ring.levelup', 'ui', 'Ring levels I→II→III: the pick sound plus an extra octave sparkle', lambda: mixl([(0, K(79, 0.5, 0.55), 0.8), (0.07, K(86, 0.5, 0.5), 0.8)] + arp(glock, [91, 96, 98], 0.05, 0.35, 0.6, t0=0.14)), tonal=True, cls='reward')
S('knot.take', 'ui', 'A Knot (curse that came with a double ring) binds on: low rope creak + minor third', lambda: mixl([(0, woodblock(300, 0.5, 0.25, 0.06), 0.6), (0.02, K(64, 0.5, 0.45), 0.7), (0.1, K(67, 0.6, 0.4), 0.7)]), tonal=True, cls='fx')
S('ring.synergy', 'ui', 'Synergy unlocked between two rings: sparkle + resolved chord', lambda: mixl(arp(glock, [88, 91, 96, 100], 0.05, 0.35, 0.6) + arp(K, [72, 79, 84, 88], 0.0, 0.4, 0.6, t0=0.2, dur=1.0)), tonal=True, duck=0.3, cls='reward')

# ====================================================================== PLAY (core loop)
S('core.collect', 'play', 'Sunlight mote caught (audio.js steps it up the pentatonic per chain)', lambda: mixl([(0, K(72, 0.4, 0.55), 1), (0, glock(84, 0.3, 0.15), 0.5)]), tonal=True, cls='feedback')
S('core.fork', 'play', 'Vine forks in two: a wooden split + two rising notes', lambda: mixl([(0, woodblock(700, 0.5, 0.1, 0.02), 0.7), (0, whoosh(0.15, 1200, 4500, 2.2, 0.4), 0.5)] + arp(K, [72, 76], 0.05, 0.45, 0.8)), tonal=True, cls='feedback')
S('core.merge', 'play', 'Vines merge, staged light banked: chord arpeggio + soft bass', lambda: mixl(arp(K, [72, 76, 79, 84], 0.05, 0.5, 0.8, dur=0.9) + [(0, piano(48, 0.6, 0.4), 0.6)]), tonal=True, cls='feedback')
S('core.merge.jit', 'play', 'Just-in-time merge: the merge plus a high bright ping', lambda: mixl(arp(K, [72, 76, 79, 84, 88], 0.04, 0.5, 0.8, dur=0.9) + [(0.18, glock(96, 0.8, 0.4), 0.7), (0, piano(48, 0.6, 0.4), 0.6)]), tonal=True, cls='feedback')
S('core.merge.empty', 'play', 'Merge with nothing staged: a soft dull tap', lambda: woodblock(600, 0.35, 0.08, 0.015), cls='feedback')
S('core.revert', 'play', 'Lose the fork / branch reverts: downward wooden slide', lambda: mixl([(0, whoosh(0.3, 2500, 300, 1.6, 0.45), 0.7)] + arp(K, [79, 74, 69], 0.06, 0.35, 0.7)), tonal=True, cls='feedback')
S('core.hit', 'play', 'Take damage: muffled bark thump + low drop (firm, never shrill)', lambda: mixl([(0, thud(180, 55, 0.35, 0.8, 0.5), 1), (0, crackle(0.15, 200, 0.4, 800, 3500), 0.5)]), cls='feedback')
S('core.near', 'play', 'Close call: quick airy swish past the ear', lambda: whoosh(0.18, 600, 4000, 2.5, 0.5), cls='feedback')
S('core.graze', 'play', 'Graze chain bonus: three quick bright notes', lambda: mixl(arp(K, [79, 84, 88], 0.045, 0.4, 0.7, dur=0.4)), tonal=True, cls='feedback')
S('core.straddle', 'play', 'Forked pair straddles a hazard: split chime in fifths', lambda: mixl(arp(K, [72, 79, 84], 0.0, 0.45, 0.7) + [(0.05, glock(91, 0.6, 0.35), 0.6)]), tonal=True, cls='feedback')
S('core.shield', 'play', 'Shield/bark armour up: woody resonant knock + rising note', lambda: mixl([(0, woodblock(420, 0.6, 0.3, 0.06), 0.8), (0.02, K(67, 0.6, 0.4), 0.6), (0.05, K(79, 0.6, 0.35), 0.6)]), tonal=True, cls='feedback')
S('core.shield.break', 'play', 'Shield absorbs a hit and breaks: bark crack + glassy sparkle down', lambda: mixl([(0, crackle(0.2, 260, 0.6, 1200, 6000), 0.8), (0, thud(240, 120, 0.15, 0.5), 0.6)] + arp(glock, [96, 91, 88], 0.04, 0.3, 0.5)), tonal=True, cls='feedback')
S('core.stage', 'play', 'New height stage reached: seven-note rising run', lambda: mixl(arp(K, [deg(i, 72) for i in range(7)], 0.055, 0.45, 0.7, dur=0.7)), tonal=True, cls='reward')
S('core.newbest', 'play', 'New personal best passed: bright four-note fanfare on kalimba + glock', lambda: mixl(arp(K, [76, 79, 84, 88], 0.08, 0.5, 0.8, dur=0.9) + arp(glock, [88, 91, 96], 0.08, 0.3, 0.5, t0=0.24)), tonal=True, duck=0.3, cls='reward')
S('core.death', 'play', 'Run over: gentle falling four notes, warm not sad', lambda: mixl(arp(lambda m, d, v: piano(m, d, v), [76, 72, 67, 60], 0.17, 0.5, 0.8, dur=1.2) + [(0.5, softpad(48, 1.0, 0.5, att=0.3, rel=1.0), 0.6)]), tonal=True, duck=0.6, cls='reward')
S('core.finish', 'play', 'Course finished / treetop reached: resolved cadence with bell', lambda: mixl(arp(K, [67, 72, 76, 79, 84], 0.08, 0.5, 0.8, dur=1.0) + [(0.4, bell(72, 2.5, 0.5), 0.7)]), tonal=True, duck=0.6, cls='reward')
S('core.golden.start', 'play', 'Golden hour begins: shimmering six-note run + sun pad', lambda: mixl(arp(K, [deg(i, 72) for i in range(6)], 0.045, 0.5, 0.8, dur=1.0) + [(0, softpad(60, 1.0, 0.6, att=0.05, rel=1.0), 0.7), (0.1, triangle_inst(0.5, 1.6, 3000), 0.6)]), tonal=True, duck=0.3, cls='reward')
S('core.golden.end', 'play', 'Golden hour fades: three notes settling down', lambda: mixl(arp(K, [79, 76, 72], 0.08, 0.35, 0.7)), tonal=True, cls='feedback')
S('core.bloom', 'play', 'Bloom burst: five quick high notes like petals', lambda: mixl(arp(K, [deg(i, 81) for i in range(5)], 0.035, 0.4, 0.6, dur=0.6)), tonal=True, cls='feedback')
S('core.sprout', 'play', 'Seed sprouts / run start: soft knock then a rising four-note bud', lambda: mixl([(0, woodblock(500, 0.4, 0.15, 0.03), 0.6)] + arp(K, [72, 74, 76, 79], 0.06, 0.45, 0.8, t0=0.04) + [(0, piano(48, 0.8, 0.4), 0.5)]), tonal=True, cls='feedback')
S('core.revive', 'play', 'Revive used: in-breath swell into a bright chord', lambda: mixl([(0, whoosh(0.5, 300, 2400, 1.4, 0.5, 'in'), 0.6)] + arp(K, [72, 76, 79, 84], 0.0, 0.5, 0.7, t0=0.45, dur=1.0)), tonal=True, duck=0.4, cls='reward')
S('core.charged', 'play', 'Charm fully charged: a single clear ping with a short shimmer', lambda: mixl([(0, glock(91, 0.8, 0.45), 0.8), (0.03, K(79, 0.4, 0.3), 0.6)]), tonal=True, cls='feedback')
S('core.lowsap', 'play', 'Sap low warning (play at most every 2 s): soft double heartbeat', lambda: mixl([(0, thud(90, 55, 0.2, 0.5, 0.1), 1), (0.22, thud(85, 52, 0.2, 0.38, 0.1), 1)]), cls='feedback')
S('core.acorn', 'play', 'In-run acorn picked up (rate rises with streak)', lambda: mixl([(0, K(88, 0.25, 0.4), 0.8), (0.03, K(84, 0.25, 0.3), 0.6)]), tonal=True, cls='feedback')
S('core.storm', 'play', 'Storm rolls in: low wind rumble (2 s)', lambda: mixl([(0, lp(whoosh(2.2, 120, 400, 1.3, 0.8), 900), 1), (0, softpad(36, 1.6, 0.5, att=0.6, rel=0.6, cutoff=400), 0.7)]), duck=0.3, cls='fx')
S('core.strike', 'play', 'Lightning strike lands: bright crack + distant roll (soft-limited)', lambda: mixl([(0, crackle(0.15, 400, 0.8, 2000, 8000), 0.8), (0.04, lp(whoosh(1.2, 80, 260, 1.3, 0.8, 'out'), 600), 1), (0.03, thud(110, 45, 0.6, 0.5, 0.3), 0.7)]), cls='feedback')
S('core.storm.end', 'play', 'Storm clears: five warm notes like sun breaking through', lambda: mixl(arp(K, [72, 74, 76, 79, 81], 0.07, 0.45, 0.8, dur=0.9)), tonal=True, cls='reward')
S('core.tick', 'play', 'Countdown / timer tick (pitch via rate)', lambda: K(84, 0.12, 0.35), tonal=True, cls='ui')

# ---------------------------------------------------------------- pickups
S('pickup.pollen', 'play', 'Pollen (magnet) picked: sunny rising slide + fuzz sparkle', lambda: mixl([(0, pop(400, 900, 0.25, 0.5, 0.08), 0.6)] + arp(glock, [84, 88], 0.06, 0.35, 0.6)), tonal=True)
S('pickup.ink', 'play', 'Ink x2 picked: felt stamp + bright note', lambda: mixl([(0, thud(150, 70, 0.18, 0.5, 0.6), 0.8), (0.05, K(79, 0.5, 0.5), 0.8)]), tonal=True)
S('pickup.rush', 'play', 'Sap Rush picked: rushing band-pass whoosh + rising arpeggio', lambda: mixl([(0, whoosh(0.5, 400, 3000, 1.5, 0.6), 0.7)] + arp(K, [72, 76, 79, 84], 0.04, 0.45, 0.7)), tonal=True)
S('pickup.lantern', 'play', 'Firefly Lantern: low kalimba glow chord, then crickets fade in', lambda: mixl(arp(K, [60, 67, 72], 0.03, 0.45, 0.8, dur=1.0) + [(0.2, buzz(4200, 0.8, 0.25, 60, 1.0, 1.0) * 0.6, 0.5)]), tonal=True)
S('pickup.dew', 'play', 'Dew Bubble on: wet "bloop" + glassy shimmer', lambda: mixl([(0, pop(250, 700, 0.18, 0.7, 0.05), 0.9), (0.08, glock(91, 0.5, 0.3), 0.5)]), tonal=True)
S('pickup.dew.pop', 'play', 'Dew Bubble blocks a hit and pops: glassy pop + droplets', lambda: mixl([(0, pop(1200, 400, 0.08, 0.7, 0.01), 1)] + [(0.03 + i * 0.03, water_drop(1500 + 300 * i, 0.4), 0.6) for i in range(5)]))
S('pickup.shears', 'play', 'Pruning Shears picked: two metallic snips', lambda: mixl([(0, click(5200, 0.6, 0.05), 0.6), (0.0, glock(100, 0.2, 0.2), 0.4), (0.12, click(4800, 0.6, 0.05), 0.6)]))
S('pickup.shears.cut', 'play', 'Shears cut a thorn: crisp snip + twig crack', lambda: mixl([(0, click(5000, 0.7, 0.05), 0.6), (0.01, crackle(0.1, 300, 0.5, 1500, 6000), 0.7)]))
S('pickup.prism', 'play', 'Sun Prism picked: crystalline rainbow arpeggio up', lambda: mixl(arp(glock, [84, 88, 91, 96, 100, 103], 0.035, 0.35, 0.6, dur=0.8)), tonal=True)
S('pickup.twinseed', 'play', 'Twin Seed: double fork pop in thirds', lambda: mixl([(0, pop(350, 600, 0.12, 0.5), 0.7)] + arp(K, [72, 76, 79, 84], 0.0, 0.45, 0.6) + [(0.08, K(88, 0.5, 0.4), 0.6)]), tonal=True)
S('pickup.hourglass', 'play', 'Amber Hourglass: time slows, a falling tape-stop sweep + low bell', lambda: mixl([(0, whoosh(0.6, 3000, 300, 1.5, 0.5), 0.6), (0.1, bell(60, 2.0, 0.4), 0.7)]), tonal=True, duck=0.25)
S('pickup.acornrain', 'play', 'Acorn Rain: a fountain of wooden pips', lambda: mixl([(i * 0.04, woodblock(1400 + 120 * (i % 5), 0.3, 0.06, 0.008), 0.6) for i in range(14)] + [(0, whoosh(0.5, 500, 2500, 1.5, 0.4), 0.5)]))
S('pickup.goldleaf', 'play', 'Golden Leaf (combo lock): soft gold shimmer + triangle', lambda: mixl([(0, triangle_inst(0.5, 1.2, 2800), 0.8)] + arp(K, [79, 84, 88], 0.05, 0.4, 0.7)), tonal=True)
S('pickup.leafsail', 'play', 'Leaf Sail: a sail catching wind (rustle + rising swoop)', lambda: mixl([(0, rustle(0.4, 0.5), 0.7), (0.05, whoosh(0.5, 300, 1600, 1.6, 0.5), 0.6)]))
S('pickup.end', 'play', 'Any timed pickup expires: tiny falling note', lambda: mixl(arp(K, [76, 72], 0.06, 0.3, 0.6, dur=0.4)), tonal=True)

# ---------------------------------------------------------------- vehicles (rides)
RIDES = {
    'hummingbird': ('Hummingbird', lambda: buzz(140, 0.5, 0.5, 46, 1.2, 0.8), lambda: lp(whoosh(0.18, 1500, 5000, 2.5, 0.6), 6500), 'wing-blur buzz', '"zip" dart'),
    'rocket': ('Bamboo Rocket', lambda: mixl([(0, crackle(0.4, 300, 0.5, 2500, 8000), 0.6), (0.3, whoosh(0.4, 300, 2500, 1.4, 0.7), 0.8)]), lambda: woodblock(650, 0.6, 0.15, 0.03), 'fuse hiss into whoosh', 'bamboo "tok" lane hop'),
    'mushroom': ('Mushroom Trampoline', lambda: pop(180, 420, 0.25, 0.7, 0.06), lambda: mixl([(0, pop(420, 160, 0.2, 0.6, 0.05), 0.8), (0.02, thud(140, 70, 0.2, 0.4), 0.6)]), 'springy boing', 'stomp boing-down'),
    'dandelion': ('Dandelion Puff', lambda: mixl([(0, lp(whoosh(0.6, 1500, 4500, 2, 0.4), 6000), 0.6)] + arp(glock, [91, 96], 0.1, 0.25, 0.4)), lambda: whoosh(0.25, 3000, 1200, 2, 0.4), 'airy seed puff', 'fold/open flutter'),
    'stag': ('Stag Strider', lambda: mixl([(0, woodblock(380, 0.6, 0.2, 0.04), 0.8), (0.12, woodblock(340, 0.6, 0.2, 0.04), 0.8)]), lambda: mixl([(0, click(1800, 0.7, 0.04), 0.7), (0.01, woodblock(500, 0.7, 0.15, 0.03), 0.8)]), 'chitin clack-clack', 'mandible snap'),
    'crane': ('Paper Crane', lambda: mixl([(0, crackle(0.25, 120, 0.4, 2000, 7000), 0.6), (0.05, whoosh(0.3, 800, 2500, 1.8, 0.4), 0.6)]), lambda: whoosh(0.16, 400, 1500, 1.6, 0.6, 'out'), 'paper unfolds', 'paper wing flap'),
    'beanstalk': ('Beanstalk Express', lambda: mixl([(0, rustle(0.3, 0.5), 0.6)] + arp(K, [60, 67, 72], 0.06, 0.4, 0.6)), lambda: mixl([(0, click(2200, 0.5, 0.04), 0.6), (0.02, K(79, 0.3, 0.4), 0.6)]), 'vine snaps onto rail', 'rail switch click'),
    'swiftlet': ('Cave Swiftlet', lambda: mixl([(0, pop(2400, 3200, 0.06, 0.4, 0.01), 0.6), (0.08, pop(2600, 3400, 0.06, 0.4, 0.01), 0.6)]), lambda: mixl([(0, pop(1800, 2600, 0.1, 0.6, 0.02), 0.8), (0.0, whoosh(0.4, 600, 3000, 1.5, 0.4, 'out'), 0.4)]), 'twin chirp', 'sonar ping ring'),
    'morpho': ('Morpho Swarm', lambda: mixl([(i * 0.03, whoosh(0.15, 1200, 3500, 2, 0.25), 0.5) for i in range(6)]), lambda: mixl(arp(glock, [88, 91, 96], 0.03, 0.35, 0.5)), 'flutter of many wings', 'scatter into three'),
    'goose': ('Golden Goose', lambda: mixl([(0, woodblock(420, 0.5, 0.12, 0.03), 0.4), (0.0, buzz(320, 0.18, 0.5, 18, 0.8, 0.5), 0.8)]), lambda: mixl([(0, pop(500, 300, 0.1, 0.5), 0.6), (0.05, glock(88, 0.5, 0.4), 0.6)]), 'soft honk', 'golden egg plop + ding'),
}
for rid, (name, mount_fx, act_fx, md, ad) in RIDES.items():
    S(f'vehicle.{rid}.mount', 'play', f'{name}: mount ({md}) over the shared ride chime', (lambda f: lambda: mixl([(0, f(), 0.9)] + arp(K, [67, 72, 79], 0.05, 0.4, 0.6, t0=0.05)))(mount_fx), tonal=True)
    S(f'vehicle.{rid}.action', 'play', f'{name}: tap action ({ad})', act_fx)
    S(f'vehicle.{rid}.eject', 'play', f'{name}: knocked off / ride ends by hit (soft pop + falling notes)', (lambda f: lambda: mixl([(0, pop(500, 220, 0.12, 0.5), 0.7), (0.02, f() * 0.5, 0.6)] + arp(K, [79, 72], 0.06, 0.35, 0.6, t0=0.05)))(mount_fx), tonal=True)
S('vehicle.end', 'play', 'Any ride times out normally: gentle two-note release', lambda: mixl(arp(K, [79, 72], 0.08, 0.35, 0.6)), tonal=True)
S('vehicle.hit', 'play', 'Ride absorbs a hit (Ride Craft III): padded thump', lambda: thud(200, 90, 0.2, 0.5, 0.4))

# ---------------------------------------------------------------- skills
SK = {'sparrow': ('Updraft Dash', lambda: mixl([(0, pop(2600, 3400, 0.07, 0.4, 0.01), 0.6), (0.05, whoosh(0.3, 500, 3500, 1.8, 0.6), 0.8)])),
      'squirrel': ('Stash', lambda: mixl([(i * 0.05, click(2800 + 200 * i, 0.4, 0.03), 0.5) for i in range(4)] + [(0.22, woodblock(650, 0.7, 0.15, 0.025), 0.9), (0.26, K(84, 0.4, 0.5), 0.6)])),
      'owl': ('Night Sight', lambda: mixl([(0, flute(67, 0.3, 0.5, vib=0, bend=[(0, 0), (0.3, -3)]), 0.6), (0.4, flute(64, 0.35, 0.45, vib=0, bend=[(0, 0), (0.35, -3)]), 0.6), (0.1, softpad(55, 0.8, 0.4, att=0.2), 0.5)])),
      'fox': ('Trickster Feint', lambda: mixl([(0, whoosh(0.2, 2000, 600, 2, 0.4), 0.6)] + arp(K, [84, 79, 84], 0.07, 0.4, 0.7))),
      'snail': ('Shell Up', lambda: mixl([(0, whoosh(0.4, 3000, 500, 1.8, 0.4), 0.5), (0.3, woodblock(380, 0.6, 0.3, 0.06), 0.8)])),
      'moth': ('Lantern Call', lambda: mixl([(0, whoosh(0.6, 400, 1600, 1.4, 0.4, 'in'), 0.6)] + arp(glock, [84, 91], 0.1, 0.35, 0.6, t0=0.45))),
      'frog': ('Tongue Snap', lambda: mixl([(0, whoosh(0.08, 800, 3000, 2, 0.5), 0.6), (0.07, pop(300, 600, 0.08, 0.7, 0.01), 0.8)])),
      'beetle': ('Horn Charge', lambda: mixl([(0, buzz(110, 0.35, 0.6, 30, 1.5, 0.5), 0.8), (0.3, thud(200, 90, 0.2, 0.6, 0.5), 0.8)]))}
for sid, (name, fx) in SK.items():
    S(f'skill.{sid}', 'play', f'Critter skill: {name}', fx)
S('skill.ready', 'play', 'A skill cooldown finishes: soft single ping', lambda: glock(88, 0.5, 0.35), tonal=True, cls='ui')

# ---------------------------------------------------------------- telegraphs + set pieces
S('trap.warn', 'play', 'THE shared warning: ascending two-note tick-tick (same on every world, so the ear learns it once)', lambda: warn_tick(84, 0.7), tonal=True, cls='warn')
S('trap.warn.close', 'play', 'Warning, last 0.4 s: the tick-tick a fourth higher and a little brighter', lambda: warn_tick(89, 0.75, lambda m, d, v: mixl([(0, K(m, 0.2, v), 1), (0, glock(m + 12, 0.15, v * 0.5), 0.5)])), tonal=True, cls='warn')
S('boss.windup', 'play', 'Any boss attack wind-up: the warning family stretched to three ticks + a swell', lambda: mixl([(0, warn_tick(84, 0.7), 1), (0.24, K(93, 0.25, 0.7), 1), (0, whoosh(0.6, 200, 1200, 1.4, 0.4, 'in'), 0.7)]), tonal=True, cls='warn')
S('setpiece.title', 'play', 'Set-piece title card bell (shared)', lambda: mixl([(0, bell(72, 2.6, 0.6), 1), (0, bell(79, 2.6, 0.35), 0.6)]), tonal=True, duck=0.5, cls='reward')
S('setpiece.calm', 'play', 'Calm spectacle begins: sparkle sweep up', lambda: mixl(arp(glock, [deg(i, 84) for i in range(6)], 0.05, 0.35, 0.6) + [(0, softpad(60, 1.0, 0.4, att=0.4, rel=0.8), 0.6)]), tonal=True, duck=0.3, cls='reward')
S('setpiece.chase', 'play', 'Chase begins: rising swell + two frame-drum hits', lambda: mixl([(0, whoosh(0.8, 200, 2000, 1.4, 0.5, 'in'), 0.7), (0.8, thud(140, 70, 0.3, 0.7), 0.9), (1.0, thud(140, 70, 0.3, 0.6), 0.8)]), duck=0.3, cls='reward')
S('setpiece.boss', 'play', 'Boss arrives: low bell + deep drum + held fifth', lambda: mixl([(0, bell(48, 3.0, 0.6, 0.6), 1), (0, thud(100, 50, 0.8, 0.8, 0.3), 0.9), (0.1, softpad(36, 1.5, 0.5, att=0.3, rel=1.0, cutoff=900), 0.6), (0.1, softpad(43, 1.5, 0.4, att=0.3, rel=1.0, cutoff=900), 0.5)]), tonal=True, duck=0.6, cls='reward')
S('setpiece.clear', 'play', 'Set piece cleared / boss defeated: bright resolved cadence', lambda: mixl(arp(K, [67, 72, 76, 79, 84, 88], 0.06, 0.5, 0.8, dur=1.0) + [(0.3, bell(84, 2.0, 0.4), 0.6)]), tonal=True, duck=0.5, cls='reward')

# ---------------------------------------------------------------- generic traps (v1 + v12)
GT = {
    'trap.twig.creak': ('Cracked twig creaks under the tip', lambda: mixl([(i * 0.07, woodblock(240 + 30 * i, 0.4, 0.12, 0.05), 0.6) for i in range(4)])),
    'trap.twig.snap': ('Cracked twig snaps', lambda: mixl([(0, crackle(0.2, 300, 0.7, 1200, 6000), 0.8), (0, woodblock(700, 0.7, 0.12, 0.02), 0.6)])),
    'trap.pulse': ('Pulse thorns extend: dry rising scrape', lambda: whoosh(0.3, 500, 2200, 2.2, 0.5, 'in')),
    'trap.door': ('Thorn gate door closes: wooden thunk', lambda: mixl([(0, thud(160, 80, 0.25, 0.6, 0.4), 0.9), (0, woodblock(330, 0.6, 0.2, 0.04), 0.6)])),
    'trap.gust': ('Crosswind gust blows: band-pass wind swell', lambda: whoosh(1.0, 250, 900, 1.3, 0.6)),
    'trap.sap': ('Sap-drain zone entered: low slurp', lambda: pop(260, 140, 0.3, 0.5, 0.1)),
    'trap.lure': ('Golden lure snaps shut on the greedy line: sweet chime turns sour', lambda: mixl([(0, glock(91, 0.4, 0.4), 0.6), (0.12, woodblock(400, 0.6, 0.12, 0.03), 0.8)])),
    'trap.twins': ('Twin beetles click their shells', lambda: mixl([(0, click(1500, 0.5, 0.04), 0.6), (0.08, click(1700, 0.5, 0.04), 0.6)])),
    'trap.tide': ('Rising thorn tide starts climbing: low creeping rumble', lambda: lp(whoosh(1.4, 100, 300, 1.4, 0.7, 'in'), 700)),
    'trap.crow.caw': ('Crow leaves its perch and marks the lane: a soft caw', lambda: mixl([(0, buzz(520, 0.22, 0.6, 30, 0.85, 0.9), 1), (0.26, buzz(500, 0.18, 0.5, 30, 0.85, 0.9), 0.8)])),
    'trap.crow.dive': ('Crow dives: feathered swoosh down', lambda: whoosh(0.35, 3000, 600, 2.0, 0.6)),
    'trap.web': ('Spider web contact: elastic creak', lambda: mixl([(0, pluck(43, 0.6, 0.6, 0.3, 0.3, 0.6, bend=[(0, 0), (0.3, 3)]), 1)])),
    'trap.web.tear': ('Web torn by a fork: twang + strands whipping', lambda: mixl([(0, pluck(55, 0.6, 0.7, 0.2, 0.4, 1.0, bend=[(0, 0), (0.1, -5)]), 1), (0.02, whoosh(0.2, 1500, 5000, 2, 0.4), 0.6)])),
    'trap.pecker': ('Woodpecker drill: accelerating rat-a-tat ending in a crack', lambda: mixl([(sum(0.08 * 0.85 ** k for k in range(i)), woodblock(800, 0.5, 0.05, 0.008), 0.7) for i in range(9)] + [(0.5, crackle(0.15, 300, 0.6, 1000, 5000), 0.7)])),
    'trap.cone': ('Squirrel drops a cone: whistle-fall + woody bonk', lambda: mixl([(0, pop(1600, 700, 0.4, 0.3, 0.3), 0.6), (0.4, woodblock(450, 0.7, 0.15, 0.03), 0.9)])),
    'trap.hornets': ('Hornet patrol: rising buzz with doppler (1.2 s)', lambda: buzz(210, 1.2, 0.6, 33, 1.25, 0.8)),
    'trap.jaws': ('Flytrap jaws close: wet smack', lambda: mixl([(0, pop(300, 120, 0.15, 0.7, 0.03), 0.8), (0, crackle(0.08, 600, 0.5, 800, 3000), 0.6)])),
    'trap.jaws.quiver': ('Flytrap quiver before closing: soft tremolo', lambda: buzz(160, 0.8, 0.4, 14, 1.0, 0.4)),
    'trap.spores': ('Sleep spores entered: muffled hum + dreamy reversed chime', lambda: mixl([(0, softpad(55, 0.8, 0.5, att=0.3, rel=0.3, cutoff=500), 0.8), (0, whoosh(0.5, 2500, 900, 1.6, 0.3, 'in'), 0.5), (0.45, glock(91, 0.5, 0.35), 0.6)])),
    'trap.icicle.shake': ('Icicles shake: crystalline tinkle', lambda: chain_clink(0.5, 6, 4)),
    'trap.icicle.crack': ('Icicle falls and shatters: crack + glitter', lambda: mixl([(0, crackle(0.15, 400, 0.7, 2500, 9000), 0.8)] + arp(glock, [100, 96, 103], 0.03, 0.3, 0.5))),
    'trap.seesaw': ('Seesaw bough pivots: long creak', lambda: mixl([(i * 0.05, woodblock(200 + 10 * i, 0.3, 0.1, 0.06), 0.5) for i in range(8)])),
    'trap.embers': ('Ember flares: soft fire whoomph', lambda: mixl([(0, whoosh(0.4, 200, 900, 1.6, 0.6, 'out'), 0.8), (0, crackle(0.4, 80, 0.4, 1500, 6000), 0.5)])),
    'trap.bats.squeak': ('Bat eyes glow: tiny squeak', lambda: mixl([(0, pop(3200, 4200, 0.05, 0.3, 0.01), 0.6), (0.07, pop(3400, 4400, 0.05, 0.3, 0.01), 0.5)])),
    'trap.bats.swoop': ('Bat swoops on an arc', lambda: whoosh(0.3, 2400, 900, 2.2, 0.5)),
    'trap.candy.tick': ('Gingerbread crusher timer: music-box tick (every 0.25 s)', lambda: musicbox(96, 0.2, 0.5)),
    'trap.candy.crunch': ('Crusher closes: sugary crunch', lambda: lp(crackle(0.25, 500, 0.8, 1200, 5000), 6000)),
    'trap.strangle': ('Strangler fig tendrils grow in: building wood groan', lambda: mixl([(i * 0.12, woodblock(150 + 15 * i, 0.4, 0.2, 0.08), 0.6) for i in range(9)])),
    'trap.pendulum': ('Bamboo pendulum swing: hollow tok + whoosh', lambda: mixl([(0, woodblock(520, 0.6, 0.2, 0.04), 0.8), (0.03, whoosh(0.35, 400, 1800, 1.8, 0.5), 0.6)])),
    'hazard.gate': ('Classic gate/split hazard warning texture (rarely used; trap.warn covers it)', lambda: woodblock(600, 0.4, 0.1, 0.02)),
    'hazard.beetle': ('Beetle crawls near: chitter', lambda: mixl([(i * 0.03, click(1400 + 100 * (i % 3), 0.3, 0.02), 0.5) for i in range(6)])),
    'hazard.frost': ('Frost band: icy shimmer', lambda: mixl([(0, bp(noise(int(0.6 * SR)), 3000, 5500) * np.hanning(int(0.6 * SR)) * 0.08, 1)] + arp(glock, [96, 103], 0.1, 0.25, 0.5))),
    'hazard.wind': ('Wind band: steady soft wind swell', lambda: whoosh(0.9, 200, 600, 1.3, 0.5)),
}
for gid, (d, fn) in GT.items():
    S(gid, 'traps', d, fn, cls='fx')


# ====================================================================== WORLDS (traps + boss per world)
def world_set(w, traps):
    W = WORLD[w]
    inst, hi = W['inst'], W['hi']
    r = W['root']
    for tid, (tell_d, tell, fire_d, fire) in traps.items():
        S(f'{w}.trap.{tid}.tell', w, tell_d, tell, cls='tell')
        S(f'{w}.trap.{tid}.fire', w, fire_d, fire, cls='fx')
    S(f'{w}.boss.enter', w, f'{w} boss entrance: world-timbre stinger ({W["desc"]}) over a low drum', lambda: mixl(
        [(0, thud(100, 50, 0.7, 0.8, 0.3), 0.9)] + arp(inst, [r - 12, r - 5, r, r + 3 if W['scale'][1] in (1, 3) else r + 7], 0.12, 0.6, 0.8, dur=1.4) + [(0.1, softpad(r - 24, 1.4, 0.5, att=0.2, rel=1.0, cutoff=800), 0.6)]), duck=0.5, cls='reward')
    S(f'{w}.boss.a1', w, f'{w} boss attack 1 (sweep across a lane): world-timbre glissando + whoosh', lambda: mixl(
        [(0, whoosh(0.5, 300, 2500, 1.5, 0.6), 0.8)] + arp(hi, [wdeg(w, i, 0) for i in range(6)], 0.04, 0.45, 0.6, dur=0.6)))
    S(f'{w}.boss.a2', w, f'{w} boss attack 2 (slam / stomp): low impact + world note', lambda: mixl(
        [(0, thud(130, 50, 0.6, 0.9, 0.5), 1), (0.01, crackle(0.25, 200, 0.5, 600, 3000), 0.5), (0.02, inst(r - 12, 1.0, 0.6), 0.6)]))
    S(f'{w}.boss.a3', w, f'{w} boss attack 3 (volley of projectiles): three quick launches', lambda: mixl(
        sum([[(i * 0.16, whoosh(0.18, 800, 3500, 2, 0.45), 0.6), (i * 0.16, hi(wdeg(w, 6 - i, 1), 0.3, 0.4), 0.6)] for i in range(3)], [])))
    S(f'{w}.boss.hurt', w, f'{w} boss foiled / hurt: bright hit + rising world interval', lambda: mixl(
        [(0, thud(240, 120, 0.15, 0.6, 0.5), 0.7)] + arp(hi, [wdeg(w, 3, 1), wdeg(w, 5, 1)], 0.06, 0.5, 0.7, dur=0.6)))
    S(f'{w}.boss.defeat', w, f'{w} boss defeated: world-timbre cascade resolving on the tonic', lambda: mixl(
        arp(inst, [wdeg(w, i, 0) for i in range(8)], 0.06, 0.5, 0.7, dur=1.2) + [(0.5, inst(r + 12, 2.0, 0.6), 0.7), (0.5, bell(r + 12, 2.0, 0.4), 0.5)]), duck=0.6, cls='reward')


world_set('meadow', {
    'wasp': ('Wasp on patrol: warm low buzz rising (tell)', lambda: buzz(190, 0.9, 0.5, 34, 1.15, 0.7),
             'Wasp sting lands: quick buzz-zip', lambda: mixl([(0, buzz(260, 0.2, 0.7, 40, 1.3, 1.0), 1), (0.12, whoosh(0.12, 2000, 5000, 2, 0.4), 0.6)])),
    'gust': ('Summer gust gathers: grass rustle swells', lambda: mixl([(0, rustle(0.9, 0.5), 0.7), (0, whoosh(0.9, 300, 1200, 1.4, 0.5, 'in'), 0.7)]),
             'Gust blows through: wind push', lambda: whoosh(0.7, 900, 300, 1.4, 0.7, 'out')),
    'thistle': ('Thistle head swells: soft creak and tick', lambda: mixl([(0, woodblock(900, 0.3, 0.06, 0.01), 0.6), (0.15, woodblock(1000, 0.3, 0.06, 0.01), 0.6)]),
                'Thistle bursts into prickly seeds: pop + seed spray', lambda: mixl([(0, pop(400, 900, 0.1, 0.7), 0.8), (0.02, crackle(0.3, 200, 0.5, 2500, 8000), 0.6)])),
    'kite': ('Kite string tightens across the lane: rising string hum', lambda: pluck(52, 1.0, 0.4, 0.5, 0.8, 0.5, bend=[(0, 0), (0.8, 5)]),
             'Kite string sweeps: taut whip', lambda: mixl([(0, whoosh(0.25, 1200, 400, 2.5, 0.6), 0.8), (0, pluck(64, 0.4, 0.5, 0.5, 0.2, 0.8), 0.6)])),
})
world_set('starry', {
    'crowflock': ('Crows lift from the wheat: many wing flaps + distant caws', lambda: mixl([(i * 0.05, whoosh(0.12, 500, 1500, 1.8, 0.3), 0.5) for i in range(10)] + [(0.3, buzz(480, 0.18, 0.4, 30, 0.85, 0.9), 0.5)]),
                  'Crow flock sweeps through: a dark rushing swoosh', lambda: whoosh(0.6, 2200, 400, 1.6, 0.7)),
    'swirl': ('Sky swirl begins to turn: slow circular whoosh with celesta glints', lambda: mixl([(0, whoosh(1.0, 300, 1400, 1.5, 0.4, 'in'), 0.7)] + arp(celesta, [87, 91, 94], 0.25, 0.3, 0.5)),
              'Swirl pulls: deep turning gust', lambda: mixl([(0, whoosh(0.8, 1400, 250, 1.5, 0.6), 0.8), (0, softpad(39, 0.6, 0.4, att=0.05, rel=0.4, cutoff=600), 0.6)])),
    'cypress': ('Cypress flame sways: low brushed flicker', lambda: crackle(0.7, 60, 0.4, 600, 3000),
                'Cypress lashes out: whoomph', lambda: whoosh(0.4, 200, 1200, 1.6, 0.8, 'out')),
    'starfall': ('A star loosens overhead: twinkle shake', lambda: mixl(arp(celesta, [94, 99, 94, 99], 0.08, 0.35, 0.5)),
                 'Star falls and bursts: falling glissando + sparkle crack', lambda: mixl([(0, pop(2400, 600, 0.35, 0.4, 0.2), 0.6), (0.33, crackle(0.15, 300, 0.6, 2500, 9000), 0.8)])),
})
world_set('fresco', {
    'censer': ('Censer swings on its chain: chain clinks', lambda: chain_clink(0.5, 5, 6),
               'Censer swings through: heavy whoosh + clink', lambda: mixl([(0, whoosh(0.45, 300, 1400, 1.6, 0.7), 0.8), (0.3, chain_clink(0.5, 3, 7), 0.6)])),
    'plaster': ('Plaster cracks overhead: dry trickle', lambda: crackle(0.6, 90, 0.4, 1500, 6000, 9),
                'Plaster chunk falls and crumbles', lambda: mixl([(0, thud(180, 80, 0.2, 0.6, 0.6), 0.8), (0.01, crackle(0.4, 300, 0.6, 800, 5000, 10), 0.7)])),
    'bell': ('Bell rope pulled: low bell swing creak', lambda: mixl([(0, woodblock(220, 0.4, 0.3, 0.08), 0.6)]),
             'Bell tolls: a sound-ring expands (low bell, soft)', lambda: bell(50, 2.2, 0.7, 0.7)),
    'candle': ('Candles gutter: tiny flame flicker', lambda: crackle(0.4, 50, 0.3, 1200, 5000, 12),
               'Candle flare: soft whoomph', lambda: whoosh(0.35, 250, 1000, 1.6, 0.6, 'out')),
})
world_set('ukiyo', {
    'wave': ('Great wave rises: building surf roar', lambda: lp(whoosh(1.2, 150, 900, 1.3, 0.7, 'in'), 2500),
             'Wave crest crashes across: big soft splash', lambda: mixl([(0, splash(0.8, 0.8), 0.9), (0, lp(whoosh(0.8, 800, 200, 1.4, 0.7, 'out'), 1500), 0.8)])),
    'foam': ('Foam claws gather: fizz', lambda: crackle(0.6, 300, 0.35, 3000, 9000, 13),
             'Foam claws snatch: spray hiss', lambda: whoosh(0.3, 3000, 1200, 2, 0.6, 'out')),
    'wind': ('Mountain wind draws in: shakuhachi-like breath', lambda: flute(62, 0.7, 0.5, vib=0, scoop=2.0, breath=0.4),
             'Wind blast: rushing gust', lambda: whoosh(0.7, 600, 250, 1.4, 0.7, 'out')),
    'crane': ('Crane circles: wide wing beats', lambda: mixl([(i * 0.28, whoosh(0.2, 300, 900, 1.6, 0.4), 0.6) for i in range(3)]),
              'Crane dives: long swoop + koto stab', lambda: mixl([(0, whoosh(0.4, 2500, 500, 2, 0.6), 0.8), (0.3, koto(63, 0.6, 0.5), 0.6)])),
})
world_set('lilies', {
    'ripple': ('Pond ripple gathers: water drops', lambda: mixl([(i * 0.12, water_drop(800 + 150 * i, 0.4), 0.6) for i in range(4)]),
               'Ripple ring expands: soft splash ring', lambda: mixl([(0, splash(0.5, 0.5), 0.7), (0, piano(49, 0.8, 0.3), 0.5)])),
    'dragonfly': ('Dragonfly hovers: thin wing whirr', lambda: buzz(320, 0.8, 0.35, 70, 1.0, 1.0),
                  'Dragonfly darts: zip', lambda: whoosh(0.15, 1500, 5000, 2.5, 0.6)),
    'heron': ('Heron cocks its head: reed creak', lambda: mixl([(0, woodblock(500, 0.3, 0.15, 0.04), 0.6), (0.1, woodblock(560, 0.3, 0.15, 0.04), 0.5)]),
              'Heron beak strikes: sharp jab + splash', lambda: mixl([(0, whoosh(0.1, 1000, 4000, 2, 0.6), 0.6), (0.08, splash(0.35, 0.6), 0.8)])),
    'pollen': ('Pollen cloud drifts: hazy hum + reversed piano', lambda: mixl([(0, softpad(61, 0.8, 0.4, att=0.3, rel=0.3, cutoff=700), 0.7), (0, whoosh(0.7, 2000, 800, 1.6, 0.3, 'in'), 0.5)]),
               'Pollen cloud entered: muffled dreamy chime', lambda: mixl([(0, piano(85, 0.8, 0.4), 0.6), (0.05, piano(80, 0.8, 0.3), 0.5)])),
})
world_set('gilded', {
    'spiral': ('Gold spiral begins to spin: harp shimmer winding up', lambda: mixl(arp(lambda m, d, v: harp(m, d, v), [wdeg('gilded', i, 0) for i in range(6)], 0.06, 0.35, 0.6)),
               'Spiral blade sweeps: metallic whoosh + triangle', lambda: mixl([(0, whoosh(0.4, 800, 3500, 2, 0.6), 0.8), (0.05, triangle_inst(0.4, 0.8, 2600), 0.6)])),
    'tesserae': ('Mosaic tiles loosen: ceramic clicks', lambda: mixl([(i * 0.07, click(2200 + 200 * (i % 4), 0.35, 0.03), 0.6) for i in range(6)]),
                 'Tiles rain down: tinkling clatter', lambda: mixl([(i * 0.035, glock(96 + (i * 5) % 12, 0.2, 0.3), 0.5) for i in range(10)])),
    'eye': ('A gilded eye opens: low harp + shimmer swell', lambda: mixl([(0, harp(52, 1.0, 0.4), 0.7), (0, whoosh(0.8, 400, 1500, 1.5, 0.3, 'in'), 0.5)]),
            'Eye gaze beam: humming glass tone', lambda: mixl([(0, glock(88, 0.8, 0.4), 0.7), (0, softpad(64, 0.5, 0.4, att=0.05, rel=0.3, cutoff=2000), 0.6)])),
    'leafstorm': ('Gold leaves stir: metallic rustle', lambda: mixl([(0, rustle(0.7, 0.4), 0.6), (0.2, triangle_inst(0.3, 0.8, 3400), 0.4)]),
                  'Gold leaf storm gusts: shimmering wind', lambda: mixl([(0, whoosh(0.7, 500, 2500, 1.5, 0.7), 0.8), (0, crackle(0.6, 200, 0.4, 3000, 9000), 0.5)])),
})
world_set('lacquer', {
    'lantern': ('Lantern cord frays: paper rustle + creak', lambda: mixl([(0, crackle(0.4, 120, 0.4, 1500, 6000), 0.6), (0.1, woodblock(300, 0.3, 0.2, 0.06), 0.6)]),
                'Lantern drops and flares: soft paper whoomph', lambda: mixl([(0, whoosh(0.4, 300, 1200, 1.6, 0.7, 'out'), 0.8), (0.05, tranh(67, 0.6, 0.4), 0.5)])),
    'firecracker': ('Firecracker string fizzes: fuse hiss', lambda: crackle(0.8, 200, 0.4, 3000, 9000, 14),
                    'Firecrackers pop: a soft rattle of pops (kept far from harsh)', lambda: mixl([(i * 0.045 + (i % 3) * 0.01, pop(800 + 90 * (i % 5), 300, 0.05, 0.5, 0.008), 0.6) for i in range(10)])),
    'dragon': ('Dragon dance approaches: mõ + drum roll building', lambda: mixl([(i * 0.1, woodblock(1100, 0.3 + 0.03 * i, 0.08, 0.02), 0.6) for i in range(8)] + [(0.6, drum_low(0.5, 240, 170, 0.15, 0.2, 0.3), 0.7)]),
               'Dragon sweeps across the lane: drum hit + whoosh + gong tap', lambda: mixl([(0, drum_low(0.7, 200, 120, 0.25, 0.3, 0.5), 0.9), (0, whoosh(0.5, 400, 2000, 1.5, 0.6), 0.7), (0.05, gong(55, 1.6, 0.5), 0.6)])),
    'kite': ('Sáo diều (flute kite) whistles overhead: rising breathy tone', lambda: flute(81, 0.8, 0.4, vib=0.4, scoop=3, breath=0.3),
             'Kite dives: falling whistle swoop', lambda: mixl([(0, flute(84, 0.35, 0.5, vib=0, bend=[(0, 0), (0.35, -9)], breath=0.3), 0.8), (0.05, whoosh(0.3, 2500, 700, 2, 0.4), 0.5)])),
})
