import { useEffect, useRef } from 'react'

// Verificação "não sou robô" (Cloudflare Turnstile): quase sempre invisível para pessoas; robôs não passam.
// A chave do site é pública (fica no código). A chave secreta fica só no Supabase (Authentication → Bot and Abuse
// Protection). Enquanto a chave do site estiver vazia, nada aparece e o cadastro funciona como antes.
export const TURNSTILE_SITE_KEY = ''

interface Turnstile {
  render(el: HTMLElement, o: Record<string, unknown>): string
  reset(id?: string): void
  remove(id?: string): void
}
declare global { interface Window { turnstile?: Turnstile } }

let carregando: Promise<void> | null = null
function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => ok()
      s.onerror = () => { carregando = null; falha(new Error('verificação indisponível')) }
      document.head.appendChild(s)
    })
  }
  return carregando
}

export const verificacaoLigada = () => TURNSTILE_SITE_KEY.length > 0

/**
 * Mostra a verificação e devolve o token em `onToken` (null quando expira ou falha).
 * `versao` muda para pedir um token novo (cada token vale uma vez).
 */
export default function VerificacaoHumana({ onToken, versao = 0, acao }: { onToken: (t: string | null) => void; versao?: number; acao: string }) {
  const el = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  cb.current = onToken
  useEffect(() => {
    if (!verificacaoLigada() || !el.current) return
    let id: string | null = null
    let vivo = true
    cb.current(null)
    carregarScript().then(() => {
      if (!vivo || !el.current || !window.turnstile) return
      id = window.turnstile.render(el.current, {
        sitekey: TURNSTILE_SITE_KEY, action: acao, theme: 'dark', language: 'pt-br', appearance: 'interaction-only',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(null),
        'error-callback': () => cb.current(null),
      })
    }).catch(() => cb.current(null))
    return () => { vivo = false; if (id && window.turnstile) window.turnstile.remove(id) }
  }, [versao, acao])
  if (!verificacaoLigada()) return null
  return <div ref={el} className="flex justify-center min-h-0" />
}
