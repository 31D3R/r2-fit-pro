// Data de hoje que muda sozinha: o app aberto de um dia para o outro (celular na mesa) passa a mostrar o dia novo
// ao voltar para a tela e na virada da meia-noite.
import { useEffect, useState } from 'react'
import { hojeLocal } from './diario'

export function useHoje(): string {
  const [hoje, setHoje] = useState(hojeLocal)
  useEffect(() => {
    const ver = () => setHoje(h => { const n = hojeLocal(); return n === h ? h : n })
    const vis = () => { if (document.visibilityState === 'visible') ver() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', ver)
    const t = setInterval(ver, 60_000)
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', ver); clearInterval(t) }
  }, [])
  return hoje
}
