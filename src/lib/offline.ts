// Sem internet: guarda no aparelho as leituras do banco e põe numa fila as gravações feitas offline.
// Ao voltar a internet a fila é enviada na ordem, com o login atual. Nada se perde: se o envio falhar
// por falta de internet, tenta de novo depois; só sai da fila o que o servidor aceitou ou recusou de vez.
import { TABELAS_OFFLINE, aplicarOp, combina, prepararOp, respostaDaFila, tabelaDe, type OpFila } from './offlineBase'

const CHAVE_CACHE = 'r2-off-cache'
const CHAVE_FILA = 'r2-off-fila'
const EVENTO = 'r2-offline'
const MAX_CACHE = 200
const MAX_ITEM = 300_000

type Cache = Record<string, { dados: unknown; em: number }>

const ler = <T,>(k: string, padrao: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T } catch { return padrao } }
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* cheio: segue sem guardar */ } }
const lerCache = () => ler<Cache>(CHAVE_CACHE, {})
export const lerFila = () => ler<OpFila[]>(CHAVE_FILA, [])
const gravarFila = (f: OpFila[]) => { gravar(CHAVE_FILA, f); window.dispatchEvent(new Event(EVENTO)) }

function guardarLeitura(chave: string, dados: unknown) {
  const txt = JSON.stringify(dados)
  if (txt.length > MAX_ITEM) return
  const c = lerCache()
  c[chave] = { dados, em: Date.now() }
  const chaves = Object.keys(c)
  if (chaves.length > MAX_CACHE) chaves.sort((a, b) => c[a].em - c[b].em).slice(0, chaves.length - MAX_CACHE).forEach(k => delete c[k])
  gravar(CHAVE_CACHE, c)
}

/** Sair da conta: apaga o que estava guardado deste usuário no aparelho. */
export function limparOffline() { try { localStorage.removeItem(CHAVE_CACHE); localStorage.removeItem(CHAVE_FILA) } catch { /* ignore */ } }

const json = (corpo: unknown, status = 200) =>
  new Response(corpo === null || status === 204 ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const caminho = (url: string) => { const u = new URL(url); return u.pathname + u.search }
const semRede = (e: unknown) => e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)
const cabecalhosDe = (init?: RequestInit): Record<string, string> => {
  const h = new Headers(init?.headers)
  const out: Record<string, string> = {}
  for (const k of ['Prefer', 'Accept', 'Content-Type', 'Content-Profile', 'Accept-Profile']) { const v = h.get(k); if (v) out[k] = v }
  return out
}

/** Leitura com as gravações da fila por cima (a tela mostra o que a pessoa fez, mesmo antes de sincronizar). */
function comFila(chave: string, dados: unknown) {
  const url = chave.split('#')[0]
  return lerFila().reduce((d, op) => aplicarOp(url, d, op), dados)
}

/** Linhas guardadas que uma alteração atinge (para devolver a linha inteira quando a tela pede de volta). */
function linhasGuardadas(op: OpFila): Record<string, unknown>[] {
  const t = tabelaDe(op.url)
  const achadas = new Map<string, Record<string, unknown>>()
  for (const [chave, v] of Object.entries(lerCache())) {
    if (tabelaDe(chave) !== t) continue
    const lista = (Array.isArray(v.dados) ? v.dados : [v.dados]) as Record<string, unknown>[]
    for (const l of lista) if (l && typeof l === 'object' && combina(l, op.url)) achadas.set(String(l.id ?? JSON.stringify(l)), l)
  }
  return [...achadas.values()]
}

let base = ''
let chaveApi = ''
let token: () => Promise<string | null> = async () => null

