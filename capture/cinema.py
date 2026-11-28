#!/usr/bin/env python3
"""
Cinematic cut of the capture: python capture/cinema.py <outDir>
Reads <outDir>/frames.ffconcat and <outDir>/cues.json (written by capture.spec.ts) and makes
<outDir>/GapMap_Demo.mp4: 1080p60, light grade, slow push-ins, and an original synthesized score with
sound effects placed on the logged clicks, keystrokes, captions and section changes.

Sound design uses L-cuts: each section's music carries on past the visual cut into the next shot, and the
transition whoosh starts just before the cut, so sound leads and trails the picture instead of jumping with it.
Everything is generated here (numpy), so there are no third-party audio files or licences.
Needs: numpy, scipy, ffmpeg on PATH (or FFMPEG=path).
"""
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "capture/out")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
SR = 48_000
PRE = 1.6  # black pre-roll with a riser before the title
TAIL = 2.4  # black after the end card while the last chord rings out
FPS = 60
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- timeline
concat = os.path.join(OUT, "frames.ffconcat")
durs = [float(l.split()[1]) for l in open(concat, encoding="utf8") if l.startswith("duration")]
CONTENT = sum(durs)
TOTAL = PRE + CONTENT + TAIL
cues = json.load(open(os.path.join(OUT, "cues.json"), encoding="utf8"))
for c in cues:
    c["t"] = max(0.0, c["t"]) + PRE

clicks = [c["t"] for c in cues if c["kind"] == "click"]


def cut_before(t):
    """The visual cut for a section caption: the page changes just after the last click before it."""
    prev = [x for x in clicks if x <= t]
    return (prev[-1] + 0.35) if prev and t - prev[-1] < 2.5 else t - 0.4


sections = [cut_before(c["t"]) for c in cues if c["kind"] == "section"]
end_card = next(c["t"] for c in reversed(cues) if c["kind"] == "card")
bounds = [PRE] + sections + [end_card, TOTAL]
print(f"content {CONTENT:.1f}s, total {TOTAL:.1f}s, sections at {[round(b, 1) for b in sections]}, end card {end_card:.1f}s")

N = int(TOTAL * SR)
tt = np.arange(N) / SR


def buf():
    return np.zeros((N, 2), np.float32)


def place(dst, sig, t, gain=1.0, pan=0.0):
    """Adds a mono or stereo signal at time t (seconds) with constant-power pan."""
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], 1)
    a, b = max(0, i), min(N, i + len(sig))
    dst[a:b] += sig[a - i : b - i] * gain


def env(n, a, d, curve=4.0):
    """Attack then exponential-ish decay envelope, n samples."""
    x = np.arange(n) / SR
    e = np.where(x < a, x / max(a, 1e-4), np.exp(-(x - a) * curve / max(d, 1e-4)))
    return e.astype(np.float32)


def bp(sig, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), sig).astype(np.float32)


def lp(sig, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), sig, axis=0).astype(np.float32)


def hp(sig, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), sig, axis=0).astype(np.float32)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- score: Bm – G – D – A at 84 bpm
BPM = 84
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORDS = [  # (bass midi, chord tones midi)
    (35, [59, 62, 66, 71]),  # Bm
    (31, [59, 62, 67, 71]),  # G
    (38, [62, 66, 69, 74]),  # D
    (33, [61, 64, 69, 73]),  # A
]

# Layer levels per section (pad, arp, bass, pulse, shimmer); the last row is the end card.
LEVELS = [
    (0.75, 0.25, 0.0, 0.0, 0.35),  # website
    (0.70, 0.55, 0.55, 0.0, 0.20),  # 1 lecturer
    (0.65, 0.65, 0.65, 0.40, 0.20),  # 2 review
    (0.65, 0.70, 0.65, 0.45, 0.45),  # 3 fix chains
    (0.60, 0.80, 0.75, 0.70, 0.30),  # 4 student
    (0.60, 0.95, 0.85, 0.95, 0.55),  # 5 fix it
    (0.65, 1.00, 0.90, 1.00, 0.60),  # 6 class
    (0.90, 0.00, 0.40, 0.00, 0.80),  # end card
]
L_DELAY, L_FADE = 0.6, 1.8  # L-cut: the outgoing texture keeps playing 0.6 s past the cut, then crossfades


