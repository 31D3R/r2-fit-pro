# Criativos animados (vídeos verticais 1080×1920, com narração, música e legendas)

## Como fazer os próximos (ordem combinada com o dono)
1. **Roteiro**: as falas de cada vídeo (uma por legenda) + a chamada final.
2. **Falas**: gerar a narração de cada fala no Higgsfield (`seed_audio`, voz "Influencer Ruiva BH", ~1 crédito por fala).
   Reaproveitar a chamada final quando o texto for o mesmo.
3. **Vídeo em cima da voz**: `montar.py` corta o silêncio, encaixa cada fala e reescreve os tempos das legendas;
   as telas trocam junto com cada fala (no vídeo 5, uma cena por fala). Depois `finalizar.sh` grava o vídeo,
   gera a trilha e junta tudo.

## Arquivos
- `estudio.html`: o palco (fundo animado, celular com telas reais do app, toques, zoom, realces, legendas karaokê,
  selos, tela final). `render(t)` desenha o instante t.
- `gravar.mjs <roteiro.json> <saida.mp4> <pasta-das-telas>`: grava quadro a quadro (30 fps) com o ffmpeg.
  `QUADROS=1.5,5 node gravar.mjs ...` gera só quadros de prévia.
- `montar.py <roteiro.json> <pasta> fala1.wav ... chamada.wav`: encaixa a narração nas legendas (acelera até 10%;
  se não couber, estica o fim do vídeo). Gera `roteiro.json` e `narracao.json` na pasta.
- `audio.py <roteiro.json> <saida.wav> [narracao.json]`: trilha própria (sem direitos autorais, 124 BPM), efeitos
  (transição, toque, selo, impacto final) e a música abaixando quando a voz fala.
- `finalizar.sh <pasta> <saida.mp4> <pasta-das-telas>`: vídeo + trilha + narração → MP4 (H.264 + AAC).
- `*.json`: roteiros já sincronizados com a narração atual.
- As telas são capturadas pelos testes de interface com `deviceScaleFactor: 3` (dados de exemplo).
  As narrações (.wav) ficam fora do repositório (repositório público).

## Falas atuais
1. Contador: "Abriu o treino, tocou em iniciar." · "A voz conta: cinco, quatro, três, dois, um..." · "marca o tempo de
   cada série" · "e o descanso, até com a tela bloqueada."
2. Calorias: "Tocou em adicionar..." · "digitou e achou na tabela Taco." · "Escolhe a medida de casa: calorias e macros
   na hora." · "Também por foto do prato e código de barras."
3. Treino perdido: "Faltou um dia? Acontece." · "O app divide os exercícios nos próximos dias" · "sem pesar o mesmo
   músculo em dias seguidos." · "Pronto: semana ajustada, com um toque."
4. Personal: "Veja na hora quem parou de treinar." · "Treinos, dieta e peso de cada aluno." · "Mande treinos, ajuste
   metas e converse." · "Com cinco alunos assinando, você não paga nada." · fim: "Ative o modo personal no Erre Dois Fit Pro!"
5. Tudo em um: "Meta de calorias do seu jeito." · "Treino com contador e voz." · "Dieta montada pela inteligência
   artificial." · "Relatório da semana em pê dê éfe." · "Jejum, água e lembretes." · "Sem sinal na academia? Funciona."
- Chamada final (1, 2, 3 e 5): "Baixe o Erre Dois Fit Pro e teste grátis por sete dias!"
