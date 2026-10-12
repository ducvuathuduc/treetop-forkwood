"""Forkwood 2.0 offline synthesis kit (numpy only, all sounds made from scratch).

Every voice returns a mono float32 numpy array at SR. Instruments are additive or
modal models (no samples), so the output is entirely own-made and licence-free.
"""
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt, lfilter

SR = 48000
RNG = np.random.default_rng(1729)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_adsr(n, a, d, s, r, hold=None):
    """Linear-attack, exponential-ish decay envelope of n samples."""
    t = np.arange(n) / SR
    e = np.ones(n) * s
    a = max(a, 1e-4)
    e[t < a] = t[t < a] / a
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * ((t[m] - a) / d)
    if hold is not None:
        rel = t >= hold
        e[rel] = e[rel] * np.exp(-(t[rel] - hold) / max(r, 1e-3) * 4.6)
    return e


def lp(x, f, order=2):
    sos = butter(order, min(f, SR * 0.45) / (SR / 2), 'low', output='sos')
    return sosfilt(sos, x)


def hp(x, f, order=2):
    sos = butter(order, f / (SR / 2), 'high', output='sos')
    return sosfilt(sos, x)


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band', output='sos')
    return sosfilt(sos, x)


def noise(n, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    return r.standard_normal(n)


def fade(x, fi=0.002, fo=0.01):
    x = x.copy()
    a, b = int(fi * SR), int(fo * SR)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    return x


def freq_track(f, n, vib=0.0, vib_rate=5.0, vib_delay=0.3, bend=None, scoop=0.0, scoop_t=0.08):
    """Instantaneous frequency array: vibrato after a delay, optional pitch bend
    (list of (time, semitones)), and an initial scoop from below (semitones)."""
    t = np.arange(n) / SR
    semis = np.zeros(n)
    if scoop:
        semis += -scoop * np.exp(-t / scoop_t)
    if bend:
        bt = [b[0] for b in bend]
        bv = [b[1] for b in bend]
        semis += np.interp(t, bt, bv)
    if vib:
        ramp = np.clip((t - vib_delay) / 0.4, 0, 1)
        semis += vib * ramp * np.sin(2 * np.pi * vib_rate * t + RNG.uniform(0, 6))
    return f * 2 ** (semis / 12)


def osc_phase(freq):
    return 2 * np.pi * np.cumsum(freq) / SR


# ------------------------------------------------------------------ instruments

def piano(m, dur, vel=0.7, bright=1.0):
    """Additive piano: inharmonic partials, two detuned strings each, partial-
    dependent decay, felt-hammer thump, damper release at `dur`."""
    f = mtof(m)
    tail = 1.2 + 2.5 * (1 - min(1, (m - 40) / 50))
    n = int((dur + 0.35) * SR) if dur < tail else int(tail * SR)
    n = max(n, int(0.3 * SR))
    t = np.arange(n) / SR
    B = 0.00018 * 2 ** ((m - 60) / 24)
    out = np.zeros(n)
    npart = int(min(14, 9000 / f))
    for k in range(1, npart + 1):
        fk = f * k * np.sqrt(1 + B * k * k)
        amp = (vel ** (0.6 + 0.25 * k / bright)) / (k ** 1.15) * np.sin(np.pi * k * 0.12) / np.sin(np.pi * 0.12)
        dec = (0.9 + 2.2 * (1 - min(1, (m - 30) / 70))) / (1 + 0.35 * (k - 1) * (1.3 - 0.3 * bright))
        det = 1 + 0.0006 * RNG.uniform(0.4, 1)
        ph = RNG.uniform(0, 6.28)
        p = np.sin(2 * np.pi * fk * t + ph) + 0.7 * np.sin(2 * np.pi * fk * det * t + ph)
        # two-stage decay (prompt + aftersound)
        e = 0.55 * np.exp(-t / (dec * 0.35)) + 0.45 * np.exp(-t / (dec * 2.2))
        out += amp * p * e
    thump = lp(noise(n), 900 + 1500 * vel) * np.exp(-t / 0.012) * 0.25 * vel
    out = out / 2.2 + thump
    if dur < t[-1]:
        rel = t > dur
        out[rel] *= np.exp(-(t[rel] - dur) / 0.09)
    out *= np.minimum(1, t / 0.002)
    return fade(out, 0, 0.02) * 0.5


def pluck(m, dur, vel=0.7, pos=0.18, decay=2.0, bright=1.0, bend=None, vib=0.0, vib_rate=5.5,
          vib_delay=0.25, npart=16, inharm=0.0002, body=None):
    """Additive plucked string with a shared pitch track (so bends and vibrato
    work): koto, đàn tranh, harp, pizzicato, kalimba-ish."""
    f = mtof(m)
    n = int(max(dur, 0.2) * SR)
    t = np.arange(n) / SR
    ftr = freq_track(f, n, vib=vib, vib_rate=vib_rate, vib_delay=vib_delay, bend=bend)
    ph = osc_phase(ftr)
    out = np.zeros(n)
    npart = int(min(npart, 10000 / f))
    for k in range(1, npart + 1):
        a = abs(np.sin(np.pi * k * pos)) / k ** (1.6 - 0.4 * bright) * vel ** (0.3 * k / 4)
        tau = decay / (1 + 0.55 * (k - 1) / bright)
        out += a * np.sin(ph * k * np.sqrt(1 + inharm * k * k)) * np.exp(-t / tau)
    out += lp(noise(n), 2500 * bright) * np.exp(-t / 0.004) * 0.15 * vel
    if body:
        out = out + 0.4 * bp(out, *body)
    out *= np.minimum(1, t / 0.0015)
    return fade(out, 0, 0.03) * 0.35


def harp(m, dur, vel=0.6):
    return pluck(m, max(dur, 2.5), vel, pos=0.5, decay=2.6 - (m - 50) / 60, bright=0.8, npart=10, inharm=0.00005)


def pizz(m, dur, vel=0.6):
    return pluck(m, 0.6, vel, pos=0.25, decay=0.25, bright=0.7, npart=10, body=(250, 1200))


def koto(m, dur, vel=0.7, bend=None, vib=0.0):
    return pluck(m, max(dur, 1.6), vel, pos=0.11, decay=1.5, bright=1.25, bend=bend, vib=vib, vib_rate=5.0,
                 npart=18, inharm=0.0004, body=(400, 3000))


def tranh(m, dur, vel=0.7, bend=None, vib=0.0):
    """đàn tranh: bright steel strings, nhấn (press bends) and rung (vibrato)."""
    return pluck(m, max(dur, 1.8), vel, pos=0.09, decay=1.8, bright=1.4, bend=bend, vib=vib, vib_rate=6.0,
                 vib_delay=0.18, npart=20, inharm=0.0003, body=(600, 4000))


def bau(m, dur, vel=0.6, bend=None):
    """đàn bầu-like: a single harmonic tone (pure, flute-like overtone) with a
    wide expressive glide. Mostly fundamental + weak 2nd/3rd."""
    f = mtof(m)
    n = int(max(dur, 0.4) * SR)
    t = np.arange(n) / SR
    ftr = freq_track(f, n, vib=0.35, vib_rate=5.2, vib_delay=0.25, bend=bend)
    ph = osc_phase(ftr)
    out = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    e = np.exp(-t / (dur * 0.9 + 0.3)) * np.minimum(1, t / 0.006)
    return fade(out * e, 0, 0.05) * 0.25 * vel


def celesta(m, dur, vel=0.6):
    f = mtof(m)
    n = int(max(1.4, dur + 0.8) * SR)
    t = np.arange(n) / SR
    idx = 1.4 * vel * np.exp(-t / 0.05)
    car = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 4 * f * t))
    car += 0.25 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.25)
    e = np.exp(-t / 0.9) * np.minimum(1, t / 0.001)
    return fade(car * e, 0, 0.02) * 0.22 * vel


