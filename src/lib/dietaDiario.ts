// Refeição da dieta marcada como feita: vira registros no diário de hoje (testado em tests/logica.test.ts).
import { useCallback, useEffect, useState } from 'react'
import { useHoje } from './useHoje'
import { supabase } from './supabase'
import { alimentosDaRefeicao, origemDieta, refeicaoDoDiario } from './dietaDiarioBase'
import type { PlanoAlimentar } from './openai'

export { alimentosDaRefeicao, origemDieta, refeicaoDoDiario }

/** Refeições da dieta já lançadas hoje, marcar (lança no diário) e desfazer (apaga o que foi lançado). */
export function useRefeicoesFeitas(userId: string | undefined, dietaId: string, plano: PlanoAlimentar | null) {
  const [feitas, setFeitas] = useState<Set<number>>(new Set())
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const hoje = useHoje()
  const recarregar = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('food_logs').select('origem').eq('user_id', userId).eq('data', hoje).like('origem', `dieta:${dietaId}:%`)
    // só conta a refeição se o registro bate com ela (dieta editada e refeições trocadas de lugar não marcam a errada)
    const origens = new Set(((data ?? []) as { origem: string }[]).map(x => x.origem))
    setFeitas(new Set((plano?.refeicoes ?? []).map((_, i) => i).filter(i => origens.has(origemDieta(dietaId, i, plano?.refeicoes?.[i]?.nome)))))
  }, [userId, dietaId, hoje, plano])
  useEffect(() => { recarregar() }, [recarregar])

  const marcar = async (idx: number) => {
    if (!userId || !plano) return
    setOcupada(idx); setErro('')
    // já lançada (toque duplo, outro aparelho): não lança de novo
    const { data: ja } = await supabase.from('food_logs').select('id').eq('user_id', userId).eq('data', hoje).eq('origem', origemDieta(dietaId, idx, plano?.refeicoes?.[idx]?.nome)).limit(1)
    if (ja?.length) { setFeitas(s => new Set(s).add(idx)); setOcupada(null); return }
    const r = plano.refeicoes?.[idx]
    const linhas = alimentosDaRefeicao(plano, idx).map(a => ({
      user_id: userId, data: hoje, refeicao: refeicaoDoDiario(r?.nome), ...a,
      observacao: null, origem: origemDieta(dietaId, idx, plano?.refeicoes?.[idx]?.nome),
    }))
    const { error } = await supabase.from('food_logs').insert(linhas)
    if (error) setErro('Não foi possível lançar no diário. Confira a internet e tente de novo.')
    else setFeitas(s => new Set(s).add(idx))
    setOcupada(null)
  }
  const desfazer = async (idx: number) => {
    if (!userId) return
    setOcupada(idx); setErro('')
    const { error } = await supabase.from('food_logs').delete().eq('user_id', userId).eq('data', hoje).eq('origem', origemDieta(dietaId, idx, plano?.refeicoes?.[idx]?.nome))
    if (error) setErro('Não foi possível desfazer. Tente de novo.')
    else setFeitas(s => { const n = new Set(s); n.delete(idx); return n })
    setOcupada(null)
  }
  return { feitas, ocupada, erro, marcar, desfazer }
}
