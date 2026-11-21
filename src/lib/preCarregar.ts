// Sem internet na academia: com o app aberto online, já busca (em segundo plano) as telas principais, para que
// treinos, dietas, metas e opções fiquem guardados no aparelho mesmo que a pessoa nunca os tenha aberto.
// As consultas são iguais às das telas: a camada offline (lib/offline.ts) guarda cada uma pelo endereço.
import { supabase } from './supabase'
import { carregarPreferencias } from './preferencias'
import { carregarPrefsApp } from './prefsApp'
import { CLIP_EXTRAS, CLIP_KEYS, chaveSerie } from './workoutAudio'
import { slugNome } from './vozNomes'

let ultima = 0

export async function preCarregar(userId: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  // no máximo a cada 20 minutos (ao abrir e ao voltar para o app)
  if (Date.now() - ultima < 20 * 60_000) return
  ultima = Date.now()
  try {
    const [{ data: treinos }, { data: dietas }] = await Promise.all([
      supabase.from('treinos').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('dietas').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('metas_nutricionais').select('*').eq('user_id', userId).maybeSingle(),
      carregarPreferencias(userId).catch(() => null),
      carregarPrefsApp(userId).catch(() => null),
    ])
    // tela de cada treino e de cada dieta (os mais recentes)
    const ids = <T extends { id: string }>(l: T[] | null, n: number) => (l ?? []).slice(0, n).map(x => x.id)
    for (const id of ids(treinos as { id: string }[] | null, 4)) await supabase.from('treinos').select('*').eq('id', id).single()
    for (const id of ids(dietas as { id: string }[] | null, 3)) await supabase.from('dietas').select('*').eq('id', id).single()
    // vozes do contador (o service worker guarda os arquivos): contagem, avisos, séries e nomes dos exercícios
    // do treino mais recente, para o contador falar na academia sem sinal
    const urls = new Set<string>([...CLIP_KEYS, ...CLIP_EXTRAS].map(k => `/audio/${k}.wav`))
    type Ex = { nome?: string; series?: number }
    const plano = (treinos as { plano?: { dias?: { exercicios?: Ex[] }[] } }[] | null)?.[0]?.plano
    for (const dia of plano?.dias ?? []) for (const ex of dia.exercicios ?? []) {
      const n = Math.min(20, Math.max(1, Math.round(Number(ex.series) || 0)))
      for (let i = 1; i <= n; i++) urls.add(`/audio/${chaveSerie(i, n)}.mp3`)
      if (ex.nome) urls.add(`/audio/nomes/${slugNome(ex.nome)}.mp3`)
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      for (const u of urls) await fetch(u).then(r => r.arrayBuffer()).catch(() => null)
    }
  } catch { /* sem internet no meio: tenta na próxima */ }
}