def musicbox(m, dur, vel=0.6):
    f = mtof(m)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.8) + 0.3 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.15)
    out += 0.12 * np.sin(2 * np.pi * f * 5.43 * t) * np.exp(-t / 0.06)
    return fade(out * np.minimum(1, t / 0.0008), 0, 0.02) * 0.2 * vel


def bell(m, dur=3.0, vel=0.6, bright=1.0):
    """Tubular/handbell modal set (hum, prime, tierce, quint, nominal)."""
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    ratios = [0.5, 1.0, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166]
    amps = [0.35, 1, 0.45, 0.25, 0.6, 0.18, 0.2, 0.12, 0.06]
    out = np.zeros(n)
    for r, a in zip(ratios, amps):
        if f * r > 16000: continue
        tau = dur * 0.5 / (r ** 0.7) * (1 if r != 0.5 else 1.6)
        out += a * (bright if r > 2 else 1) * np.sin(2 * np.pi * f * r * t + RNG.uniform(0, 6)) * np.exp(-t / tau)
    out *= np.minimum(1, t / 0.0015)
    return fade(out, 0, 0.05) * 0.15 * vel


def glock(m, dur=1.5, vel=0.6):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.18) \
        + 0.12 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / 0.07)
    return fade(out * np.minimum(1, t / 0.0008), 0, 0.03) * 0.18 * vel


