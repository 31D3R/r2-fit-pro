# Trilha dos criativos, gerada aqui (sem direitos autorais): batida eletrônica 124 BPM, efeitos (transição, toque,
# selo, impacto final) e narração com a música abaixando enquanto a voz fala.
# Uso: python3 audio.py roteiro.json saida.wav [narracao.json]
import json, sys, wave
import numpy as np
SR = 44100
rot = json.load(open(sys.argv[1])); saida = sys.argv[2]
narr = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else []
T = rot['duracao']; N = int(T * SR)
rng = np.random.default_rng(7)
def t_(d): return np.arange(int(d * SR)) / SR
def env(n, a=0.005, r=0.2):
    x = np.arange(n) / SR
    return np.minimum(1, x / max(a, 1e-4)) * np.exp(-x / max(r, 1e-4))
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y
def hp(x, fc): return x - lp(x, fc)
def add(buf, sig, t0, g=1.0):
    i = int(t0 * SR)
    if i >= len(buf) or i + len(sig) <= 0: return
    j = min(len(buf), i + len(sig)); k = max(0, -i); i = max(0, i)
    buf[i:j] += g * sig[k:k + (j - i)]
nota = lambda m: 440 * 2 ** ((m - 69) / 12)
bpm = 124; b = 60 / bpm
# acordes (lá menor, fá, dó, sol) em MIDI
acordes = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
baixo = [45, 41, 48, 43]
mus = np.zeros(N); pump = np.ones(N)
# bumbo + "pump" (sidechain) em todo tempo
kn = int(0.3 * SR); kt = np.arange(kn) / SR
kick = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-kt * 28)) / SR) * np.exp(-kt * 9)
for k in range(int(T / b) + 1):
    t0 = k * b
    if t0 > T - .4: break
    add(mus, kick, t0, .9)
    i = int(t0 * SR); m = min(N, i + int(.22 * SR))
    pump[i:m] = np.minimum(pump[i:m], 0.35 + 0.65 * (np.arange(m - i) / (.22 * SR)))
# palmas nos tempos 2 e 4, chimbal nas colcheias
cn = int(.18 * SR); clap = hp(rng.standard_normal(cn), 900) * env(cn, .002, .05)
hn = int(.05 * SR); hat = hp(rng.standard_normal(hn), 7000) * env(hn, .001, .012)
for k in range(int(T / (b / 2)) + 1):
    t0 = k * b / 2
    if t0 > T - .3: break
    if k % 4 == 2: add(mus, clap, t0, .35)
    add(mus, hat, t0 + (0 if k % 2 == 0 else 0.01), .10 if k % 2 == 0 else .16)
# baixo, pad e arpejo por compasso (4 tempos)
com = 4 * b
for c in range(int(T / com) + 1):
    t0 = c * com; ac = acordes[c % 4]; f0 = nota(baixo[c % 4])
    for e in range(8):
        n = int(b / 2 * SR * .9); tt = np.arange(n) / SR
        s = sum(np.sin(2 * np.pi * f0 * h * tt) / h for h in range(1, 6)) * env(n, .004, .18)
        add(mus, s * .22, t0 + e * b / 2)
    n = int(com * SR); tt = np.arange(n) / SR
    pad = sum(np.sin(2 * np.pi * nota(m + 12) * d * tt) for m in ac for d in (0.997, 1.003))
    pad *= np.minimum(1, tt / .25) * np.minimum(1, (com - tt) / .2)
    add(mus, lp(pad, 2200) * .035, t0)
    for e in range(16):
        m = ac[e % 3] + (24 if e % 6 < 3 else 12)
        n2 = int(.16 * SR); t2 = np.arange(n2) / SR
        pl = (np.sin(2 * np.pi * nota(m) * t2) + .3 * np.sin(4 * np.pi * nota(m) * t2)) * env(n2, .002, .07)
        add(mus, pl * .05, t0 + e * b / 4)
mus *= pump
# efeitos
fx = np.zeros(N)
def whoosh(d=.45):
    n = int(d * SR); x = rng.standard_normal(n); tt = np.arange(n) / n
    y = np.zeros(n); s = 0.0
    for i in range(n):
        fc = 400 + 5000 * tt[i]; a = np.exp(-2 * np.pi * fc / SR); s = (1 - a) * x[i] + a * s; y[i] = s
    return y * np.sin(np.pi * tt) ** 2 * 1.6
W = whoosh()
for c in rot['cenas'][1:]:
    if c['de'] - (rot['cenas'][rot['cenas'].index(c) - 1]['de']) < .4: continue  # cortes rápidos (digitação) sem efeito
    add(fx, W, c['de'] - .3, .30)
tn = int(.06 * SR); tt = np.arange(tn) / SR
toque = (np.sin(2 * np.pi * 1800 * tt) * .6 + hp(rng.standard_normal(tn), 3000) * .4) * env(tn, .001, .012)
for c in rot['cenas']:
    for q in c.get('toques', []): add(fx, toque, q['t'], .45)
pn = int(.09 * SR); tt = np.arange(pn) / SR
pop = np.sin(2 * np.pi * np.cumsum(300 + 900 * tt / tt[-1]) / SR) * env(pn, .002, .04)
for s in rot.get('selos', []): add(fx, pop, s['de'], .35)
bn = int(1.2 * SR); tt = np.arange(bn) / SR
boom = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-tt * 3) + 30) / SR) * np.exp(-tt * 3.5) + lp(rng.standard_normal(bn), 1200) * np.exp(-tt * 6) * .5
add(fx, boom, rot['fim']['de'], .7)
add(fx, W[::-1], rot['fim']['de'] - .45, .35)
# narração
voz = np.zeros(N); ativa = np.zeros(N)
for n in narr:
    with wave.open(n['arquivo']) as w:
        sr = w.getframerate(); ch = w.getnchannels(); sw = w.getsampwidth()
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16 if sw == 2 else np.int32).astype(np.float64)
        raw = raw.reshape(-1, ch).mean(1) / (32768 if sw == 2 else 2 ** 31)
    if sr != SR: raw = np.interp(np.arange(int(len(raw) * SR / sr)) * sr / SR, np.arange(len(raw)), raw)
    raw = raw / (np.max(np.abs(raw)) + 1e-9) * .9
    add(voz, raw, n['t'])
    i = int(n['t'] * SR); ativa[i:i + len(raw)] = 1
# música abaixa com a voz (suave)
duck = 1 - .68 * lp(ativa, 6)
mistura = mus * .55 * duck + fx + voz * 1.0
# entrada/saída e nível
fade = np.ones(N); f = int(.6 * SR); fade[-f:] = np.linspace(1, 0, f); fade[:int(.03 * SR)] = np.linspace(0, 1, int(.03 * SR))
mistura *= fade
mistura = np.tanh(mistura / (np.max(np.abs(mistura)) + 1e-9) * 1.4) / np.tanh(1.4) * .93
st = np.stack([mistura, mistura], 1)
# um pouco de largura estéreo para a música
st[:, 0] += mus * .04 * duck * fade; st[:, 1] -= mus * .04 * duck * fade
st = np.clip(st, -1, 1)
with wave.open(saida, 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('ok', saida)
