"""Forkwood 2.0 world music: seven original adaptive loops, rendered offline.

Each world renders three sample-locked stems of identical length:
  calm  = the full calm arrangement (always playing)
  chase = an added pulse layer (ostinato + light percussion) for chase set pieces
  boss  = an added weight layer (low drums, drone, tension pad) for boss set pieces
All stems share the same harmony, so any mix of them is consonant. The loop tail
(reverb, ringing notes) is folded back onto the start, so the files loop seamlessly.

Usage: python3 music.py [world ...]   (writes WAVs to tools/audio/out/)
All melodies, harmonies and arrangements here are original compositions.
"""
import sys, os, json
import numpy as np
import soundfile as sf
from synth import *

OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def nm(s):
    """'F#5' → MIDI 78, 'Bb4' → 70, 'Cb6' → 83."""
    p = NOTE[s[0]]
    i = 1
    while i < len(s) and s[i] in '#b':
        p += 1 if s[i] == '#' else -1
        i += 1
    return p + 12 * (int(s[i:]) + 1)


def parse(line):
    """'F#5/1.5 E5/.5 r/1 ...' → [(beat, dur, midi|None)] from beat 0."""
    out, b = [], 0.0
    for tok in line.split():
        n, d = tok.split('/')
        d = float(d)
        out.append((b, d, None if n == 'r' else nm(n)))
        b += d
    return out


def chord(names):
    return [nm(x) for x in names.split()]


class Song:
    def __init__(self, bpm, bpb, bars, extra=4.0):
        self.bpm, self.bpb, self.bars = bpm, bpb, bars
        self.spb = 60.0 / bpm
        self.loop_sec = bars * bpb * self.spb
        self.loop_n = int(round(self.loop_sec * SR))
        self.calm = Track(self.loop_sec + extra, self.loop_n)
        self.chase = Track(self.loop_sec + extra, self.loop_n)
        self.boss = Track(self.loop_sec + extra, self.loop_n)
        self.rng = np.random.default_rng(bpm * 7 + bars)

    def t(self, bar, beat=0.0):
        return (bar * self.bpb + beat) * self.spb

    def human(self, s=0.008):
        return float(self.rng.normal(0, s))

    def melody(self, track, inst, lines, bar0=0, gain=1.0, p=0.0, vel=0.65, legato=1.0, oct=0, **kw):
        b = bar0 * self.bpb
        for beat, d, m in parse(lines):
            if m is None: continue
            v = vel * float(self.rng.uniform(0.9, 1.05))
            x = inst(m + 12 * oct, d * self.spb * legato, v, **kw) if kw else inst(m + 12 * oct, d * self.spb * legato, v)
            track.add(x, (b + beat) * self.spb + self.human(), gain, p)


def finish(song, name, ir, wet=(0.32, 0.22, 0.2), targets=(-21.0, -19.0, -17.5)):
    """Reverb, loop-fold and loudness-match the three stems.
    targets: LUFS of calm, calm+chase, calm+chase+boss."""
    stems = {}
    for key, w in zip(('calm', 'chase', 'boss'), wet):
        tr = getattr(song, key)
        x = reverb(tr.buf, ir, w)
        x = np.vstack([hp(c, 40, 2) for c in x])  # nothing below 40 Hz: phones cannot play it and it eats headroom
        stems[key] = loopify(x, song.loop_n)
    g_calm = 10 ** ((targets[0] - lufs(stems['calm'])) / 20)
    stems['calm'] *= g_calm

    def gain_for(base, layer, target):
        lo, hi = 0.0, 4.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if lufs(base + layer * mid) < target: lo = mid
            else: hi = mid
        return (lo + hi) / 2

    g_ch = gain_for(stems['calm'], stems['chase'], targets[1])
    stems['chase'] *= g_ch
    g_bo = gain_for(stems['calm'] + stems['chase'], stems['boss'], targets[2])
    stems['boss'] *= g_bo
    peak = np.max(np.abs(stems['calm'] + stems['chase'] + stems['boss']))
    if peak > 0.89:
        for k in stems: stems[k] *= 0.89 / peak
    info = {'loopSec': song.loop_n / SR, 'loopSamples': song.loop_n, 'bpm': song.bpm, 'beatsPerBar': song.bpb, 'bars': song.bars}
    for k, x in stems.items():
        sf.write(os.path.join(OUT, f'{name}-{k}.wav'), x.T.astype(np.float32), SR, subtype='FLOAT')
    mix = {'calm': stems['calm'], 'chase': stems['calm'] + stems['chase'], 'boss': stems['calm'] + stems['chase'] + stems['boss']}
    info['lufs'] = {k: round(lufs(v), 2) for k, v in mix.items()}
    info['peak'] = {k: round(float(20 * np.log10(np.max(np.abs(v)) + 1e-9)), 2) for k, v in mix.items()}
    # loop seam check: RMS of the sample-to-sample jump across the seam vs inside
    seam = np.abs(stems['calm'][:, 0] - stems['calm'][:, -1]).max()
    info['seamJump'] = round(float(seam), 5)
    with open(os.path.join(OUT, f'{name}.json'), 'w') as f:
        json.dump(info, f, indent=1)
    print(name, json.dumps(info))
    return info