def kalimba(m, dur=1.0, vel=0.6):
    f = mtof(m)
    n = int(max(dur, 0.9) * SR)
    t = np.arange(n) / SR
    idx = 2.0 * np.exp(-t / 0.03)
    out = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3 * f * t)) * np.exp(-t / 0.55)
    out += 0.15 * np.sin(2 * np.pi * f * 6.2 * t) * np.exp(-t / 0.02)
    return fade(out * np.minimum(1, t / 0.0008), 0, 0.03) * 0.22 * vel


def additive_saw(ftr, nh=24, rolloff=1.0, maxf=9000):
    ph = osc_phase(ftr)
    f0 = float(np.mean(ftr))
    out = np.zeros(len(ftr))
    for k in range(1, nh + 1):
        if f0 * k > maxf: break
        out += np.sin(k * ph) / k ** rolloff
    return out


def strings(m, dur, vel=0.5, att=0.5, rel=0.9, voices=3, cutoff=3200, vib=0.12):
    """Ensemble pad: detuned band-limited saws with vibrato, soft attack."""
    f = mtof(m)
    n = int((dur + rel) * SR)
    out = np.zeros(n)
    for v in range(voices):
        det = 2 ** ((v - (voices - 1) / 2) * 0.09 / 12)
        ftr = freq_track(f * det, n, vib=vib, vib_rate=4.6 + v * 0.37, vib_delay=0.15)
        out += additive_saw(ftr, 22, 1.15, cutoff * 1.5)
    out = lp(out, cutoff)
    e = env_adsr(n, att, 0.3, 0.85, rel, hold=dur)
    return fade(out * e, 0, 0.05) * 0.06 * vel


def formant_voice(ftr, vowel='ah', breath=0.05):
    F = {'ah': [(700, 110, 1), (1220, 120, 0.5), (2600, 160, 0.25)],
         'oo': [(300, 60, 1), (870, 90, 0.35), (2240, 120, 0.1)],
         'oh': [(450, 80, 1), (800, 90, 0.6), (2830, 140, 0.15)],
         'ee': [(270, 60, 1), (2290, 160, 0.4), (3010, 200, 0.25)]}[vowel]
    ph = osc_phase(ftr)
    f0 = float(np.mean(ftr))
    out = np.zeros(len(ftr))
    for k in range(1, int(5000 / f0)):
        hk = k * f0
        a = sum(g * np.exp(-0.5 * ((hk - fc) / bw) ** 2) for fc, bw, g in F) + 0.02
        out += a * np.sin(k * ph) / np.sqrt(k)
    return out


def choir(m, dur, vel=0.5, vowel='ah', att=0.7, rel=1.2, voices=4):
    f = mtof(m)
    n = int((dur + rel) * SR)
    out = np.zeros(n)
    for v in range(voices):
        det = 2 ** (RNG.uniform(-0.12, 0.12) / 12)
        ftr = freq_track(f * det, n, vib=0.18, vib_rate=4.8 + RNG.uniform(-0.6, 0.6), vib_delay=0.3)
        out += formant_voice(ftr, vowel)
    out += 0.02 * bp(noise(n), 1500, 6000)  # breath
    e = env_adsr(n, att, 0.4, 0.9, rel, hold=dur)
    return fade(out * e, 0, 0.05) * 0.05 * vel


def organ(m, dur, vel=0.5, stops=(0.6, 1.0, 0.5, 0.25, 0.15), att=0.08, rel=0.4):
    """Soft flue-pipe organ: 16', 8', 4', 2 2/3', 2' with a chiff."""
    f = mtof(m)
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    ratios = [0.5, 1, 2, 3, 4]
    out = np.zeros(n)
    for r, a in zip(ratios, stops):
        if f * r > 12000: continue
        out += a * (np.sin(2 * np.pi * f * r * t) + 0.08 * np.sin(2 * np.pi * f * r * 2 * t))
    out += 0.08 * bp(noise(n), f * 2, f * 6) * np.exp(-t / 0.05)  # chiff
    out *= 1 + 0.03 * np.sin(2 * np.pi * 5.5 * t)
    e = env_adsr(n, att, 0.1, 1.0, rel, hold=dur)
    return fade(out * e, 0, 0.05) * 0.05 * vel


