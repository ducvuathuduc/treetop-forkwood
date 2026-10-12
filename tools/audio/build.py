"""Build every Forkwood 2.0 audio asset from source.

  python3 build.py sfx      render + loudness-normalise + pack the SFX sprites
  python3 build.py music    encode the rendered music stems (run music.py first)
  python3 build.py docs     regenerate work/v2/SOUNDS.md from the catalogue
  python3 build.py all

Outputs (relative to the repo root):
  assets/v2/common/audio/audio.json           manifest read by src/audio.js
  assets/v2/common/audio/sfx-ui.{ogg,m4a}     menus, rewards, currency, rings
  assets/v2/common/audio/sfx-play.{ogg,m4a}   core loop, pickups, rides, skills, generic traps
  assets/v2/<world>/audio/sfx-<world>.{ogg,m4a}           that world's traps + boss
  assets/v2/<world>/audio/music-<world>-<stem>.{ogg,m4a}  calm / chase / boss stems
"""
import os, sys, json, subprocess, hashlib
import numpy as np
import soundfile as sf
from synth import SR, lp, k_weight, soft_limit, lufs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
COMMON = os.path.join(ROOT, 'assets', 'v2', 'common', 'audio')
WORLDS = ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer']
MAN = os.path.join(COMMON, 'audio.json')

# short-clip loudness targets (LUFS of the active part) per class
TARGET = {'ui': -27.0, 'feedback': -23.0, 'fx': -24.0, 'warn': -21.5, 'tell': -26.0, 'reward': -21.0}
# longest a clip may ring in the sprite; the live reverb send in audio.js adds the room tail back
MAXD = {'ui': 0.5, 'feedback': 0.8, 'fx': 1.0, 'warn': 0.6, 'tell': 0.9, 'reward': 1.6}
PRE = 0.5  # seconds of wrap-around context before and after each music loop
GAP = 0.06  # silence between sprite clips (covers AAC priming on any decoder)


def clip_loudness(x):
    kw = k_weight(x)
    env = np.abs(x)
    pk = env.max() + 1e-12
    # active region: from first to last sample above -30 dB of peak
    idx = np.where(env > pk * 0.0316)[0]
    a, b = idx[0], idx[-1] + 1
    ms = np.mean(kw[a:b] ** 2) + 1e-12
    return -0.691 + 10 * np.log10(ms)


def tidy(x, maxd=1.0):
    x = np.asarray(x, dtype=np.float64)
    x = lp(x, 12500, 2)
    env = lp(np.abs(x), 30, 1)
    pk = env.max() + 1e-12
    idx = np.where(env > pk * 0.0158)[0]  # -36 dB of the smoothed peak
    start = max(0, int(np.where(np.abs(x) > np.abs(x).max() * 0.001)[0][0]) - 24)
    end = min(len(x), idx[-1] + int(0.02 * SR), start + int(maxd * SR))
    x = x[start:end].copy()
    n = min(int(len(x) * 0.3), int(0.25 * SR))
    x[-n:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n)))
    x[: min(len(x), 48)] *= np.linspace(0, 1, min(len(x), 48))
    return x


def enc(wav, base, opus_kbps, aac_kbps, channels):
    o = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', str(channels), '-c:a', 'libopus', '-b:a', f'{opus_kbps}k',
                        '-vbr', 'constrained', '-compression_level', '10', '-application', 'audio', base + '.ogg'], capture_output=True)
    assert o.returncode == 0, o.stderr
    o = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', str(channels), '-c:a', 'aac', '-b:a', f'{aac_kbps}k',
                        '-movflags', '+faststart', base + '.m4a'], capture_output=True)
    assert o.returncode == 0, o.stderr
    return {'ogg': os.path.getsize(base + '.ogg'), 'm4a': os.path.getsize(base + '.m4a')}


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


def load_man():
    if os.path.exists(MAN):
        return json.load(open(MAN))
    return {'version': 2, 'sampleRate': SR, 'sprites': {}, 'clips': {}, 'music': {}}


