// Modo do app: "aluno" (o próprio treino e dieta) ou "personal" (painel para atender alunos).
// Fica no aparelho (troca na hora) e nas preferências da conta (vale em outro aparelho).
import { useEffect, useState } from 'react'
import { carregarPrefsApp, salvarPrefApp } from './prefsApp'

export type ModoApp = 'aluno' | 'personal'
const CHAVE = 'r2-modo-app'
const EVENTO = 'r2-modo-app'

export function lerModo(): ModoApp | null {
  try { const v = localStorage.getItem(CHAVE); return v === 'aluno' || v === 'personal' ? v : null } catch { return null }
}

export function definirModo(m: ModoApp, userId?: string) {
  try { localStorage.setItem(CHAVE, m) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO))
  if (userId) salvarPrefApp(userId, 'modo_app', m).catch(() => {})
}

/** Modo atual; null = ainda não escolheu (o Início pergunta). */
export function useModoApp(userId: string | undefined): ModoApp | null {
  const [modo, setModo] = useState<ModoApp | null>(lerModo)
  useEffect(() => {
    const atualizar = () => setModo(lerModo())
    window.addEventListener(EVENTO, atualizar)
    return () => window.removeEventListener(EVENTO, atualizar)
  }, [])
  // aparelho novo: usa o que a pessoa escolheu em outro aparelho
  useEffect(() => {
    if (!userId || lerModo()) return
    carregarPrefsApp(userId).then(p => {
      const v = p.modo_app
      if ((v === 'aluno' || v === 'personal') && !lerModo()) { try { localStorage.setItem(CHAVE, v) } catch { /* ignore */ } setModo(v) }
    }).catch(() => {})
  }, [userId])
  return modo
}