def flute(m, dur, vel=0.6, vib=0.25, scoop=0.0, breath=0.08, bend=None, bright=0.5):
    """Breathy end-blown flute (shakuhachi / sáo trúc flavour)."""
    f = mtof(m)
    rel = 0.25
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    ftr = freq_track(f, n, vib=vib, vib_rate=5.2, vib_delay=0.35, scoop=scoop, scoop_t=0.07, bend=bend)
    ph = osc_phase(ftr)
    tone = np.sin(ph) + 0.25 * bright * np.sin(2 * ph) + 0.08 * bright * np.sin(3 * ph)
    br = bp(noise(n), f * 0.8, f * 4.5) * breath * 3
    e = env_adsr(n, 0.07, 0.15, 0.85, rel, hold=dur)
    puff = bp(noise(n), 800, 5000) * np.exp(-t / 0.04) * 0.3 * breath * 4
    swell = 1 + 0.12 * np.sin(np.pi * np.clip(t / max(dur, 0.1), 0, 1))
    return fade((tone + br) * e * swell + puff, 0, 0.04) * 0.18 * vel


def softpad(m, dur, vel=0.5, att=1.2, rel=1.5, cutoff=1400):
    """Warm sine/triangle pad for drones."""
    f = mtof(m)
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-0.07, 0, 0.07):
        fr = f * 2 ** (d / 12)
        out += np.sin(2 * np.pi * fr * t) + 0.3 * np.sin(4 * np.pi * fr * t) + 0.1 * np.sin(6 * np.pi * fr * t)
    out = lp(out, cutoff)
    e = env_adsr(n, att, 0.5, 0.9, rel, hold=dur)
    return fade(out * e, 0, 0.05) * 0.05 * vel


def hornpad(m, dur, vel=0.5, att=0.35, rel=0.7):
    f = mtof(m)
    n = int((dur + rel) * SR)
    ftr = freq_track(f, n, vib=0.06, vib_rate=4.5)
    out = additive_saw(ftr, 14, 1.6, 2500)
    t = np.arange(n) / SR
    e = env_adsr(n, att, 0.3, 0.8, rel, hold=dur)
    out = lp(out, 900 + 700 * vel)
    return fade(out * e, 0, 0.05) * 0.06 * vel


# ------------------------------------------------------------------ percussion

def drum_low(vel=0.6, f0=110, f1=52, dec=0.45, skin=0.25, dur=0.9):
    """Frame drum / taiko / timpani-ish: pitch-dropping sine + skin noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f1 + (f0 - f1) * np.exp(-t / 0.04)
    body = np.sin(osc_phase(fr)) * np.exp(-t / dec)
    sk = lp(noise(n), 1800) * np.exp(-t / 0.03) * skin
    return fade((body + sk) * np.minimum(1, t / 0.001), 0, 0.02) * 0.6 * vel


def timpani(m, vel=0.5, dur=2.0):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, a, tau in [(1, 1, 0.9), (1.5, 0.5, 0.6), (1.98, 0.35, 0.45), (2.44, 0.2, 0.3)]:
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau)
    out += lp(noise(n), 1200) * np.exp(-t / 0.02) * 0.4
    return fade(out * np.minimum(1, t / 0.001), 0, 0.05) * 0.35 * vel


def shaker(vel=0.4, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bp(noise(n), 4500, 10000) * (np.minimum(1, t / 0.012)) * np.exp(-t / 0.025)
    return fade(x, 0, 0.01) * 0.05 * vel


def woodblock(f=900, vel=0.5, dur=0.25, q=0.03):
    """Mõ / woodblock / hyōshigi: two damped modes and a click."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / q) + 0.5 * np.sin(2 * np.pi * f * 2.3 * t) * np.exp(-t / (q * 0.6))
    x += hp(noise(n), 2000) * np.exp(-t / 0.002) * 0.4
    return fade(x, 0, 0.01) * 0.4 * vel


