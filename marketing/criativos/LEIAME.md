# Criativos animados (vídeos verticais 1080×1920)

Telas reais do app (com dados de exemplo dos testes) + títulos, legendas, selos e tela final animados.

- `estudio.html`: o "palco" (fundo animado, celular, legendas karaokê, selos, tela final). `render(t)` desenha o instante t.
- `gravar.mjs <roteiro.json> <saida.mp4> <pasta-das-telas>`: grava quadro a quadro (30 fps) e monta o MP4 com o ffmpeg.
  `QUADROS=1.5,5,10 node gravar.mjs ...` gera só quadros de prévia.
- `*.json`: os roteiros (cenas com telas, toques, realces, zoom, rolagem e sequência real do contador; títulos; legendas; selos; tela final).
- As telas são capturadas pelos testes de interface com `deviceScaleFactor: 3` (contador quadro a quadro, busca de alimento, personal).