def layer_gain(k):
    g = np.full(N, LEVELS[0][k], np.float32)
    for i, b in enumerate(bounds[1:-1], start=1):
        lvl_prev, lvl = LEVELS[min(i - 1, len(LEVELS) - 1)][k], LEVELS[min(i, len(LEVELS) - 1)][k]
        x = np.clip((tt - (b + L_DELAY)) / L_FADE, 0, 1)
        x = x * x * (3 - 2 * x)
        g = np.where(tt >= b + L_DELAY, lvl_prev + (lvl - lvl_prev) * x, g).astype(np.float32)
    fade_in = np.clip((tt - 0.2) / 2.0, 0, 1)
    fade_out = np.clip((TOTAL - tt) / 2.2, 0, 1)
    return g * fade_in * fade_out


def saw(f, n, harmonics=10):
    x = np.arange(n) / SR
    s = np.zeros(n, np.float32)
    for h in range(1, harmonics + 1):
        if f * h > 9000:
            break
        s += np.sin(2 * np.pi * f * h * x + rng.uniform(0, 6.28)) / h
    return s


pad, arp, bass, pulse, shim = buf(), buf(), buf(), buf(), buf()
n_bars = int(np.ceil((TOTAL - PRE) / BAR)) + 1
for bi in range(-1, n_bars):
    t0 = PRE + bi * BAR
    root, tones = CHORDS[bi % 4]
    is_last = t0 >= end_card - BAR
    if is_last:
        root, tones = 38, [62, 66, 69, 74]  # resolve on D for the end card
    # pad: detuned saws, soft attack, overlap into the next bar
    n = int((BAR + 1.6) * SR)
    e = np.minimum(env(n, 0.9, BAR + 1.6, 1.6), np.clip((n - np.arange(n)) / (1.4 * SR), 0, 1))
    for m in tones:
        for det, p in ((-0.09, -0.5), (0.0, 0.0), (0.08, 0.5)):
            place(pad, saw(hz(m + det), n, 6) * e, t0, 0.035, p)
    # bass: sustained root with a little drive
    nb = int(BAR * SR)
    xb = np.arange(nb) / SR
    b = np.tanh(1.6 * (np.sin(2 * np.pi * hz(root) * xb) + 0.3 * np.sin(4 * np.pi * hz(root) * xb)))
    place(bass, b * env(nb, 0.05, BAR, 1.2), t0, 0.09)
    # arp: plucked chord tones in eighths, ping-pong
    order = [0, 2, 1, 3, 2, 1, 3, 2]
    for k in range(8):
        m = tones[order[k]] + (12 if k in (3, 7) else 0)
        npk = int(0.6 * SR)
        x = np.arange(npk) / SR
        f = hz(m)
        s = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(4 * np.pi * f * x) + 0.12 * np.sin(6 * np.pi * f * x)
        place(arp, s * env(npk, 0.004, 0.6, 7), t0 + k * BEAT / 2, 0.05, -0.45 if k % 2 else 0.45)
    # pulse: soft kick on 1 and 3, shaker on the off-beats
    for k in range(4):
        tk = t0 + k * BEAT
        if k in (0, 2):
            nk = int(0.35 * SR)
            x = np.arange(nk) / SR
            ph = 2 * np.pi * np.cumsum(40 + 50 * np.exp(-x * 30)) / SR
            place(pulse, np.sin(ph) * env(nk, 0.002, 0.35, 6), tk, 0.20)
        ns = int(0.05 * SR)
        place(pulse, hp(rng.standard_normal(ns).astype(np.float32), 7000) * env(ns, 0.002, 0.05, 5), tk + BEAT / 2, 0.03, 0.2)
    # shimmer: high chord tone with tremolo
    nsh = int(BAR * SR)
    x = np.arange(nsh) / SR
    m = tones[(bi % 3) + 1] + 12
    s = np.sin(2 * np.pi * hz(m) * x) * (0.6 + 0.4 * np.sin(2 * np.pi * 5.2 * x))
    place(shim, s * env(nsh, 0.8, BAR, 2), t0, 0.022, 0.3 if bi % 2 else -0.3)

music = buf()
for k, layer in enumerate((pad, arp, bass, pulse, shim)):
    music += layer * layer_gain(k)[:, None]
music = lp(music, 9000)

# ---------------------------------------------------------------- sound effects
sfx, verb_send = buf(), buf()