def build_sfx():
    import sfx
    man = load_man()
    man['sprites'], man['clips'] = {}, {}
    groups = {}
    report = {}
    for cid, c in sfx.CATALOG.items():
        groups.setdefault(c['group'], []).append(cid)
    for g, ids in groups.items():
        pieces, t = [np.zeros(int(GAP * SR))], GAP
        for cid in ids:
            c = sfx.CATALOG[cid]
            x = tidy(c['fn'](), MAXD[c['cls']])
            l = clip_loudness(x)
            x = x * 10 ** ((TARGET[c['cls']] - l) / 20)
            x = soft_limit(x, 0.708)  # -3 dBFS ceiling
            d = len(x) / SR
            entry = {'g': g, 'o': round(t, 4), 'd': round(d, 4)}
            if c['tonal']: entry['tonal'] = 1
            if c['duck']: entry['duck'] = c['duck']
            entry['c'] = c['cls']
            man['clips'][cid] = entry
            report[cid] = {'lufs_active': round(clip_loudness(x), 1), 'peak_db': round(20 * np.log10(np.abs(x).max() + 1e-9), 1), 'dur': round(d, 3)}
            pieces += [x, np.zeros(int(GAP * SR))]
            t += d + GAP
            # keep offsets exact in samples
            t = sum(len(p) for p in pieces) / SR
        buf = np.concatenate(pieces).astype(np.float32)
        d = os.path.join(ROOT, 'assets', 'v2', g if g in WORLDS else 'common', 'audio')
        os.makedirs(d, exist_ok=True)
        base = os.path.join(d, f'sfx-{g}')
        wav = os.path.join(OUT, f'sfx-{g}.wav')
        sf.write(wav, buf, SR, subtype='FLOAT')
        kb = 28 if g == 'ui' else 24
        sizes = enc(wav, base, kb, 32, 1)
        man['sprites'][g] = {'ogg': rel(base + '.ogg'), 'm4a': rel(base + '.m4a'), 'dur': round(len(buf) / SR, 4), 'bytes': sizes,
                             'world': g if g in WORLDS else None}
        print(f'sprite {g}: {len(ids)} clips, {len(buf) / SR:.1f} s, {sizes}')
    json.dump(report, open(os.path.join(OUT, 'sfx-report.json'), 'w'), indent=1)
    write_man(man)


def build_music():
    man = load_man()
    man['music'] = {}
    for w in WORLDS:
        info = json.load(open(os.path.join(OUT, f'{w}.json')))
        d = os.path.join(ROOT, 'assets', 'v2', w, 'audio')
        os.makedirs(d, exist_ok=True)
        ent = {'loop': round(info['loopSec'], 6), 'bpm': info['bpm'], 'beatsPerBar': info['beatsPerBar'], 'bars': info['bars'],
               'lufs': info['lufs'], 'stems': {}}
        ent['loopStart'] = PRE
        ent['loopEnd'] = round(PRE + info['loopSec'], 6)
        for stem in ('calm', 'chase', 'boss'):
            x, _ = sf.read(os.path.join(OUT, f'{w}-{stem}.wav'))
            # wrap-around context: the codec sees the loop as continuous at both ends, and any
            # decoder start offset (AAC priming) still lands on identical periodic content
            p = int(PRE * SR)
            xw = np.concatenate([x[-p:], x, x[:p]])
            wav = os.path.join(OUT, f'{w}-{stem}-wrapped.wav')
            sf.write(wav, xw.astype(np.float32), SR, subtype='FLOAT')
            base = os.path.join(d, f'music-{w}-{stem}')
            if stem == 'calm':
                # fit ≤ 240 KB at default quality whatever the loop length
                kbps = min(36, int(232_000 * 8 / (info['loopSec'] + 2 * PRE) / 1000))
                sizes = enc(wav, base, kbps, int(205_000 * 8 / (info["loopSec"] + 2 * PRE) / 1000), 2)
            else:
                sizes = enc(wav, base, 20, 24, 1)
            ent['stems'][stem] = {'ogg': rel(base + '.ogg'), 'm4a': rel(base + '.m4a'), 'bytes': sizes}
        man['music'][w] = ent
        print(w, {k: v['bytes'] for k, v in ent['stems'].items()})
    write_man(man)


def write_man(man):
    os.makedirs(COMMON, exist_ok=True)
    with open(MAN, 'w') as f:
        json.dump(man, f, separators=(',', ':'))


