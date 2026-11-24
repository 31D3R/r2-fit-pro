# Encaixa a narração nas legendas: corta o silêncio de cada fala, posiciona cada uma no tempo da sua legenda
# (acelerando de leve se não couber) e reescreve os tempos das legendas para baterem com a voz.
# Uso: python3 montar.py roteiro.json pasta_trabalho fala1.wav fala2.wav ... cta.wav
import json, subprocess, sys, os
rot_arq, pasta, *falas = sys.argv[1:]
rot = json.load(open(rot_arq)); os.makedirs(pasta, exist_ok=True)
def dur(f): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))
def preparar(f, nome, tempo=1.0):
    out = f'{pasta}/{nome}.wav'
    filtro = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse'
    if tempo != 1.0: filtro += f',atempo={tempo:.3f}'
    subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', f, '-af', filtro, '-ar', '44100', '-ac', '1', out])
    return out, dur(out)
leg = rot['legendas']; assert len(falas) == len(leg) + 1, (len(falas), len(leg))
limite = rot['fim']['de'] - 0.15
for tempo in (1.0, 1.05, 1.1):
    linhas = [preparar(f, f'f{i}', tempo) for i, f in enumerate(falas[:-1])]
    agenda, fim_ant = [], 0.0
    for (arq, d), l in zip(linhas, leg):
        ini = max(l['de'] + 0.05, fim_ant + 0.12)
        agenda.append({'arquivo': arq, 't': round(ini, 3), 'fim': round(ini + d, 3)}); fim_ant = ini + d
    if fim_ant <= limite: break
# ainda não coube: estica o fim do vídeo (a última cena, o título e os selos ficam mais tempo)
if fim_ant > limite:
    extra = round(fim_ant - limite, 3); velho = rot['fim']['de']
    for c in rot['cenas']:
        if c['ate'] >= velho - .01: c['ate'] = round(c['ate'] + extra, 3)
    for x in rot['titulos'] + rot.get('selos', []):
        if x['ate'] >= velho - .01: x['ate'] = round(x['ate'] + extra, 3)
    rot['fim']['de'] = round(velho + extra, 3)
for a, l in zip(agenda, leg):
    l['de'] = round(a['t'] - 0.05, 3)
for i, l in enumerate(leg):
    prox = leg[i + 1]['de'] if i + 1 < len(leg) else rot['fim']['de']
    l['ate'] = round(min(prox, agenda[i]['fim'] + 0.35), 3)
cta, dc = preparar(falas[-1], 'cta')
t_cta = rot['fim']['de'] + 0.45
agenda.append({'arquivo': cta, 't': round(t_cta, 3), 'fim': round(t_cta + dc, 3)})
rot['duracao'] = round(max(rot['duracao'], t_cta + dc + 0.9), 2)
json.dump(rot, open(f'{pasta}/roteiro.json', 'w'), ensure_ascii=False, indent=1)
json.dump(agenda, open(f'{pasta}/narracao.json', 'w'), indent=1)
print('ok tempo', tempo, 'duracao', rot['duracao'], [(a['t'], a['fim']) for a in agenda])
