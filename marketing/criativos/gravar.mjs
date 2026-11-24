// Grava um roteiro quadro a quadro (30 fps) e monta o MP4 com o ffmpeg.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const [roteiroArq, saida, pastaTelas] = process.argv.slice(2)
const R = JSON.parse(fs.readFileSync(roteiroArq, 'utf8'))
const FPS = 30
const tipo = f => (f.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
const telas = { ...R.telas }
for (const c of R.cenas) if (c.seq) for (let i = 0; i < c.seq.tempos.length; i++) { const k = c.seq.prefixo + String(i).padStart(3, '0'); telas[k] = c.seq.arquivo.replace('#', String(i).padStart(3, '0')) }
const fontes = Object.fromEntries(Object.entries(telas).map(([k, f]) => [k, `data:${tipo(f)};base64,` + fs.readFileSync(path.join(pastaTelas, f)).toString('base64')]))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
await page.goto('file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'estudio.html'))
await page.evaluate(([r, f]) => window.preparar(r, f), [R, fontes])
if (process.env.QUADROS) {
  for (const q of process.env.QUADROS.split(',')) { await page.evaluate(t => window.render(t), Number(q)); await page.screenshot({ path: `${saida}-${q}.png` }) }
  await browser.close(); process.exit(0)
}
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), saida], { stdio: ['pipe', 'inherit', 'inherit'] })
const total = Math.round(R.duracao * FPS)
for (let i = 0; i < total; i++) {
  await page.evaluate(t => window.render(t), i / FPS)
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 })
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
}
ff.stdin.end()
await new Promise(r => ff.on('close', r))
await browser.close()
console.log('ok', saida, total, 'quadros')
