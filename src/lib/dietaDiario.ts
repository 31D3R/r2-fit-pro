// Refeição da dieta marcada como feita: vira registros no diário de hoje (testado em tests/logica.test.ts).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hojeLocal } from './diario'
import { alimentosDaRefeicao, origemDieta, refeicaoDoDiario } from './dietaDiarioBase'
import type { PlanoAlimentar } from './openai'

export { alimentosDaRefeicao, origemDieta, refeicaoDoDiario }

/** Refeições da dieta já lançadas hoje, marcar (lança no diário) e desfazer (apaga o que foi lançado). */
export function useRefeicoesFeitas(userId: string | undefined, dietaId: string, plano: PlanoAlimentar | null) {
  const [feitas, setFeitas] = useState<Set<number>>(new Set())
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const hoje = hojeLocal()
  const recarregar = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('food_logs').select('origem').eq('user_id', userId).eq('data', hoje).like('origem', `dieta:${dietaId}:%`)
    setFeitas(new Set(((data ?? []) as { origem: string }[]).map(x => Number(x.origem.split(':')[2])).filter(Number.isFinite)))
  }, [userId, dietaId, hoje])
  useEffect(() => { recarregar() }, [recarregar])

  const marcar = async (idx: number) => {
    if (!userId || !plano) return
    setOcupada(idx); setErro('')
    const r = plano.refeicoes?.[idx]
    const linhas = alimentosDaRefeicao(plano, idx).map(a => ({
      user_id: userId, data: hoje, refeicao: refeicaoDoDiario(r?.nome), ...a,
      observacao: null, origem: origemDieta(dietaId, idx),
    }))
    const { error } = await supabase.from('food_logs').insert(linhas)
    if (error) setErro('Não foi possível lançar no diário. Confira a internet e tente de novo.')
    else setFeitas(s => new Set(s).add(idx))
    setOcupada(null)
  }
  const desfazer = async (idx: number) => {
    if (!userId) return
    setOcupada(idx); setErro('')
    const { error } = await supabase.from('food_logs').delete().eq('user_id', userId).eq('data', hoje).eq('origem', origemDieta(dietaId, idx))
    if (error) setErro('Não foi possível desfazer. Tente de novo.')
    else setFeitas(s => { const n = new Set(s); n.delete(idx); return n })
    setOcupada(null)
  }
  return { feitas, ocupada, erro, marcar, desfazer }
}
