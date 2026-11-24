#!/bin/bash
# finalizar.sh <pasta_trabalho> <saida.mp4> <pasta_telas>  (a pasta tem roteiro.json e narracao.json do montar.py)
set -e
P=$1; S=$2; TELAS=$3; AQUI=$(dirname "$0")
node "$AQUI/gravar.mjs" "$P/roteiro.json" "$P/video.mp4" "$TELAS" | tail -1
python3 "$AQUI/audio.py" "$P/roteiro.json" "$P/audio.wav" "$P/narracao.json" | tail -1
ffmpeg -loglevel error -y -i "$P/video.mp4" -i "$P/audio.wav" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$S"
echo "pronto $S"