def noise(n):
    return rng.standard_normal(n).astype(np.float32)


def sweep_noise(n, f0, f1, bands=8):
    """Noise whose colour slides from f0 to f1: crossfades between fixed band-passed copies (no filter clicks)."""
    src = noise(n)
    centres = np.geomspace(min(f0, f1), max(f0, f1), bands)
    pos = np.linspace(0, bands - 1, n) if f1 >= f0 else np.linspace(bands - 1, 0, n)
    out = np.zeros(n, np.float32)
    for k, f in enumerate(centres):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        out += bp(src, f / 1.5, min(f * 1.5, 20000), 1) * w
    return out


def click_sfx():
    n = int(0.05 * SR)
    x = np.arange(n) / SR
    tick = np.sin(2 * np.pi * 2300 * x) * np.exp(-x * 260)
    thock = np.sin(2 * np.pi * 170 * x) * np.exp(-x * 120)
    burst = hp(noise(n), 2500) * np.exp(-x * 600)
    return (0.5 * tick + 0.6 * thock + 0.35 * burst).astype(np.float32)


def key_sfx():
    """A soft laptop key: a short band-limited tap with a low body, not hiss."""
    n = int(0.035 * SR)
    x = np.arange(n) / SR
    f = rng.uniform(900, 1500)
    tap = bp(noise(n), 1200, 4200, 2) * np.exp(-x * 900)
    body = np.sin(2 * np.pi * f * x) * np.exp(-x * 420) + 0.5 * np.sin(2 * np.pi * 240 * x) * np.exp(-x * 300)
    return (0.45 * tap + 0.55 * body).astype(np.float32)


def whoosh(dur=1.1, up=True):
    n = int(dur * SR)
    s = sweep_noise(n, 300, 3500) if up else sweep_noise(n, 3500, 300)
    x = np.linspace(0, 1, n)
    shape = np.sin(np.pi * x) ** 2
    return (s * shape).astype(np.float32)


def boom(dur=1.4, f0=62, f1=34):
    n = int(dur * SR)
    x = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-x * 4)) / SR
    return (np.tanh(1.4 * np.sin(ph)) * np.exp(-x * 2.8)).astype(np.float32)


def bell(f, dur=1.8):
    n = int(dur * SR)
    x = np.arange(n) / SR
    mod = 2.0 * np.exp(-x * 3) * np.sin(2 * np.pi * f * 3.5 * x)
    return (np.sin(2 * np.pi * f * x + mod) * np.exp(-x * 2.6)).astype(np.float32)


def pop():
    n = int(0.09 * SR)
    x = np.arange(n) / SR
    f = 620 + 380 * (x / x[-1])
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / x[-1]) ** 2).astype(np.float32)


def riser(dur):
    n = int(dur * SR)
    x = np.arange(n) / SR
    k = x / dur
    tone = np.sin(2 * np.pi * np.cumsum(180 + 620 * k**2) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * (4 + 14 * k) * x))
    return ((0.5 * sweep_noise(n, 400, 6000) + 0.35 * tone) * k**2).astype(np.float32)


def crash(dur=2.2):
    n = int(dur * SR)
    x = np.arange(n) / SR
    return (hp(noise(n), 4000) * np.exp(-x * 2.2)).astype(np.float32)


# title: riser over the black pre-roll, impact as the title appears
place(sfx, riser(PRE + 0.1), 0.0, 0.32)
place(sfx, boom(2.0), PRE, 0.5)
place(verb_send, crash(), PRE, 0.10, -0.2)
place(verb_send, crash(), PRE + 0.01, 0.10, 0.2)
for m in (50, 62, 66, 69):
    place(verb_send, bell(hz(m + 24), 2.4), PRE + 0.02, 0.06)

for c in cues:
    t, kind = c["t"], c["kind"]
    if kind == "click":
        place(sfx, click_sfx(), t, 0.42 * 10 ** (rng.uniform(-2, 1) / 20), rng.uniform(-0.15, 0.15))
    elif kind == "type":
        tk = t + 0.05
        while tk < t + c.get("dur", 1.0):
            place(sfx, key_sfx(), tk, 0.06 * 10 ** (rng.uniform(-4, 1) / 20), rng.uniform(-0.2, 0.2))
            tk += rng.uniform(0.045, 0.085)
    elif kind == "scroll":
        place(sfx, whoosh(0.45), t, 0.07, 0.1)
    elif kind == "caption":
        place(sfx, pop(), t, 0.05)
    elif kind == "success":
        place(verb_send, bell(hz(86), 1.8), t, 0.10, -0.25)  # D6
        place(verb_send, bell(hz(93), 1.8), t + 0.09, 0.08, 0.25)  # A6
        place(sfx, pop(), t, 0.04)

