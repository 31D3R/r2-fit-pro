import { useEffect, useState } from 'react'
import { definirFechamentoModal } from '../lib/nativo'

// Pergunta e aviso desenhados no próprio app, no lugar de window.confirm/alert: a caixa do sistema
// travava o app Android em algumas telas e não segue o visual do app. Uso: `if (!(await confirmar('Apagar?'))) return`.

interface Pedido { texto: string; detalhe?: string; ok: string; cancelar?: string; perigo: boolean; resolver: (v: boolean) => void }
let mostrar: ((p: Pedido) => void) | null = null

export function confirmar(texto: string, o: { detalhe?: string; ok?: string; cancelar?: string; perigo?: boolean } = {}): Promise<boolean> {
  return new Promise(resolver => {
    if (!mostrar) { resolver(window.confirm(texto)); return } // sem a janela montada (não deve acontecer)
    mostrar({ texto, detalhe: o.detalhe, ok: o.ok ?? 'Confirmar', cancelar: o.cancelar ?? 'Cancelar', perigo: o.perigo ?? /remov|exclu|apag|cancel/i.test(texto), resolver })
  })
}

export function avisar(texto: string): Promise<void> {
  return new Promise(resolver => {
    if (!mostrar) { window.alert(texto); resolver(); return }
    mostrar({ texto, ok: 'Ok', perigo: false, resolver: () => resolver() })
  })
}

/** Montado uma vez no App. */
export default function Confirmacoes() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  useEffect(() => { mostrar = p => setPedido(atual => { atual?.resolver(false); return p }); return () => { mostrar = null } }, [])
  // Botão voltar do Android com a pergunta aberta: fecha como "Cancelar"
  useEffect(() => {
    if (!pedido) return
    definirFechamentoModal(() => { responder(false); return true })
    return () => definirFechamentoModal(null)
  })
  const responder = (v: boolean) => { if (pedido) { pedido.resolver(v); setPedido(null) } }
  if (!pedido) return null
  return (
    <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-4" onClick={() => responder(false)}>
      <div role="alertdialog" aria-label={pedido.texto} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center animate-fade-up">
        <p className="text-base font-bold text-zinc-50">{pedido.texto}</p>
        {pedido.detalhe && <p className="text-sm text-zinc-400 mt-1">{pedido.detalhe}</p>}
        <div className="flex flex-col gap-2 mt-5">
          <button type="button" autoFocus onClick={() => responder(true)}
            className={`w-full py-3 rounded-2xl font-bold ${pedido.perigo ? 'bg-red-500/90 text-white' : 'bg-green-500 text-zinc-950'}`}>{pedido.ok}</button>
          {pedido.cancelar && (
            <button type="button" onClick={() => responder(false)} className="w-full py-3 rounded-2xl font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700">{pedido.cancelar}</button>
          )}
        </div>
      </div>
    </div>
  )
}
