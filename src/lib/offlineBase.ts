// Sem internet: lógica pura (testada em tests/logica.test.ts).
// As leituras do banco (REST do Supabase) ficam guardadas no aparelho; as gravações feitas sem internet entram numa
// fila e são aplicadas por cima das leituras guardadas (a tela mostra o que a pessoa fez) até sincronizar.

export interface OpFila {
  id: string
  metodo: 'POST' | 'PATCH' | 'DELETE'
  /** caminho + busca do REST, ex.: /rest/v1/food_logs?id=eq.x */
  url: string
  corpo: unknown
  /** cabeçalhos que importam para o PostgREST (Prefer, Accept, Content-Type) */
  cabecalhos: Record<string, string>
  em: number
}

/** Tabelas que podem ser gravadas sem internet (o resto precisa do servidor: pagamentos, IA, convites...). */
export const TABELAS_OFFLINE = new Set([
  'food_logs', 'registros_agua', 'registros_peso', 'exercicios_registro', 'sessoes_treino', 'medidas_corporais',
  'user_settings', 'treinos', 'dietas', 'receitas', 'alimentos_favoritos', 'metas_nutricionais',
])
/** Tabelas sem coluna id (a chave é outra). */
const SEM_ID = new Set(['user_settings', 'metas_nutricionais'])

export const tabelaDe = (url: string) => {
  const m = url.match(/\/rest\/v1\/([a-z_]+)(?:\?|$)/)
  return m && !url.includes('/rest/v1/rpc/') ? m[1] : null
}

/** Filtros simples do PostgREST na URL (coluna=op.valor). Filtros que não sabemos ler (or/and) contam como "combina". */
export function filtrosDe(url: string): { col: string; op: string; val: string }[] | null {
  const q = url.split('?')[1] ?? ''
  const out: { col: string; op: string; val: string }[] = []
  for (const par of q.split('&').filter(Boolean)) {
    const i = par.indexOf('=')
    const col = decodeURIComponent(par.slice(0, i)), v = decodeURIComponent(par.slice(i + 1))
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue
    if (col === 'or' || col === 'and') return null
    const j = v.indexOf('.')
    if (j < 0) continue
    out.push({ col, op: v.slice(0, j), val: v.slice(j + 1) })
  }
  return out
}

/** A linha aparece numa leitura com esses filtros? */
export function combina(linha: Record<string, unknown>, url: string): boolean {
  const fs = filtrosDe(url)
  if (!fs) return true
  return fs.every(({ col, op, val }) => {
    const x = linha[col]
    if (x === undefined) return true // coluna que a gravação não mandou: não dá para saber, mostra
    const s = x === null ? 'null' : String(x)
    switch (op) {
      case 'eq': return s === val
      case 'neq': return s !== val
      case 'gte': return s >= val
      case 'gt': return s > val
      case 'lte': return s <= val
      case 'lt': return s < val
      case 'is': return val === 'null' ? x === null : val === 'true' ? x === true : val === 'false' ? x === false : true
      case 'in': return val.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, '')).includes(s)
      case 'like': case 'ilike': {
        const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', op === 'ilike' ? 'i' : '')
        return re.test(s)
      }
      default: return true
    }
  })
}

const ehUpsert = (op: OpFila) => /resolution=merge-duplicates/.test(op.cabecalhos.Prefer ?? op.cabecalhos.prefer ?? '')
const conflitoDe = (op: OpFila) => (op.url.match(/[?&]on_conflict=([^&]+)/)?.[1] ?? 'id').split(',').map(decodeURIComponent)

/** Gravação feita sem internet: insere um id nas linhas novas (para que alterações seguintes achem a linha). */
export function prepararOp(op: OpFila, novoId: () => string): OpFila {
  const t = tabelaDe(op.url)
  if (op.metodo !== 'POST' || !t || SEM_ID.has(t) || ehUpsert(op)) return op
  const comId = (l: unknown) => (l && typeof l === 'object' && !Array.isArray(l) && !(l as Record<string, unknown>).id ? { ...(l as object), id: novoId() } : l)
  return { ...op, corpo: Array.isArray(op.corpo) ? op.corpo.map(comId) : comId(op.corpo) }
}

/** Aplica uma gravação pendente sobre o resultado de uma leitura da mesma tabela. */
export function aplicarOp(urlLeitura: string, dados: unknown, op: OpFila): unknown {
  const t = tabelaDe(op.url)
  if (!t || tabelaDe(urlLeitura) !== t) return dados
  const lista = Array.isArray(dados) ? [...dados] as Record<string, unknown>[] : dados && typeof dados === 'object' ? [dados as Record<string, unknown>] : []
  const objeto = !Array.isArray(dados)
  if (op.metodo === 'POST') {
    const novas = (Array.isArray(op.corpo) ? op.corpo : [op.corpo]) as Record<string, unknown>[]
    const chaves = conflitoDe(op)
    for (const n of novas) {
      const i = ehUpsert(op) || n.id ? lista.findIndex(l => chaves.every(k => n[k] !== undefined && String(l[k]) === String(n[k]))) : -1
      if (i >= 0) lista[i] = { ...lista[i], ...n }
      else if (combina(n, urlLeitura)) lista.push(n)
    }
  } else if (op.metodo === 'PATCH') {
    for (let i = 0; i < lista.length; i++) if (combina(lista[i], op.url)) lista[i] = { ...lista[i], ...(op.corpo as object) }
  } else if (op.metodo === 'DELETE') {
    for (let i = lista.length - 1; i >= 0; i--) if (combina(lista[i], op.url)) lista.splice(i, 1)
  }
  return objeto ? (lista[0] ?? dados) : lista
}

/** Resposta que a tela recebe quando a gravação ficou na fila (como se o servidor tivesse aceitado). */
export function respostaDaFila(op: OpFila): { status: number; corpo: unknown } {
  const prefer = op.cabecalhos.Prefer ?? op.cabecalhos.prefer ?? ''
  const objeto = /vnd\.pgrst\.object/.test(op.cabecalhos.Accept ?? op.cabecalhos.accept ?? '')
  if (!/return=representation/.test(prefer)) return { status: op.metodo === 'POST' ? 201 : 204, corpo: null }
  const linhas = op.metodo === 'DELETE' ? [] : Array.isArray(op.corpo) ? op.corpo : [op.corpo]
  return { status: op.metodo === 'POST' ? 201 : 200, corpo: objeto ? (linhas[0] ?? null) : linhas }
}