/** fetch do cliente Supabase: guarda leituras, responde do aparelho sem internet e enfileira gravações. */
export function criarFetchOffline(urlSupabase: string, anonKey: string, pegarToken: () => Promise<string | null>): typeof fetch {
  base = urlSupabase; chaveApi = anonKey; token = pegarToken
  const original = globalThis.fetch.bind(globalThis)
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (!url.startsWith(base + '/rest/v1/')) return original(input, init)
    const cab = cabecalhosDe(init)
    const chave = caminho(url) + '#' + (cab.Accept ?? '')

    if (metodo === 'GET') {
      try {
        const r = await original(input, init)
        if (r.ok && r.status === 200) {
          const dados = await r.clone().json().catch(() => undefined)
          if (dados !== undefined) {
            guardarLeitura(chave, dados)
            if (lerFila().length) return json(comFila(chave, dados))
          }
        }
        return r
      } catch (e) {
        const guardado = lerCache()[chave]
        if (semRede(e) && guardado) return json(comFila(chave, guardado.dados))
        throw e
      }
    }

    const t = tabelaDe(url)
    if (!t || !TABELAS_OFFLINE.has(t) || !['POST', 'PATCH', 'DELETE'].includes(metodo)) return original(input, init)
    let corpo: unknown = null
    try { corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { return original(input, init) }
    const enfileirar = () => {
      const op = prepararOp({ id: crypto.randomUUID(), metodo: metodo as OpFila['metodo'], url: caminho(url), corpo, cabecalhos: cab, em: Date.now() }, () => crypto.randomUUID())
      gravarFila([...lerFila(), op])
      const resp = respostaDaFila(op)
      // alteração que pede a linha de volta: devolve a linha guardada já alterada
      if (op.metodo === 'PATCH' && resp.corpo !== null) {
        const linhas = linhasGuardadas(op).map(l => ({ ...l, ...(op.corpo as object) }))
        resp.corpo = Array.isArray(resp.corpo) ? linhas : (linhas[0] ?? resp.corpo)
      }
      return json(resp.corpo, resp.status)
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return enfileirar()
    // já tem coisa esperando: entra no fim da fila (a ordem das gravações importa)
    if (lerFila().length) { const r = enfileirar(); sincronizar().catch(() => {}); return r }
    try {
      return await original(input, init)
    } catch (e) {
      if (semRede(e)) return enfileirar()
      throw e
    }
  }
}

let sincronizando: Promise<void> | null = null
/** Envia a fila na ordem. Para no primeiro erro de rede (tenta depois); recusa definitiva do servidor sai da fila. */
export function sincronizar(): Promise<void> {
  if (sincronizando) return sincronizando
  sincronizando = (async () => {
    const original = globalThis.fetch.bind(globalThis)
    for (;;) {
      const fila = lerFila()
      if (!fila.length || !base) break
      const op = fila[0]
      const tk = await token().catch(() => null)
      if (!tk) break // sem login agora: espera
      let r: Response
      try {
        r = await original(base + op.url, {
          method: op.metodo, body: op.corpo === null ? undefined : JSON.stringify(op.corpo),
          headers: { ...op.cabecalhos, apikey: chaveApi, Authorization: `Bearer ${tk}`, Prefer: (op.cabecalhos.Prefer ?? '').replace(/return=representation/, 'return=minimal') || 'return=minimal' },
        })
      } catch { break }
      if (r.status === 401) break // login vencido: tenta quando renovar
      if (!r.ok && r.status !== 409) console.warn('[offline] gravação recusada pelo servidor', r.status, op.url)
      gravarFila(lerFila().filter(x => x.id !== op.id))
    }
  })().finally(() => { sincronizando = null })
  return sincronizando
}

/** Liga a sincronização automática: ao abrir, ao voltar a internet e de tempos em tempos enquanto houver fila. */
export function iniciarOffline() {
  const tentar = () => { if (lerFila().length) sincronizar().catch(() => {}) }
  window.addEventListener('online', tentar)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tentar() })
  setInterval(tentar, 30_000)
  setTimeout(tentar, 2000)
}

export const EVENTO_OFFLINE = EVENTO
