// Modo do app: "aluno" (o próprio treino e dieta) ou "personal" (painel para atender alunos).
// Fica no aparelho (troca na hora) e nas preferências da conta (vale em outro aparelho).
import { useEffect, useState } from 'react'
import { carregarPrefsApp, salvarPrefApp } from './prefsApp'

export type ModoApp = 'aluno' | 'personal'
const CHAVE = 'r2-modo-app'
const EVENTO = 'r2-modo-app'

// por conta: duas pessoas no mesmo celular (ou trocar de conta) não herdam o modo da outra
const chave = (userId?: string) => (userId ? `${CHAVE}:${userId}` : CHAVE)

export function lerModo(userId?: string): ModoApp | null {
  try { const v = localStorage.getItem(chave(userId)); return v === 'aluno' || v === 'personal' ? v : null } catch { return null }
}

// trocado aqui agora: a leitura da conta (que pode chegar antes de a troca ser salva) não desfaz
const trocadoAgora = new Set<string>()

export function definirModo(m: ModoApp, userId?: string) {
  if (userId) trocadoAgora.add(userId)
  try { localStorage.setItem(chave(userId), m) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO))
  if (userId) salvarPrefApp(userId, 'modo_app', m).catch(() => {})
}

/** Modo atual; null = ainda não escolheu (o Início pergunta). */
export function useModoApp(userId: string | undefined): ModoApp | null {
  const [modo, setModo] = useState<ModoApp | null>(() => lerModo(userId))
  useEffect(() => {
    setModo(lerModo(userId))
    const atualizar = () => setModo(lerModo(userId))
    window.addEventListener(EVENTO, atualizar)
    return () => window.removeEventListener(EVENTO, atualizar)
  }, [userId])
  // o que está salvo na conta vale (mudou em outro aparelho, ou aparelho novo)
  useEffect(() => {
    if (!userId) return
    let vivo = true
    carregarPrefsApp(userId).then(p => {
      const v = p.modo_app
      if (!vivo || trocadoAgora.has(userId) || (v !== 'aluno' && v !== 'personal') || v === lerModo(userId)) return
      try { localStorage.setItem(chave(userId), v) } catch { /* ignore */ }
      setModo(v)
    }).catch(() => {})
    return () => { vivo = false }
  }, [userId])
  return modo
}
