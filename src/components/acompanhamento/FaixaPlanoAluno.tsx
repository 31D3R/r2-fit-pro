import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import type { DonoDoPlano } from '../../lib/planoDoAluno'

const TEXTO = { treino: 'o treino', dieta: 'a dieta', meta: 'a meta e os parâmetros', ergogenicos: 'os ergogênicos' } as const

/** Faixa no topo quando o personal está editando o plano de um aluno. */
export default function FaixaPlanoAluno({ dono, oque }: { dono: DonoDoPlano; oque: 'treino' | 'dieta' | 'meta' | 'ergogenicos' | 'fotos' }) {
  if (!dono.deAluno) return null
  const quem = dono.nome || 'seu aluno'
  return (
    <div role="note" className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-3 flex items-start gap-2.5">
      <Users className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <p className="text-violet-100">{oque === 'fotos' ? 'Fotos de evolução' : `Você está editando ${TEXTO[oque]}`} de <strong>{quem}</strong>.</p>
        <p className="text-violet-200/80 text-xs mt-0.5">{oque === 'fotos' ? 'O aluno liberou para você ver. Ele pode desligar quando quiser.' : 'Tudo que você mudar aparece na hora para o aluno, e ele recebe um aviso.'}</p>
        {dono.alunoId && <Link to={`/alunos/${dono.alunoId}`} className="inline-block mt-1.5 text-xs font-semibold text-violet-300 underline">Voltar para o painel de {quem}</Link>}
      </div>
    </div>
  )
}