def arp_bar(song, track, inst, notes, bar, pattern, step=0.5, vel=0.45, gain=1.0, p=0.0, dur=None):
    """Broken-chord figure: pattern indexes into notes, one per `step` beats (None = rest)."""
    for i, idx in enumerate(pattern):
        if idx is None: continue
        m = notes[idx % len(notes)] + 12 * (idx // len(notes))
        d = dur if dur else step * 2
        track.add(inst(m, d * song.spb, vel * float(song.rng.uniform(0.85, 1.05))),
                  song.t(bar, i * step) + song.human(0.006), gain, p)


# ====================================================================== 1 MEADOW
def meadow():
    """Golden Hour Meadow: anime-film piano and strings, D major, 76 bpm.
    IV-V-iii-vi 'royal road' progression; piano melody over broken chords."""
    s = Song(76, 4, 16)
    prog = ['G2 D3 A3 B3 F#4', 'A2 E3 A3 C#4 E4', 'F#2 C#3 A3 C#4 E4', 'B1 F#2 A3 D4 F#4',
            'E2 B2 G3 B3 D4', 'A2 E3 G3 C#4 E4', 'D2 A2 F#3 A3 E4', 'D2 A2 E3 A3 D4',
            'G2 D3 A3 B3 F#4', 'A2 E3 A3 C#4 E4', 'F#2 C#3 A3 C#4 E4', 'B1 F#2 A3 D4 F#4',
            'G2 D3 A3 B3 F#4', 'G2 E3 A3 C#4 E4', 'B1 F#2 A3 D4 F#4', 'A2 E3 A3 D4 E4']
    mel = ('F#5/1.5 E5/.5 D5/1 A4/1 C#5/1.5 D5/.5 E5/2 A5/1 F#5/1 E5/1 C#5/1 D5/3 r/1 '
           'G5/1.5 F#5/.5 E5/1 B4/1 C#5/1 E5/1 A5/1.5 G5/.5 F#5/2 E5/1 D5/1 E5/4 '
           'F#5/1.5 E5/.5 D5/1 A5/1 G5/1.5 F#5/.5 E5/2 A5/1 C#6/1 B5/1 A5/1 F#5/3 r/1 '
           'B5/1.5 A5/.5 F#5/1 D5/1 E5/1 F#5/1 G5/1 A5/1 F#5/2 D5/1 E5/1 E5/3 r/1')
    s.melody(s.calm, piano, mel, gain=1.0, p=0.1, vel=0.62)
    # a second voice in thirds/sixths on the last phrase only (bars 12-15), quiet
    s.melody(s.calm, glock, 'r/4 r/4 r/4 r/4 r/4 r/4 r/4 r/4 r/4 r/4 r/4 r/4 D6/2 F#6/2 C#6/2 E6/2 B5/2 D6/2 A5/4', gain=0.5, p=0.4, vel=0.5)
    for bar, c in enumerate(prog):
        n = chord(c)
        # left hand: bass on 1, then a rising-falling figure
        s.calm.add(piano(n[0], 3.6 * s.spb, 0.55), s.t(bar), 0.9, -0.15)
        arp_bar(s, s.calm, piano, n[1:], bar, [None, 0, 1, 2, 3, 2, 1, 0], vel=0.33, gain=0.75, p=-0.1, dur=1.4)
        for k, m in enumerate(n[1:]):
            s.calm.add(strings(m + 12, 4 * s.spb, 0.4, att=0.9, rel=1.2), s.t(bar), 0.55, -0.5 + k * 0.33)
        # chase: pizzicato eighths + shaker + frame drum
        arp_bar(s, s.chase, pizz, [n[0] + 12, n[2], n[3]], bar, [0, 2, 1, 2, 0, 2, 1, 2], vel=0.6, gain=0.9, p=0.25)
        for e in range(8):
            s.chase.add(shaker(0.5 if e % 2 else 0.8), s.t(bar, e * 0.5) + s.human(0.004), 1.0, 0.45)
        for b in (0, 2.5, 3):
            s.chase.add(drum_low(0.5, 140, 70, 0.25, 0.3, 0.6), s.t(bar, b), 0.8, -0.1)
        # boss: timpani on 1 and 3, low string ostinato, horn pad
        s.boss.add(timpani(n[0] + 12, 0.7), s.t(bar), 1.0, 0)
        s.boss.add(timpani(n[0] + 12, 0.45), s.t(bar, 2), 1.0, 0)
        arp_bar(s, s.boss, lambda m, d, v: strings(m, d, v, att=0.02, rel=0.15, cutoff=1800, vib=0.02),
                [n[0] + 12, n[0] + 24], bar, [0, 0, 1, 0, 0, 0, 1, 0], vel=0.8, gain=1.0, dur=0.45)
        s.boss.add(hornpad(n[2] + 12, 4 * s.spb, 0.6), s.t(bar), 0.8, 0.3)
    return finish(s, 'meadow', make_ir(2.6, 3.4, 0.025, 7000, seed=1))


# ====================================================================== 2 STARRY
def starry():
    """Starry River: a dreamy celesta waltz in Eb, 84 bpm 3/4, with harp
    oom-pah-pah and a slow string sky. Borrowed Abm6 gives the night colour."""
    s = Song(84, 3, 24)
    C = {'Ebmaj7': 'Eb2 Bb3 D4 G4', 'Cm9': 'C2 Bb3 Eb4 G4', 'Abmaj7': 'Ab1 C4 Eb4 G4', 'Bb6': 'Bb1 D4 F4 G4',
         'Gm7': 'G1 Bb3 D4 F4', 'Cm7': 'C2 Bb3 Eb4 G4', 'Fm9': 'F1 Ab3 Eb4 G4', 'Bb7sus': 'Bb1 Ab3 Eb4 F4',
         'Ebmaj7/G': 'G1 Bb3 D4 Eb4', 'Abm6': 'Ab1 Cb4 Eb4 F4', 'C9': 'C2 E3 Bb3 D4', 'Bb7': 'Bb1 Ab3 D4 F4'}
    prog = ['Ebmaj7', 'Cm9', 'Abmaj7', 'Bb6', 'Gm7', 'Cm7', 'Fm9', 'Bb7sus',
            'Ebmaj7', 'Ebmaj7/G', 'Abmaj7', 'Abm6', 'Gm7', 'C9', 'Fm9', 'Bb7sus',
            'Ebmaj7', 'Cm9', 'Abmaj7', 'Abm6', 'Gm7', 'Fm9', 'Bb7sus', 'Bb7']
    mel = ('G5/2 Bb5/1 D6/2 C6/1 Bb5/2 G5/1 F5/3 F5/1 G5/1 Bb5/1 Eb6/2 D6/1 C6/1 Ab5/1 G5/1 F5/3 '
           'G5/2 Bb5/1 Eb6/2 D6/1 C6/2 Eb6/1 Cb6/3 Bb5/2 F5/1 E5/2 G5/1 Ab5/2 G5/1 F5/3 '
           'G5/2 Bb5/1 D6/2 C6/1 Eb6/2 C6/1 Cb6/2 Ab5/1 Bb5/2 G5/1 Ab5/1 G5/1 F5/1 Eb5/1 F5/1 Bb5/1 Ab5/2 F5/1')
    s.melody(s.calm, celesta, mel, gain=1.0, p=0.15, vel=0.75)
    s.melody(s.calm, piano, mel, gain=0.28, p=0.15, vel=0.4, oct=-1)  # soft piano doubling an octave down
    for bar, name in enumerate(prog):
        n = chord(C[name])
        s.calm.add(piano(n[0] + 12, 2.8 * s.spb, 0.5), s.t(bar), 0.8, -0.2)
        for b in (1, 2):
            for k, m in enumerate(n[1:]):
                s.calm.add(harp(m, 1.0, 0.33), s.t(bar, b) + k * 0.012, 0.6, -0.3 + 0.2 * k)
        if bar % 2 == 0:
            for k, m in enumerate(n[1:]):
                s.calm.add(strings(m + 12, 6 * s.spb, 0.35, att=1.4, rel=1.6, cutoff=2400), s.t(bar), 0.5, 0.5 - k * 0.4)
        if bar % 4 == 3:  # star twinkle: a high celesta arpeggio
            for i, m in enumerate(n[1:] + [n[1] + 12]):
                s.calm.add(celesta(m + 24, 0.4, 0.35), s.t(bar, 1.5 + i * 0.25), 0.5, 0.7 - i * 0.3)
        # chase: flowing harp eighths + brush on the waltz
        arp_bar(s, s.chase, harp, n[1:], bar, [0, 1, 2, 3, 2, 1], vel=0.5, gain=0.9, p=0.35)
        s.chase.add(pizz(n[0] + 12, 0.5, 0.7), s.t(bar), 0.9, -0.2)
        for b in (0, 1, 2):
            s.chase.add(brush(0.9 if b == 0 else 0.55), s.t(bar, b), 1.0, 0.3)
        # boss: timpani roll on 1, low tremolo strings
        for r in range(6):
            s.boss.add(timpani(n[0] + 12, 0.25 + 0.06 * r, 0.6), s.t(bar, r * 0.08), 1.0, 0)
        s.boss.add(strings(n[0] + 12, 3 * s.spb, 0.7, att=0.15, rel=0.4, cutoff=1500, vib=0.4), s.t(bar), 1.0, -0.2)
        s.boss.add(hornpad(n[2], 3 * s.spb, 0.5), s.t(bar), 0.7, 0.3)
    return finish(s, 'starry', make_ir(3.4, 3.0, 0.03, 6500, seed=2), wet=(0.4, 0.28, 0.22))


# ====================================================================== 3 FRESCO
def fresco():
    """Fresco Cathedral: a cappella choir pad and soft flue organ in A Aeolian /
    Dorian, 60 bpm. Long chords, a chant-like soprano line, one bell."""
    s = Song(60, 4, 12)
    prog = ['A2 E3 A3 C4 E4', 'F2 C3 A3 C4 F4', 'G2 D3 G3 B3 D4', 'A2 E3 A3 C4 E4',
            'D2 A2 F3 A3 C4', 'E2 B2 G3 B3 D4', 'F2 C3 A3 C4 E4', 'G2 D3 G3 C4 D4',
            'C3 G3 C4 E4 G4', 'B2 D3 G3 B3 D4', 'A2 E3 A3 C4 E4', 'E2 B2 E3 G#3 B3']
    sop = ('E5/4 F5/2 E5/2 D5/4 E5/2 C5/2 F5/2 A5/2 G5/2 E5/2 A5/2 G5/2 C5/2 B4/2 '
           'C5/2 E5/2 D5/4 C5/2 E5/2 A4/2 G#4/2')
    s.melody(s.calm, lambda m, d, v: choir(m, d, v, 'ah', att=0.5, rel=1.0, voices=3), sop, gain=1.0, p=0.05, vel=0.75, legato=1.02)
    organ_line = ('A3/2 C4/2 A3/2 F3/2 G3/2 B3/2 C4/2 E4/2 D4/2 F4/2 E4/2 B3/2 C4/2 A3/2 '
                  'B3/2 D4/2 E4/2 C4/2 D4/2 B3/2 C4/2 A3/2 B3/2 E4/2')
    s.melody(s.calm, organ, organ_line, gain=0.8, p=-0.3, vel=0.55, legato=0.98)
    for bar, c in enumerate(prog):
        n = chord(c)
        s.calm.add(choir(n[0], 4 * s.spb, 0.7, 'oo', att=0.9, rel=1.3, voices=3), s.t(bar), 0.9, -0.15)
        for k, m in enumerate(n[2:]):
            s.calm.add(choir(m, 4 * s.spb, 0.55, 'ah' if k % 2 else 'oh', att=1.0, rel=1.4, voices=3), s.t(bar), 0.7, -0.4 + 0.4 * k)
        s.calm.add(organ(n[0], 4 * s.spb, 0.5, stops=(0.5, 0.7, 0.15, 0, 0)), s.t(bar), 0.6, 0)
        if bar in (0, 6):
            s.calm.add(bell(nm('A3') if bar == 0 else nm('E4'), 6.0, 0.55), s.t(bar), 0.7, 0.35)
        # chase: hand bells walking quarter notes + organ pedal eighths + soft timpani
        arp_bar(s, s.chase, lambda m, d, v: bell(m, 1.6, v, 0.6), [n[2] + 12, n[3] + 12, n[4] + 12], bar,
                [0, 1, 2, 1], step=1, vel=0.5, gain=0.8, p=0.4)
        for e in range(8):
            s.chase.add(organ(n[0], 0.4 * s.spb, 0.55 if e % 2 == 0 else 0.4, stops=(1, 0.5, 0, 0, 0), att=0.02, rel=0.12),
                        s.t(bar, e * 0.5), 0.9, -0.1)
        s.chase.add(timpani(n[0] + 12 if n[0] < 45 else n[0], 0.35), s.t(bar), 0.8, 0)
        # boss: low 'oh' choir stabs in a dotted rhythm + timpani + low organ minor drone
        for b in (0, 1.5, 3):
            s.boss.add(choir(n[0] - 12 + 12, 0.7 * s.spb, 0.9, 'oh', att=0.05, rel=0.4, voices=3), s.t(bar, b), 1.0, -0.2)
            s.boss.add(timpani(n[0] + 12 if n[0] < 45 else n[0], 0.6), s.t(bar, b), 0.9, 0.1)
        s.boss.add(organ(nm('A2'), 4 * s.spb, 0.6, stops=(0.8, 0.7, 0.2, 0, 0)), s.t(bar), 0.6, 0)
    return finish(s, 'fresco', make_ir(4.5, 3.2, 0.045, 5500, seed=3), wet=(0.5, 0.35, 0.3))


# ====================================================================== 4 UKIYO
def ukiyo():
    """Great Wave Cliffs: koto and an end-blown flute in the miyako-bushi
    (in) scale on D (D Eb G A Bb), 64 bpm, with a sea-mist drone."""
    s = Song(64, 4, 12)
    sets = [['D3', 'A3', 'D4', 'Eb4', 'A4']] * 2 + [['G3', 'D4', 'G4', 'A4', 'Bb4']] * 2 + \
           [['Bb2', 'D4', 'Eb4', 'G4', 'Bb4']] * 2 + [['Eb3', 'Bb3', 'D4', 'G4', 'A4']] * 2 + \
           [['D3', 'A3', 'D4', 'G4', 'A4']] * 2 + [['A2', 'D3', 'A3', 'Bb3', 'D4']] * 2
    fl = ('A4/3 Bb4/1 A4/4 G4/2 A4/1 D5/1 Eb5/3 D5/1 D5/2 Bb4/2 A4/4 G4/2 Eb4/2 D4/4 '
          'D5/2 Eb5/2 D5/3 Bb4/1 A4/2 G4/2 A4/4')
    for beat, d, m in parse(fl):
        sc = 1.2 if d >= 2 else 0.4
        x = flute(m, d * s.spb * 0.96, 0.7, vib=0.3, scoop=sc, breath=0.12)
        s.calm.add(x, beat * s.spb + s.human(0.01), 1.0, 0.15)
    pats = [[0, None, 2, 1, 3, None, 2, 4], [0, 1, None, 3, None, 4, 3, None]]
    for bar, st in enumerate(sets):
        n = [nm(x) for x in st]
        for i, idx in enumerate(pats[bar % 2]):
            if idx is None: continue
            bend = [(0, 0), (0.25, 0), (0.45, 1.0), (1.2, 1.0)] if (bar % 4 == 3 and i == 7) else None
            s.calm.add(koto(n[idx], 1.6, 0.5 * float(s.rng.uniform(0.85, 1.05)), bend=bend), s.t(bar, i * 0.5) + s.human(0.006), 0.8, -0.35 + 0.15 * idx)
        if bar % 4 == 0:  # sararin: a soft glissando down the open strings
            for k, m in enumerate(sorted(n + [x + 12 for x in n[2:]], reverse=True)):
                s.calm.add(koto(m, 1.2, 0.25), s.t(bar, 3.0) + k * 0.045, 0.5, 0.4 - k * 0.1)
        if bar % 2 == 0:
            s.calm.add(softpad(n[0] - 12 if n[0] > 45 else n[0], 8 * s.spb, 0.5, att=2.0, rel=2.0, cutoff=900), s.t(bar), 0.7, -0.1)
            s.calm.add(softpad(n[1], 8 * s.spb, 0.35, att=2.5, rel=2.0, cutoff=900), s.t(bar), 0.5, 0.2)
        # chase: shime-daiko ticks + koto ostinato
        for e in range(8):
            if e in (0, 3, 4, 6, 7):
                s.chase.add(drum_low(0.35 if e else 0.5, 420, 300, 0.07, 0.6, 0.25), s.t(bar, e * 0.5), 0.8, 0.3)
        s.chase.add(woodblock(1300, 0.5, 0.2, 0.02), s.t(bar, 3.5), 0.6, -0.4)
        arp_bar(s, s.chase, lambda m, d, v: koto(m, 0.9, v), [n[1], n[2], n[3]], bar, [0, 1, 2, 1, 0, 1, 2, 1], vel=0.42, gain=0.8, p=-0.3)
        # boss: o-daiko + low koto tremolo
        for b in (0, 1.5, 2.0, 3.0):
            s.boss.add(drum_low(0.9 if b == 0 else 0.6, 100, 60, 0.5, 0.35, 1.1), s.t(bar, b), 1.0, 0)
        for r in range(8):
            s.boss.add(koto(n[0] - 12 if n[0] > 45 else n[0], 0.5, 0.35), s.t(bar, 2 + r * 0.125), 0.7, -0.2)
        s.boss.add(softpad(nm('Eb3'), 4 * s.spb, 0.3, att=1.0, rel=1.0, cutoff=700), s.t(bar), 0.5, 0.3)
    return finish(s, 'ukiyo', make_ir(3.0, 3.6, 0.03, 6000, seed=4), wet=(0.38, 0.25, 0.22))


# ====================================================================== 5 LILIES
def lilies():
    """Lily Garden: impressionist solo piano in Db (Lydian colour, planed
    ninth chords), 63 bpm, triplet ripples like water under the pads."""
    s = Song(63, 4, 12)
    prog = ['Db2 Ab2 C4 Eb4 F4 Ab4', 'Db2 Ab2 Bb3 Eb4 G4 Bb4', 'Db2 Ab2 C4 Eb4 F4 Ab4', 'Cb2 Gb2 Bb3 Eb4 F4 Bb4',
            'Bb1 F2 Ab3 C4 Db4 F4', 'Gb1 Db2 F3 Ab3 Bb3 Db4', 'Eb2 Bb2 Gb3 Bb3 Db4 F4', 'Ab1 Eb2 Gb3 Bb3 Db4 Eb4',
            'Db2 Ab2 C4 Eb4 F4 Ab4', 'B1 F#2 A#3 C#4 D#4 F#4', 'Bb1 F2 Ab3 Db4 Eb4 F4', 'Ab1 Eb2 Gb3 Bb3 C4 Eb4']
    mel = ('Ab5/1.5 Bb5/.5 Ab5/1 F5/1 G5/2 Eb5/2 F5/1.5 Ab5/.5 Db6/2 Eb6/3 Bb5/1 '
           'C6/1.5 Db6/.5 Bb5/1 F5/1 Ab5/2 F5/2 Gb5/1 Bb5/1 Db6/1 Eb6/1 Db6/2 Bb5/1 Ab5/1 '
           'Ab5/1.5 Bb5/.5 Ab5/1 F5/1 D#5/2 F#5/2 Eb5/1 F5/1 Ab5/1 Db6/1 Bb5/3 Ab5/1')
    # melody in soft octaves
    s.melody(s.calm, piano, mel, gain=0.9, p=0.15, vel=0.55, legato=1.6)
    s.melody(s.calm, piano, mel, gain=0.35, p=0.2, vel=0.4, legato=1.6, oct=-1)
    for bar, c in enumerate(prog):
        n = chord(c)
        s.calm.add(piano(n[0], 4.2 * s.spb, 0.5), s.t(bar), 0.85, -0.25)
        s.calm.add(piano(n[1], 4.2 * s.spb, 0.35), s.t(bar, 0.02), 0.6, -0.2)
        # rippling triplet arpeggio, up then down, pedal held (long durations)
        up = n[2:] + [n[2] + 12]
        ripple = up + up[-2:0:-1]
        for i in range(12):
            m = ripple[i % len(ripple)]
            s.calm.add(piano(m, 2.5, 0.25 + 0.05 * np.sin(i / 2)), s.t(bar, i / 3) + s.human(0.005), 0.55, -0.35 + 0.06 * (i % 6))
        # chase: harp-like ostinato + soft brushes in a 12/8 lilt
        arp_bar(s, s.chase, harp, n[2:], bar, [0, 2, 1, 3, 2, 1] * 2, step=1 / 3, vel=0.45, gain=0.8, p=0.35)
        for b in range(4):
            s.chase.add(brush(0.8), s.t(bar, b), 1.0, 0.2)
            s.chase.add(brush(0.4), s.t(bar, b + 2 / 3), 1.0, 0.2)
            s.chase.add(drum_low(0.3, 120, 70, 0.2, 0.2, 0.4), s.t(bar, b), 0.6 if b % 2 == 0 else 0.0, 0)
        # boss: low octave tremolo + soft timpani + a whole-tone shimmer
        for r in range(16):
            s.boss.add(piano(n[0] + (12 if r % 2 else 0), 0.3, 0.45), s.t(bar, r * 0.25), 0.8, -0.1)
        s.boss.add(timpani(n[0] + 12, 0.55), s.t(bar), 1.0, 0)
        if bar % 2 == 1:
            for k in range(6):
                s.boss.add(celesta(nm('Db6') + 2 * k, 0.3, 0.3), s.t(bar, 2 + k * 0.17), 0.5, 0.5)
    return finish(s, 'lilies', make_ir(3.2, 3.0, 0.02, 6500, seed=5), wet=(0.36, 0.26, 0.22))


# ====================================================================== 6 GILDED
def gilded():
    """Gilded Grove: art-nouveau harp, flute and strings in E major with a
    borrowed iv (Am) for fin-de-siecle gold, 80 bpm."""
    s = Song(80, 4, 16)
    prog = ['E2 B2 G#3 B3 D#4 F#4', 'C#2 G#2 E3 G#3 B3 D#4', 'A1 E2 C#3 E3 G#3 B3', 'B1 F#2 A3 C#4 E4 F#4',
            'G#1 D#2 F#3 B3 D#4', 'C#2 G#2 E3 G#3 B3', 'F#1 C#2 A3 C#4 E4 G#4', 'B1 F#2 A3 C#4 E4 F#4',
            'E2 B2 G#3 B3 D#4 F#4', 'E2 B2 G#3 B3 D4 F#4', 'A1 E2 C#3 E3 G#3 B3', 'A1 E2 C3 E3 F#3 A3',
            'G#1 E2 G#3 B3 D#4', 'C#2 G#2 E3 G#3 B3 D#4', 'F#1 C#2 A3 C#4 E4 G#4', 'B1 F#2 A3 D#4 F#4 A4']
    mel = ('B5/2 G#5/1 F#5/1 E5/1 G#5/1 C#6/2 B5/1.5 A5/.5 E5/2 F#5/4 '
           'D#5/1 F#5/1 B5/2 G#5/1.5 F#5/.5 E5/2 A5/1 C#6/1 B5/1 A5/1 G#5/2 F#5/2 '
           'B5/2 G#5/1 F#5/1 D6/2 B5/2 C#6/1.5 B5/.5 A5/2 C6/3 A5/1 '
           'B5/2 G#5/2 E5/1 G#5/1 C#6/2 B5/1 A5/1 F#5/2 D#5/2 F#5/1 A5/1')
    s.melody(s.calm, lambda m, d, v: flute(m, d, v, vib=0.18, scoop=0.0, breath=0.05, bright=0.8), mel, gain=0.95, p=0.1, vel=0.6)
    for bar, c in enumerate(prog):
        n = chord(c)
        s.calm.add(harp(n[0] + 12, 3, 0.5), s.t(bar), 0.8, -0.2)
        up = n[1:] + [n[2] + 12]
        for i, m in enumerate(up):  # rolled arpeggio, rising
            s.calm.add(harp(m, 2.5, 0.38), s.t(bar, 0.5 + i * 0.5), 0.65, -0.4 + 0.15 * i)
        if bar % 8 == 7:  # glissando into the next phrase
            scale = [nm(x) for x in 'E4 F#4 G#4 A4 B4 C#5 D#5 E5 F#5 G#5 A5 B5'.split()]
            for k, m in enumerate(scale):
                s.calm.add(harp(m, 1.5, 0.25), s.t(bar, 3) + k * 0.06, 0.55, -0.5 + k * 0.09)
        for k, m in enumerate(n[2:5]):
            s.calm.add(strings(m, 4 * s.spb, 0.35, att=0.8, rel=1.2, cutoff=2800), s.t(bar), 0.5, 0.4 - 0.4 * k)
        if bar % 4 == 0:
            s.calm.add(triangle_inst(0.5, 2.5), s.t(bar), 0.6, 0.6)
        # chase: harp ostinato eighths + frame drum + shaker
        arp_bar(s, s.chase, harp, n[2:], bar, [0, 1, 2, 1, 0, 1, 2, 1], vel=0.45, gain=0.8, p=0.3)
        for e in range(8):
            s.chase.add(shaker(0.6 if e % 2 else 0.9), s.t(bar, e * 0.5), 0.9, 0.4)
        for b in (0, 1.5, 2):
            s.chase.add(drum_low(0.45, 150, 75, 0.22, 0.3, 0.5), s.t(bar, b), 0.8, -0.1)
        # boss: low strings + timpani + horn pad
        s.boss.add(timpani(n[0] + 12, 0.7), s.t(bar), 1.0, 0)
        s.boss.add(timpani(n[0] + 12, 0.4), s.t(bar, 2.5), 1.0, 0)
        s.boss.add(strings(n[0] + 12, 4 * s.spb, 0.7, att=0.2, rel=0.6, cutoff=1500, vib=0.05), s.t(bar), 1.0, -0.2)
        s.boss.add(hornpad(n[2] + 12, 4 * s.spb, 0.55), s.t(bar), 0.8, 0.3)
    return finish(s, 'gilded', make_ir(3.0, 3.2, 0.025, 7500, seed=6), wet=(0.36, 0.25, 0.22))


# ====================================================================== 7 LACQUER
def lacquer():
    """Lantern Village: đàn tranh, sáo trúc and a touch of đàn bầu in the
    Vietnamese điệu Bắc pentatonic on C (C D F G A), 72 bpm."""
    s = Song(72, 4, 16)
    drones = [['C3', 'G3', 'C4', 'D4', 'G4'], ['F2', 'C3', 'F3', 'G3', 'C4'], ['D3', 'A3', 'D4', 'F4', 'A4'], ['G2', 'D3', 'G3', 'A3', 'D4']] * 4
    mel = ('G5/1.5 A5/.5 C6/2 A5/1 G5/1 F5/2 D5/1 F5/1 G5/1 A5/1 G5/4 '
           'C6/1.5 D6/.5 C6/1 A5/1 G5/1 A5/1 F5/2 D5/1.5 F5/.5 D5/1 C5/1 D5/4 '
           'F5/1.5 G5/.5 A5/2 C6/2 D6/1 C6/1 A5/1 G5/1 F5/1 G5/1 A5/4 '
           'G5/1 F5/1 D5/2 F5/1 G5/1 A5/1 C6/1 A5/1.5 G5/.5 F5/1 D5/1 C5/3 r/1')
    scale = [nm(x) for x in 'C5 D5 F5 G5 A5 C6 D6 F6'.split()]
    for beat, d, m in parse(mel):
        if m is None: continue
        t0 = beat * s.spb
        # láy: a quick upper-neighbour grace note before long notes
        if d >= 2:
            up = min([x for x in scale if x > m] or [m + 2])
            s.calm.add(flute(up, 0.07, 0.4, vib=0, breath=0.05), t0 - 0.09, 0.8, 0.2)
        s.calm.add(flute(m, d * s.spb * 0.95, 0.65, vib=0.35, scoop=0.3 if d >= 2 else 0, breath=0.09, bright=0.7), t0 + s.human(0.01), 1.0, 0.2)
    # đàn bầu answers in bars 8-11 with a slow glide
    for b, (m, d, bend) in enumerate([('G4', 3, [(0, 0), (0.6, 0), (1.0, 2), (2.2, 2)]), ('A4', 3, [(0, 0), (1.0, 0), (1.6, -2), (2.6, -2)]),
                                       ('C5', 3, [(0, 0), (0.8, 0), (1.4, -1), (1.8, 0)]), ('D4', 3, [(0, 0), (1.2, 0), (2.0, -2), (3, -2)])]):
        s.calm.add(bau(nm(m), d * s.spb, 0.6, bend=bend), s.t(8 + b, 1), 0.8, -0.3)
    pats = [[0, 2, 3, 4, 2, 3, 1, 3], [0, None, 2, 4, 3, None, 2, 1]]
    for bar, st in enumerate(drones):
        n = [nm(x) for x in st]
        for i, idx in enumerate(pats[bar % 2]):
            if idx is None: continue
            bend = None
            if bar % 4 == 1 and i == 3:  # nhấn: press the string a whole tone up
                bend = [(0, 0), (0.15, 0), (0.35, 2), (1.5, 2)]
            vib = 0.25 if i == 7 else 0.0
            s.calm.add(tranh(n[idx], 1.6, 0.42 * float(s.rng.uniform(0.85, 1.05)), bend=bend, vib=vib), s.t(bar, i * 0.5) + s.human(0.006), 0.8, -0.4 + 0.12 * idx)
        if bar % 4 == 3:  # vê: a soft tremolo on the top string
            for r in range(10):
                s.calm.add(tranh(n[4] + 12, 0.4, 0.18), s.t(bar, 2 + r * 0.18), 0.6, 0.5)
        s.calm.add(softpad(n[0], 4 * s.spb, 0.4, att=1.5, rel=1.5, cutoff=800), s.t(bar), 0.55, 0)
        # chase: mõ eighths, a small trống cơm-like pitched drum, tranh ostinato
        for e in range(8):
            s.chase.add(woodblock(1100 if e % 2 == 0 else 1400, 0.55 if e % 4 == 0 else 0.35, 0.18, 0.025), s.t(bar, e * 0.5), 0.8, -0.35)
        for b in (0, 1.5, 2.5):
            s.chase.add(drum_low(0.45, 240, 170, 0.18, 0.15, 0.5), s.t(bar, b), 0.9, 0.2)
        arp_bar(s, s.chase, lambda m, d, v: tranh(m, 0.8, v), [n[2], n[3], n[4]], bar, [0, 2, 1, 2, 0, 2, 1, 2], vel=0.35, gain=0.7, p=0.35)
        # boss: big trống + gong-like low bell + low tranh tremolo
        for b in (0, 2, 3.5):
            s.boss.add(drum_low(0.9 if b == 0 else 0.6, 100, 62, 0.45, 0.3, 1.0), s.t(bar, b), 1.0, 0)
        if bar % 4 == 0:
            s.boss.add(bell(nm('C3'), 5.0, 0.6, 0.4), s.t(bar), 0.8, -0.1)
        for r in range(8):
            s.boss.add(tranh(n[0] - 12 if n[0] > 45 else n[0], 0.4, 0.3), s.t(bar, 1 + r * 0.125), 0.6, -0.2)
    return finish(s, 'lacquer', make_ir(2.8, 3.2, 0.02, 7000, seed=7), wet=(0.32, 0.22, 0.2))


WORLDS = {'meadow': meadow, 'starry': starry, 'fresco': fresco, 'ukiyo': ukiyo, 'lilies': lilies, 'gilded': gilded, 'lacquer': lacquer}

if __name__ == '__main__':
    names = sys.argv[1:] or list(WORLDS)
    for n in names:
        WORLDS[n]()