for b in sections:
    # J-lead: the whoosh starts before the cut and peaks on it; the boom lands on the cut.
    place(sfx, whoosh(1.2), b - 0.75, 0.30, -0.4)
    place(sfx, whoosh(0.9, up=False), b - 0.05, 0.16, 0.4)
    place(sfx, boom(1.2, 70, 38), b, 0.28)
    place(verb_send, bell(hz(74), 1.6), b + 0.02, 0.05)

# end card: soft impact, bell chord
place(sfx, whoosh(1.4), end_card - 0.9, 0.25)
place(sfx, boom(2.4, 55, 30), end_card, 0.38)
for i, m in enumerate((74, 78, 81, 86)):
    place(verb_send, bell(hz(m), 3.0), end_card + 0.04 + i * 0.06, 0.07, -0.3 + 0.2 * i)

# ---------------------------------------------------------------- reverb, ducking, master
ir_n = int(2.6 * SR)
x = np.arange(ir_n) / SR
ir = np.stack([noise(ir_n) * np.exp(-x * 2.4), noise(ir_n) * np.exp(-x * 2.4)], 1)
ir = lp(ir, 6000)
ir /= np.sqrt((ir**2).sum(0, keepdims=True))
wet_bus = music * 0.35 + verb_send
wet = np.stack([fftconvolve(wet_bus[:, ch], ir[:, ch])[:N] for ch in range(2)], 1).astype(np.float32)

# duck the music a little under the transitions so the effects read
duck = np.ones(N, np.float32)
for b in sections + [PRE, end_card]:
    duck -= 0.35 * np.exp(-(((tt - b) / 0.35) ** 2)).astype(np.float32)
mix = music * duck[:, None] * 0.9 + wet * 0.55 + sfx + verb_send * 0.6
mix = hp(mix, 34)
mix = np.tanh(1.15 * mix / np.abs(mix).max()) * 0.95
wav = os.path.join(OUT, "_score.wav")
wavfile.write(wav, SR, mix.astype(np.float32))
print("✔ score", wav)
if os.environ.get("ONLY_AUDIO"):
    sys.exit(0)

# ---------------------------------------------------------------- picture
def zoom_expr():
    """Slow push-in over each section (up to +3%), easing back just before its cut, as an ffmpeg expression in t."""
    T = f"(in/{FPS})"
    parts = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        L = max(b - a, 1.0)
        rise = f"clip(({T}-{a:.3f})/{max(L - 1.0, 0.5):.3f},0,1)"
        fall = f"clip(({T}-{b - 0.9:.3f})/0.9,0,1)"
        z = f"(1+0.03*({rise}*{rise}*(3-2*{rise}))*(1-{fall}*{fall}*(3-2*{fall})))"
        parts.append((a, b, z))
    expr = "1"
    for a, b, z in reversed(parts):
        expr = f"if(between({T},{a:.3f},{b:.3f}),{z},{expr})"
    return expr


mp4 = os.path.join(OUT, "GapMap_Demo.mp4")
z = zoom_expr()
vf = ",".join([
    f"fps={FPS}",
    f"tpad=start_duration={PRE}:stop_duration={TAIL}:color=black",
    "scale=2560:1440:flags=lanczos",
    f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS}",
    "unsharp=5:5:0.55:5:5:0",
    "eq=contrast=1.035:saturation=1.08:gamma=0.985",
    "vignette=angle=0.32",
    f"fade=t=in:st={PRE:.3f}:d=0.5",
    f"fade=t=out:st={PRE + CONTENT - 1.4:.3f}:d=1.4",
    "format=yuv420p",
])
cmd = [
    FFMPEG, "-y", "-loglevel", "error", "-stats",
    "-f", "concat", "-safe", "0", "-i", concat, "-i", wav,
    "-vf", vf,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-r", str(FPS),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-t", f"{TOTAL:.3f}", "-movflags", "+faststart", mp4,
]
subprocess.run(cmd, check=True)
print("✔", mp4)
