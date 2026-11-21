// Refeição da dieta → registros do diário: lógica pura (testada em tests/logica.test.ts).
import type { Alimento, Refeicao } from './diario'
import type { PlanoAlimentar } from './openai'
import { normalizar } from './busca'

/** Marca no diário de qual refeição da dieta veio o registro (para saber o que já foi feito e desfazer). */
export const origemDieta = (dietaId: string, refeicao: number, nome?: string) => {
  const n = normalizar(nome ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
  return `dieta:${dietaId}:${refeicao}${n ? `:${n}` : ''}`
}

/**
 * Alimentos da refeição para o diário. A dieta só traz as calorias de cada alimento: os macros são
 * estimados pela proporção de calorias do alimento no total da dieta (o dia fecha com os macros do plano).
 */
export function alimentosDaRefeicao(plano: PlanoAlimentar, idx: number): Alimento[] {
  const r = plano.refeicoes?.[idx]
  if (!r) return []
  const total = (plano.refeicoes ?? []).reduce((s, x) => s + (x.alimentos ?? []).reduce((t, a) => t + (Number(a.calorias) || 0), 0), 0)
  const m = plano.macros
  const um = (v: number) => Math.round(v * 10) / 10
  return (r.alimentos ?? []).filter(a => a.nome?.trim()).map(a => {
    const kcal = Math.max(0, Math.round(Number(a.calorias) || 0))
    const f = m && total > 0 ? kcal / total : 0
    return { nome: a.nome.trim(), quantidade: a.quantidade ?? '', calorias: kcal,
      proteina_g: um((m?.proteina_g ?? 0) * f), carboidrato_g: um((m?.carboidrato_g ?? 0) * f), gordura_g: um((m?.gordura_g ?? 0) * f) }
  })
}

/** Refeição do diário para o nome da refeição da dieta ("Café da Manhã", "Lanche da tarde", "Ceia"...). */
export function refeicaoDoDiario(nome: string | undefined): Refeicao {
  const n = normalizar(nome ?? '')
  return n.includes('cafe') ? 'Café da manhã' : n.includes('almoco') ? 'Almoço' : n.includes('jantar') ? 'Jantar' : 'Lanches'
}

