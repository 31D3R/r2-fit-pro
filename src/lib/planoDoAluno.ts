// Plano aberto pelo personal: o treino ou a dieta é de um aluno (outra conta). A tela mostra uma faixa,
// esconde o que só faz sentido para o dono (contador, marcar feito, excluir) e as mudanças valem direto no aluno.
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { meusAlunos } from './acompanhamento'
import { hojeLocal } from './diario'

const nomes = new Map<string, string>()
let carregando: Promise<void> | null = null

export interface DonoDoPlano { deAluno: boolean; alunoId: string | null; nome: string }

/** `donoId` é o user_id do treino ou da dieta. */
export function useDonoDoPlano(donoId: string | null | undefined): DonoDoPlano {
  const { user } = useAuth()
  const deAluno = !!donoId && !!user && donoId !== user.id
  const [nome, setNome] = useState(() => (donoId ? nomes.get(donoId) ?? '' : ''))
  useEffect(() => {
    if (!deAluno || !donoId) return
    if (nomes.has(donoId)) { setNome(nomes.get(donoId)!); return }
    carregando ??= meusAlunos(hojeLocal()).then(l => { for (const a of l) nomes.set(a.aluno_id, a.nome) }).catch(() => {}).finally(() => { carregando = null })
    let vivo = true
    carregando.then(() => { if (vivo) setNome(nomes.get(donoId) ?? '') })
    return () => { vivo = false }
  }, [deAluno, donoId])
  return { deAluno, alunoId: deAluno ? donoId! : null, nome }
}
