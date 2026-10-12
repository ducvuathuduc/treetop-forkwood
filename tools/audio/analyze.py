"""Objective checks for the rendered music (we cannot listen, so we measure).

For each world: loudness of each intensity mix, true-ish peak, spectral centroid,
share of energy above 5 kHz (harshness proxy), low-end share below 60 Hz (mud),
stereo correlation, DC, loop seam continuity (jump across the seam versus the
99.9th percentile of jumps inside the file), plus a spectrogram PNG.
"""
import sys, os, json
import numpy as np
import soundfile as sf
from synth import lufs, SR
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), 'out')


def band_share(x, lo, hi):
    X = np.abs(np.fft.rfft(x[: SR * 30]))
    f = np.fft.rfftfreq(min(len(x), SR * 30), 1 / SR)
    tot = np.sum(X ** 2) + 1e-12
    return float(np.sum(X[(f >= lo) & (f < hi)] ** 2) / tot)


def centroid(x):
    X = np.abs(np.fft.rfft(x[: SR * 30]))
    f = np.fft.rfftfreq(min(len(x), SR * 30), 1 / SR)
    return float(np.sum(f * X) / (np.sum(X) + 1e-12))


def analyse(world, src=None):
    st = {k: sf.read(os.path.join(src or OUT, f'{world}-{k}.wav'))[0].T for k in ('calm', 'chase', 'boss')}
    mixes = {'calm': st['calm'], 'chase': st['calm'] + st['chase'], 'boss': st['calm'] + st['chase'] + st['boss']}
    rep = {}
    fig, axes = plt.subplots(3, 1, figsize=(12, 8), sharex=True)
    for ax, (k, x) in zip(axes, mixes.items()):
        mono = x.mean(0)
        d = np.abs(np.diff(x, axis=1))
        inner = float(np.percentile(d, 99.9))
        seam = float(np.max(np.abs(x[:, 0] - x[:, -1])))
        rep[k] = {
            'lufs': round(lufs(x), 2),
            'peak_dbfs': round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 2),
            'centroid_hz': round(centroid(mono)),
            'share_above_5k': round(band_share(mono, 5000, 24000), 4),
            'share_below_60': round(band_share(mono, 0, 60), 4),
            'stereo_corr': round(float(np.corrcoef(x[0], x[1])[0, 1]), 3),
            'dc': round(float(np.mean(mono)), 6),
            'seam_jump_vs_p999': round(seam / (inner + 1e-12), 2),
        }
        ax.specgram(mono, NFFT=2048, Fs=SR, noverlap=1024, cmap='magma', vmin=-140, vmax=-30)
        ax.set_ylim(0, 12000)
        ax.set_ylabel(f'{k} Hz')
    axes[0].set_title(f'{world}: calm / +chase / +boss')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, f'spec-{world}.png'), dpi=60)
    plt.close()
    return rep


if __name__ == '__main__':
    worlds = sys.argv[1:] or ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer']
    allr = {w: analyse(w) for w in worlds}
    json.dump(allr, open(os.path.join(OUT, 'analysis.json'), 'w'), indent=1)
    for w, r in allr.items():
        for k, v in r.items():
            print(w, k, v)