def docs():
    import sfx
    from collections import OrderedDict
    man = load_man()
    L = []
    L.append('# Forkwood 2.0 sound ids (AUDIO stream)\n')
    L.append('Generated by `tools/audio/build.py docs` from the catalogue in `tools/audio/sfx.py`; edit there, not here.\n')
    L.append('API (src/audio.js): `sound.play(id, {rate, vol, pan, step})`, `sound.music(worldId)`, `sound.duck(amount, sec)`, '
             '`sound.setIntensity("calm"|"chase"|"boss")`, `sound.prepare(level)`, `sound.onEvents(sim.events)`, `sound.setVolume(bus, v)`, `sound.setMuted(m)`. '
             'Unknown ids never throw; they fall back to a soft synth blip.\n')
    L.append('Every cue is synthesised from scratch by our own code (no samples, no third-party audio). Shared tonal cues are written in C and '
             'retuned at runtime to the key of the current world\'s music (column *tonal*). *duck* = how far the music dips under the cue. '
             '*class* sets the loudness target: ui −27, fx −24, feedback −23, warn −21.5, reward −21 LUFS (active part).\n')
    titles = OrderedDict([('ui', 'Shared: menus, rewards, currency, Growth Rings (sprite `sfx-ui`, loads on idle)'),
                          ('play', 'Shared: core loop, pickups, rides, skills, telegraphs, set pieces (sprite `sfx-play`, loads on idle)'),
                          ('traps', 'Shared generic traps and hazards from v1/v12 (sprite `sfx-traps`, loads on the first trapWarn that needs it)')])
    for w in WORLDS:
        titles[w] = f'World `{w}`: signature traps and boss (sprite `sfx-{w}`, loads with the world)'
    for g, title in titles.items():
        ids = [k for k, c in sfx.CATALOG.items() if c['group'] == g]
        L.append(f'\n## {title}\n')
        L.append(f'{len(ids)} cues.\n')
        L.append('| id | what it is | class | tonal | duck | dur s |')
        L.append('|---|---|---|---|---|---|')
        for k in ids:
            c = sfx.CATALOG[k]
            m = man['clips'].get(k, {})
            L.append(f"| `{k}` | {c['desc']} | {c['cls']} | {'yes' if c['tonal'] else ''} | {c['duck'] or ''} | {m.get('d', '')} |")
    L.append('\n## World trap ids (proposed for MECH)\n')
    L.append('Each world trap has a `.tell` (plays with the shared `trap.warn` when the telegraph starts) and a `.fire` (the trap acts). '
             'The cue names are AUDIO\'s; MECH\'s world traps (skin `<world>.trap.<name>`) are mapped to them in `TRAP_ALIAS` in '
             'src/audio-mixer.js (e.g. `meadow.bees` → `meadow.trap.wasp.*`). A world trap without a signature cue plays the generic cue of its '
             'mechanic (`GENERIC_TRAP`), and every trap always gets the shared `trap.warn`.\n')
    for w in WORLDS:
        ts = sorted({k.split('.')[2] for k in sfx.CATALOG if k.startswith(f'{w}.trap.')})
        L.append(f'- **{w}**: ' + ', '.join(f'`{t}`' for t in ts))
    L.append('\n## Boss cue convention\n')
    L.append('`<world>.boss.enter` on entrance, `boss.windup` (shared warning family) on every attack telegraph, then `<world>.boss.a1` '
             '(sweep/lane attack), `.a2` (slam/stomp), `.a3` (volley); `.hurt` when foiled; `.defeat` at the end (plus `setpiece.clear`). '
             'MECH\'s events map automatically: boss `trapWarn` (`trap: "boss:<id>:<kind>"`) → `boss.windup`; `boss.attack {boss, attack}` → a1 for sweep, '
             'a2 for dive/dive2/grab/plates, a3 for volley/orbs/coins/ring (`ATTACK_SLOT`); `boss.foil` → `.hurt`; `boss.phase` (phase > 0) → a softer `.enter`; '
             'the world comes from the boss id (`BOSS_WORLD`: giant meadow, crowking starry, gargoyle fresco, kitsune ukiyo, heron lilies, stag gilded, dragon lacquer).\n')
    L.append('\n## Music\n')
    L.append('`sound.music(worldId)` lazy-loads that world\'s calm stem (≤ 240 KB) and starts it; chase and boss stems (mono, ~130 KB each) '
             'load in the background after that and cross-fade in on `setIntensity` / `setpiece.start`. All stems are sample-locked loops of the same length.\n')
    L.append('| world | idiom | tempo | loop s | calm KB (ogg / m4a) |')
    L.append('|---|---|---|---|---|')
    idiom = {'meadow': 'anime-film piano + strings, D major, IV–V–iii–vi', 'starry': 'dreamy celesta waltz (3/4), Eb, harp oom-pah-pah',
             'fresco': 'choir pad + soft flue organ, A Aeolian, bells', 'ukiyo': 'koto + end-blown flute, D miyako-bushi (in) scale',
             'lilies': 'impressionist solo piano, Db Lydian, planed ninths', 'gilded': 'art-nouveau harp + flute + strings, E major, borrowed iv',
             'lacquer': 'đàn tranh + sáo trúc + đàn bầu, C điệu Bắc pentatonic'}
    for w in WORLDS:
        m = man['music'].get(w)
        if not m: continue
        b = m['stems']['calm']['bytes']
        L.append(f"| {w} | {idiom[w]} | {m['bpm']} bpm {m['beatsPerBar']}/4 | {m['loop']:.1f} | {b['ogg'] // 1024} / {b['m4a'] // 1024} |")
    L.append('\n## Sim event → sound (`handleEvent` in src/audio-mixer.js)\n')
    L.append('See the table in AUDIO-REPORT.md; `onEvents()` handles the v2 ids by default and the v1 ids too when called with `{all: true}`.\n')
    p = os.path.join(ROOT, '..', 'SOUNDS.md')
    open(p, 'w').write('\n'.join(L) + '\n')
    print('wrote', os.path.abspath(p), len(sfx.CATALOG), 'cues')


if __name__ == '__main__':
    what = sys.argv[1:] or ['all']
    if 'sfx' in what or 'all' in what: build_sfx()
    if 'music' in what or 'all' in what: build_music()
    if 'docs' in what or 'all' in what: docs()
