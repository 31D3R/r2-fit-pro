import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { EVENTO_OFFLINE, lerFila, sincronizar } from '../lib/offline'

/** Faixa no topo: sem internet (o que for registrado fica no aparelho) e alterações esperando para sincronizar. */
export default function SemInternet() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [pendentes, setPendentes] = useState(() => lerFila().length)
  useEffect(() => {
    const on = () => { setOnline(true); sincronizar().catch(() => {}) }
    const off = () => setOnline(false)
    const fila = () => setPendentes(lerFila().length)
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener(EVENTO_OFFLINE, fila)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener(EVENTO_OFFLINE, fila) }
  }, [])
  if (online && !pendentes) return null
  return (
    <div role="status" className={`text-xs border-t ${online ? 'bg-sky-500/10 border-sky-500/30 text-sky-200' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}>
      <div className="max-w-lg mx-auto px-4 py-1.5 flex items-center gap-2">
        {online ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CloudOff className="w-3.5 h-3.5" />}
        {online
          ? <span>Sincronizando {pendentes} {pendentes === 1 ? 'alteração feita' : 'alterações feitas'} sem internet…</span>
          : <span>Sem internet. O que você registrar fica salvo no celular e sincroniza sozinho{pendentes ? ` (${pendentes} esperando)` : ''}.</span>}
      </div>
    </div>
  )
}
