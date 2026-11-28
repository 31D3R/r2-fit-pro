import { useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Smartphone } from 'lucide-react'
import { Logo } from './Logo'
import { detectarSistema, LINK_APP_ANDROID } from '../lib/instalacao'
import { ehAppNativo } from '../lib/nativo'
import { normalizarCodigo } from '../lib/acompanhamentoBase'

const CHAVE = 'r2-convite-navegador'

/** Endereço que abre o app instalado direto no convite; sem o app (ou com app antigo), o Chrome volta para esta página. */
export function linkAbrirNoApp(origem: string, caminho: string): string {
  const u = new URL(origem)
  const volta = `${u.origin}${caminho}?sem_app=1`
  return `intent://${u.host}${caminho}#Intent;scheme=https;package=br.com.r2fitpro.app;S.browser_fallback_url=${encodeURIComponent(volta)};end`
}

/**
 * Link de convite (personal ou amigo) aberto no Chrome do Android: oferece abrir no app ou baixar.
 * Ao baixar, o link do convite vai para a área de transferência, e o app (1.9.3+) abre o convite sozinho na primeira vez.
 */
export default function ConviteNoCelular({ tipo, children }: { tipo: 'convite' | 'amigo'; children: ReactNode }) {
  const { codigo: bruto } = useParams<{ codigo?: string }>()
  const codigo = normalizarCodigo(bruto ?? '')
  const [noNavegador, setNoNavegador] = useState(() => {
    try { return sessionStorage.getItem(CHAVE) === '1' } catch { return false }
  })
  const [baixando, setBaixando] = useState(false)

  if (noNavegador || ehAppNativo() || detectarSistema() !== 'android' || codigo.length !== 6) return <>{children}</>

  const caminho = `/${tipo}/${codigo}`
  const linkConvite = `${window.location.origin}${caminho}`
  const semApp = new URLSearchParams(window.location.search).has('sem_app')
  const titulo = tipo === 'convite' ? 'Seu personal te convidou' : 'Um amigo te convidou! 🎉'
  const continuar = () => { try { sessionStorage.setItem(CHAVE, '1') } catch { /* sem armazenamento */ } setNoNavegador(true) }
  const baixar = () => {
    setBaixando(true)
    // o app recém-instalado lê este link na primeira abertura e já abre o convite
    navigator.clipboard?.writeText(linkConvite).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-3">
          <Logo tamanho="lg" />
          <h1 className="text-2xl font-bold">{titulo}</h1>
          <p className="text-sm text-zinc-400">
            {tipo === 'convite'
              ? 'Abra no app R2 Fit Pro para aceitar e começar o acompanhamento.'
              : 'Abra no app R2 Fit Pro e vocês já ficam amigos: um vê os treinos do outro e disputam o ranking.'}
          </p>
          <p className="text-xs text-zinc-500">Código: <span className="font-mono tracking-widest text-zinc-300">{codigo}</span></p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
          {!semApp && (
            <a href={linkAbrirNoApp(window.location.origin, caminho)} data-testid="abrir-no-app"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 text-zinc-950 font-bold px-4 py-3.5"><Smartphone className="w-5 h-5" />Abrir no app</a>
          )}
          {semApp && <p className="text-sm text-zinc-300">Não encontramos o app atualizado neste celular. Baixe e instale para aceitar o convite.</p>}
          <a href={LINK_APP_ANDROID} download="r2-fit-pro.apk" onClick={baixar} data-testid="baixar-convite"
            className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold px-4 py-3.5 ${semApp ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-100'}`}><Download className="w-5 h-5" />{semApp ? 'Baixar o app' : 'Ainda não tenho o app'}</a>
          {baixando && (
            <ol className="flex flex-col gap-2 text-sm text-zinc-300 list-decimal pl-5">
              <li>Abra o arquivo <b>r2-fit-pro.apk</b> quando o download terminar e toque em <b>Instalar</b>.</li>
              <li>Abra o <b>R2 Fit Pro</b> e entre ou crie sua conta.</li>
              <li>O convite abre sozinho. Se não abrir, volte aqui e toque em <b>Abrir no app</b>.</li>
            </ol>
          )}
        </div>

        <button onClick={continuar} className="text-xs text-zinc-500 underline">Continuar pelo navegador</button>
      </div>
    </div>
  )
}
