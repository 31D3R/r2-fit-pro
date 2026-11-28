// Fotos de perfil de outras pessoas (amigos, personal, alunos). O banco só devolve as que quem logou pode ver
// (função avatares + política do storage); o link assinado vale 1 hora. Pedidos próximos saem juntos.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const cache = new Map<string, { url: string | null; ate: number }>()
let fila = new Set<string>()
let espera: Promise<void> | null = null
const ouvintes = new Set<() => void>()
const VALIDADE = 50 * 60 * 1000

async function buscar(ids: string[]) {
  const agora = Date.now()
  try {
    const { data } = await supabase.rpc('avatares', { p_ids: ids })
    const caminhos = (data ?? {}) as Record<string, string>
    const lista = Object.entries(caminhos)
    const { data: urls } = lista.length ? await supabase.storage.from('avatars').createSignedUrls(lista.map(([, c]) => c), 3600) : { data: [] }
    const porCaminho = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
    for (const id of ids) cache.set(id, { url: caminhos[id] ? porCaminho.get(caminhos[id]) ?? null : null, ate: agora + VALIDADE })
  } catch {
    for (const id of ids) cache.set(id, { url: null, ate: agora + 60_000 })
  }
}

function pedir(id: string) {
  fila.add(id)
  espera ??= new Promise<void>(r => setTimeout(r, 30)).then(async () => {
    const ids = [...fila]; fila = new Set(); espera = null
    for (let i = 0; i < ids.length; i += 200) await buscar(ids.slice(i, i + 200))
    ouvintes.forEach(f => f())
  })
}

/** Link da foto de perfil de alguém (null se não tem ou não pode ver). */
export function useAvatar(userId: string | null | undefined): string | null {
  const [, set] = useState(0)
  useEffect(() => {
    if (!userId) return
    const f = () => set(n => n + 1)
    ouvintes.add(f)
    const c = cache.get(userId)
    if (!c || c.ate < Date.now()) pedir(userId)
    return () => { ouvintes.delete(f) }
  }, [userId])
  return userId ? cache.get(userId)?.url ?? null : null
}

/** Depois de trocar a própria foto. */
export const esquecerAvatar = (userId: string) => { cache.delete(userId) }
