import { useState } from 'react'
import { useAvatar } from '../lib/avatares'

/** Foto de perfil (ou a inicial do nome) de outra pessoa. */
export default function Avatar({ userId, nome, tamanho = 'w-11 h-11', className = '' }: { userId: string | null | undefined; nome: string; tamanho?: string; className?: string }) {
  const url = useAvatar(userId)
  const [falhou, setFalhou] = useState(false)
  return (
    <span className={`${tamanho} rounded-full bg-green-500/15 text-green-400 font-bold flex items-center justify-center shrink-0 overflow-hidden ${className}`}>
      {url && !falhou
        ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setFalhou(true)} />
        : (nome || '?').charAt(0).toUpperCase()}
    </span>
  )
}