def triangle_inst(vel=0.4, dur=2.0, f=2400):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * r * t + RNG.uniform(0, 6)) * np.exp(-t / (1.2 / r))
            for r, a in [(1, 1), (2.32, 0.6), (3.7, 0.4), (5.1, 0.25)])
    return fade(x * np.minimum(1, t / 0.0005), 0, 0.05) * 0.05 * vel


def brush(vel=0.4, dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bp(noise(n), 2500, 8000) * np.minimum(1, t / 0.06) * np.exp(-t / 0.1)
    return fade(x, 0, 0.02) * 0.05 * vel


# ------------------------------------------------------------------ space

def make_ir(sec=3.0, decay=3.5, predelay=0.02, damp=6000, seed=7, early=True):
    n = int(sec * SR)
    r = np.random.default_rng(seed)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        x = r.standard_normal(n) * np.exp(-t * decay / sec * 2.3)
        # high frequencies die faster: blend a dark copy in over time
        dark = lp(x, damp * 0.35)
        w = np.clip(t / sec * 1.8, 0, 1)
        x = (1 - w) * lp(x, damp) + w * dark
        if early:
            for k in range(8):
                d = int(r.uniform(0.005, 0.07) * SR)
                ir[ch, d] += r.uniform(-0.6, 0.6)
        pd = int(predelay * SR)
        ir[ch, pd:] += x[:n - pd] * 0.4
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    return ir


def reverb(stereo, ir, wet=0.3):
    out = np.zeros((2, stereo.shape[1] + ir.shape[1] - 1))
    for ch in range(2):
        out[ch] = fftconvolve(stereo[ch], ir[ch])
    dry = np.zeros_like(out)
    dry[:, :stereo.shape[1]] = stereo
    return dry * (1 - wet * 0.5) + out * wet


def pan(x, p):
    """Equal-power pan, p in -1..1 → (2, n)."""
    a = (p + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])


class Track:
    """A stereo canvas you drop notes onto by time."""

    def __init__(self, seconds, loop_n=None):
        self.buf = np.zeros((2, int(seconds * SR) + 1))
        self.loop_n = loop_n

    def add(self, x, t, gain=1.0, p=0.0):
        i = int(round(t * SR))
        if i < 0:  # an anticipation before the downbeat wraps to the loop end
            i = (self.loop_n or 0) + i
            if i < 0: i = 0
        if i >= self.buf.shape[1]: return
        st = pan(x * gain, p)
        j = min(self.buf.shape[1], i + st.shape[1])
        self.buf[:, i:j] += st[:, :j - i]


def loopify(stereo, loop_n):
    """Fold everything that rings past the loop end back onto the start, so the
    file loops with no click and no reverb gap."""
    out = stereo[:, :loop_n].copy()
    tail = stereo[:, loop_n:]
    k = 0
    while tail.shape[1] > 0:
        seg = tail[:, :loop_n]
        out[:, :seg.shape[1]] += seg
        tail = tail[:, loop_n:]
        k += 1
    return out


def k_weight(x):
    """ITU-R BS.1770 K-weighting (approximate biquads at 48 kHz)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x))


def lufs(stereo):
    """Integrated loudness (BS.1770 gated) for (2,n) or mono arrays."""
    x = np.atleast_2d(stereo)
    kw = np.vstack([k_weight(c) for c in x])
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if kw.shape[1] < blk:
        ms = np.mean(kw ** 2, axis=1).sum()
        return -0.691 + 10 * np.log10(ms + 1e-12)
    zs = []
    for i in range(0, kw.shape[1] - blk + 1, hop):
        zs.append(np.mean(kw[:, i:i + blk] ** 2, axis=1).sum())
    zs = np.array(zs)
    l = -0.691 + 10 * np.log10(zs + 1e-12)
    zs = zs[l > -70]
    if len(zs) == 0: return -70.0
    rel = -0.691 + 10 * np.log10(zs.mean()) - 10
    l = -0.691 + 10 * np.log10(zs + 1e-12)
    zs = zs[l > rel]
    return -0.691 + 10 * np.log10(zs.mean())


def soft_limit(x, ceiling=0.89):
    """Gentle tanh-knee limiter above 70% of the ceiling."""
    k = ceiling * 0.7
    y = x.copy()
    m = np.abs(y) > k
    y[m] = np.sign(y[m]) * (k + (ceiling - k) * np.tanh((np.abs(y[m]) - k) / (ceiling - k)))
    return y
