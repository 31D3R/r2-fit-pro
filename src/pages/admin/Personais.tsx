import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { adminPersonais, adminVerificarCref, type PersonalAdmin } from '../../lib/acompanhamento'
import { LINK_CONSULTA_CREF } from '../../lib/crefBase'
import { Spinner } from '../../components/UI'

/** Personais e o CREF: confira na consulta do CONFEF e marque como verificado. */
export default function Personais() {
  const [lista, setLista] = useState<PersonalAdmin[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const carregar = useCallback(() => { adminPersonais().then(setLista).catch(e => { setErro((e as Error).message); setLista([]) }) }, [])
  useEffect(() => { carregar() }, [carregar])
  const marcar = async (p: PersonalAdmin, ok: boolean) => {
    setOcupado(p.user_id)
    try { await adminVerificarCref(p.user_id, ok); carregar() } catch (e) { setErro((e as Error).message) }
    setOcupado(null)
  }
  if (!lista) return <div className="flex justify-center py-10"><Spinner /></div>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-400">O CONFEF não tem consulta automática. Abra a consulta, procure pelo nome ou número e marque como verificado. Mudar o CREF tira a verificação.</p>
      <a href={LINK_CONSULTA_CREF} target="_blank" rel="noopener noreferrer" className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-green-400">Abrir consulta do CONFEF <ExternalLink className="w-4 h-4" /></a>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum personal ainda.</p>}
      <ul className="flex flex-col gap-2">
        {lista.map(p => (
          <li key={p.user_id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 font-semibold text-zinc-100 truncate">{p.nome}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.cref_verificado ? 'bg-green-500/15 text-green-400' : p.cref ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>
                {p.cref_verificado ? 'verificado' : p.cref ? 'a verificar' : 'sem CREF'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 truncate">{p.email} · {p.alunos} aluno(s) · desde {new Date(p.desde).toLocaleDateString('pt-BR')}</p>
            <p className="text-sm text-zinc-300">CREF: <b>{p.cref ?? '—'}</b></p>
            {p.cref && (
              <div className="flex gap-2 mt-1">
                {p.cref_verificado
                  ? <button disabled={ocupado === p.user_id} onClick={() => marcar(p, false)} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700">Desfazer verificação</button>
                  : <button disabled={ocupado === p.user_id} onClick={() => marcar(p, true)} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-zinc-950 font-bold">Marcar como verificado</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
