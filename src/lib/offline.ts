// Sem internet: guarda no aparelho as leituras do banco e põe numa fila as gravações feitas offline.
// Ao voltar a internet a fila é enviada na ordem, com o login atual. Nada se perde em silêncio:
//  - erro de rede ou do servidor (5xx, 429, 408) → tenta de novo depois;
//  - recusa definitiva do servidor → sai da fila e vai para "não foi possível salvar" (aviso na tela);
//  - sem espaço no aparelho → a gravação dá erro na hora (a tela avisa), nunca finge que salvou.
// Tudo é separado por usuário: a fila e as leituras de uma conta nunca aparecem nem são enviadas em outra.
import { TABELAS_OFFLINE, aplicarOp, combina, prepararOp, respostaDaFila, tabelaDe, type OpFila } from './offlineBase'

const CHAVE_CACHE = 'r2-off-cache'
const CHAVE_FILA = 'r2-off-fila'
const CHAVE_FALHAS = 'r2-off-falhas'
const EVENTO = 'r2-offline'
const MAX_BYTES_CACHE = 1_500_000
const MAX_ITEM = 200_000
const MAX_TENTATIVAS_401 = 5

/** Leituras guardadas só destas tabelas (as do dia a dia); listas do admin e dados de outras pessoas não ficam no aparelho. */
const LEITURAS = new Set([...TABELAS_OFFLINE, 'alimentos_base', 'profiles', 'lembretes', 'fotos_evolucao', 'personais'])

export type Op = OpFila & { uid: string; tentativas?: number }
export interface Falha { op: Op; status: number; motivo: string; em: number }
type Cache = Record<string, { dados: unknown; em: number; tam: number }>

const ler = <T,>(k: string, padrao: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? padrao } catch { return padrao } }
const lerCache = () => ler<Cache>(CHAVE_CACHE, {})
const lerTodaFila = () => ler<Op[]>(CHAVE_FILA, [])
const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO))

let uidAtual: string | null = null
/** Fila do usuário logado agora. */
export const lerFila = () => lerTodaFila().filter(o => o.uid === uidAtual)
export const lerFalhas = () => ler<Falha[]>(CHAVE_FALHAS, []).filter(f => f.op.uid === uidAtual)
export function dispensarFalhas() {
  try { localStorage.setItem(CHAVE_FALHAS, JSON.stringify(ler<Falha[]>(CHAVE_FALHAS, []).filter(f => f.op.uid !== uidAtual))) } catch { /* ignore */ }
  avisarMudanca()
}

/** Grava a fila. Sem espaço: libera as leituras guardadas e tenta de novo; se ainda faltar, dá erro (nunca perde calado). */
function gravarFila(f: Op[]) {
  const txt = JSON.stringify(f)
  try { localStorage.setItem(CHAVE_FILA, txt) } catch {
    try { localStorage.removeItem(CHAVE_CACHE); localStorage.setItem(CHAVE_FILA, txt) } catch {
      throw new Error('Sem espaço no celular para guardar o registro. Libere espaço ou conecte à internet.')
    }
  }
  avisarMudanca()
}

function guardarLeitura(chave: string, dados: unknown) {
  const txt = JSON.stringify(dados)
  if (txt.length > MAX_ITEM) return
  const c = lerCache()
  c[chave] = { dados, em: Date.now(), tam: txt.length }
  // limite por tamanho total: sai o que foi lido há mais tempo
  let total = Object.values(c).reduce((s, v) => s + (v.tam ?? 0), 0)
  for (const k of Object.keys(c).sort((a, b) => c[a].em - c[b].em)) {
    if (total <= MAX_BYTES_CACHE) break
    if (k === chave) continue
    total -= c[k].tam ?? 0
    delete c[k]
  }
  try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(c)) } catch { try { localStorage.removeItem(CHAVE_CACHE) } catch { /* ignore */ } }
}

/** Sair da conta (sem nada pendente): apaga o que estava guardado deste usuário no aparelho. */
export function limparOffline() {
  try {
    const uid = uidAtual
    localStorage.setItem(CHAVE_FILA, JSON.stringify(lerTodaFila().filter(o => o.uid !== uid)))
    localStorage.setItem(CHAVE_FALHAS, JSON.stringify(ler<Falha[]>(CHAVE_FALHAS, []).filter(f => f.op.uid !== uid)))
    const c = lerCache()
    for (const k of Object.keys(c)) if (k.startsWith(`${uid}|`)) delete c[k]
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(c))
  } catch { /* ignore */ }
  avisarMudanca()
}

const json = (corpo: unknown, status = 200, base?: Headers) => {
  // mantém os cabeçalhos da resposta original (Content-Range com a contagem, por exemplo)
  const headers = new Headers(base)
  headers.set('Content-Type', 'application/json')
  headers.delete('Content-Length'); headers.delete('Content-Encoding')
  return new Response(corpo === null || status === 204 ? null : JSON.stringify(corpo), { status, headers })
}
const caminho = (url: string) => { const u = new URL(url); return u.pathname + u.search }
const semRede = (e: unknown) => e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)
const cabecalhosDe = (init?: RequestInit): Record<string, string> => {
  const h = new Headers(init?.headers)
  const out: Record<string, string> = {}
  for (const k of ['Prefer', 'Accept', 'Content-Type', 'Content-Profile', 'Accept-Profile']) { const v = h.get(k); if (v) out[k] = v }
  return out
}
/** Usuário do pedido (o "sub" do token do login); sem login, "anon". */
function uidDoToken(tk: string | null | undefined): string {
  if (!tk) return 'anon'
  try {
    const p = tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return String(JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4))).sub ?? 'anon')
  } catch { return 'anon' }
}

/** Leitura com as gravações da fila por cima (a tela mostra o que a pessoa fez, mesmo antes de sincronizar). */
function comFila(urlLeitura: string, dados: unknown) {
  return lerFila().reduce((d, op) => aplicarOp(urlLeitura, d, op), dados)
}

/** Linhas que uma alteração atinge: leituras guardadas (já com a fila por cima) e linhas criadas na fila. */
function linhasAtingidas(op: Op): Record<string, unknown>[] {
  const t = tabelaDe(op.url)
  const achadas = new Map<string, Record<string, unknown>>()
  const juntar = (l: unknown) => {
    if (l && typeof l === 'object' && !Array.isArray(l) && combina(l as Record<string, unknown>, op.url)) {
      const r = l as Record<string, unknown>
      achadas.set(String(r.id ?? JSON.stringify(r)), { ...(achadas.get(String(r.id)) ?? {}), ...r })
    }
  }
  for (const [chave, v] of Object.entries(lerCache())) {
    if (!chave.startsWith(`${op.uid}|`) || tabelaDe(chave) !== t) continue
    const d = comFila(chave.slice(chave.indexOf('|') + 1).split('#')[0], v.dados)
    for (const l of Array.isArray(d) ? d : [d]) juntar(l)
  }
  for (const q of lerFila()) if (q.metodo === 'POST' && tabelaDe(q.url) === t) for (const l of Array.isArray(q.corpo) ? q.corpo : [q.corpo]) juntar(l)
  return [...achadas.values()]
}

let base = ''
let chaveApi = ''
let token: () => Promise<string | null> = async () => null
// gravações com internet vão uma de cada vez, na ordem em que foram feitas (uma não passa a outra)
let escritas: Promise<unknown> = Promise.resolve()

/** fetch do cliente Supabase: guarda leituras, responde do aparelho sem internet e enfileira gravações. */
export function criarFetchOffline(urlSupabase: string, anonKey: string, pegarToken: () => Promise<string | null>): typeof fetch {
  base = urlSupabase.replace(/\/+$/, ''); chaveApi = anonKey; token = pegarToken
  const original = globalThis.fetch.bind(globalThis)
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (!url.startsWith(base + '/rest/v1/')) return original(input, init)
    const cab = cabecalhosDe(init)
    const uid = uidDoToken(new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, ''))
    uidAtual = uid
    const t = tabelaDe(url)
    const leitura = caminho(url)

    if (metodo === 'GET') {
      const chave = `${uid}|${leitura}#${cab.Accept ?? ''}`
      const guarda = !!t && LEITURAS.has(t) && uid !== 'anon'
      try {
        const r = await original(input, init)
        if (guarda && r.ok && r.status === 200) {
          const dados = await r.clone().json().catch(() => undefined)
          if (dados !== undefined) {
            guardarLeitura(chave, dados)
            if (lerFila().some(o => tabelaDe(o.url) === t)) return json(comFila(leitura, dados), 200, r.headers)
          }
        }
        return r
      } catch (e) {
        const guardado = guarda ? lerCache()[chave] : undefined
        if (semRede(e) && guardado) return json(comFila(leitura, guardado.dados))
        // lista nunca aberta antes, mas com registros feitos sem internet: mostra os registros
        if (semRede(e) && guarda && lerFila().some(o => tabelaDe(o.url) === t)) {
          return json(comFila(leitura, /vnd\.pgrst\.object/.test(cab.Accept ?? '') ? null : []))
        }
        throw e
      }
    }

    if (!t || !TABELAS_OFFLINE.has(t) || !['POST', 'PATCH', 'DELETE'].includes(metodo) || uid === 'anon') return original(input, init)
    let corpo: unknown = null
    try { corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { return original(input, init) }
    // o id da linha nova é criado aqui, antes da primeira tentativa: se a internet cair no meio, o reenvio não duplica
    const op: Op = { ...prepararOp({ id: crypto.randomUUID(), metodo: metodo as OpFila['metodo'], url: leitura, corpo, cabecalhos: cab, em: Date.now() }, () => crypto.randomUUID()), uid }

    const enfileirar = () => {
      gravarFila([...lerTodaFila(), op]) // sem espaço: lança erro e a tela avisa
      const resp = respostaDaFila(op)
      if (op.metodo === 'PATCH' && resp.corpo !== null) {
        // pediu a linha de volta: a linha inteira (guardada ou criada na fila) já alterada, nunca só os campos mudados
        const linhas = linhasAtingidas(op).map(l => ({ ...l, ...(op.corpo as object) }))
        if (!linhas.length) throw new TypeError('sem a linha no aparelho')
        resp.corpo = Array.isArray(resp.corpo) ? linhas : linhas[0]
      }
      return json(resp.corpo, resp.status)
    }
    const enviar = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return enfileirar()
      // já tem coisa esperando: entra no fim da fila (a ordem das gravações importa)
      if (lerFila().length) { const r = enfileirar(); sincronizar().catch(() => {}); return r }
      try {
        return await original(base + op.url, { ...init, body: op.corpo === null ? init?.body : JSON.stringify(op.corpo) })
      } catch (e) {
        if (semRede(e)) return enfileirar()
        throw e
      }
    }
    const p = escritas.then(enviar, enviar)
    escritas = p.catch(() => {})
    return p
  }
}

let sincronizando: Promise<void> | null = null
async function passarFila() {
  const original = globalThis.fetch.bind(globalThis)
  for (;;) {
    const tk = await token().catch(() => null)
    if (!tk) return // sem login agora: espera
    uidAtual = uidDoToken(tk)
    const op = lerFila()[0]
    if (!op || !base) return
    let r: Response
    try {
      r = await original(base + op.url, {
        method: op.metodo, body: op.corpo === null ? undefined : JSON.stringify(op.corpo),
        headers: { ...op.cabecalhos, apikey: chaveApi, Authorization: `Bearer ${tk}`, Prefer: (op.cabecalhos.Prefer ?? '').replace(/return=representation/, 'return=minimal') || 'return=minimal' },
      })
    } catch { return } // sem internet: tenta depois
    const tirar = () => gravarFila(lerTodaFila().filter(x => x.id !== op.id))
    if (r.ok) { tirar(); continue }
    if (r.status >= 500 || r.status === 429 || r.status === 408) return // servidor com problema: tenta depois
    if (r.status === 401 && (op.tentativas ?? 0) < MAX_TENTATIVAS_401) {
      gravarFila(lerTodaFila().map(x => (x.id === op.id ? { ...x, tentativas: (x.tentativas ?? 0) + 1 } : x)))
      return
    }
    const erro = await r.json().catch(() => ({})) as { code?: string; message?: string }
    // a mesma linha já tinha chegado (reenvio depois de a internet cair no meio): está salva
    if (r.status === 409 && erro.code === '23505' && /pkey/.test(erro.message ?? '')) { tirar(); continue }
    try {
      localStorage.setItem(CHAVE_FALHAS, JSON.stringify([...ler<Falha[]>(CHAVE_FALHAS, []), { op, status: r.status, motivo: erro.message ?? '', em: Date.now() }].slice(-50)))
    } catch { /* ignore */ }
    console.warn('[offline] gravação recusada pelo servidor', r.status, op.url, erro.message)
    tirar()
  }
}

/** Envia a fila na ordem (uma aba de cada vez). */
export function sincronizar(): Promise<void> {
  if (sincronizando) return sincronizando
  const locks = (navigator as unknown as { locks?: { request: (n: string, f: () => Promise<void>) => Promise<void> } }).locks
  const p: Promise<void> = locks ? locks.request('r2-sincronizar', () => passarFila()) : passarFila()
  sincronizando = p.finally(() => { sincronizando = null; avisarMudanca() })
  return sincronizando as Promise<void>
}

/** Usuário do login atual (para a faixa e a saída da conta). */
export async function atualizarUsuarioOffline() { uidAtual = uidDoToken(await token().catch(() => null)); avisarMudanca() }

/** Liga a sincronização automática: ao abrir, ao voltar a internet e de tempos em tempos enquanto houver fila. */
export function iniciarOffline() {
  const tentar = () => { if (lerTodaFila().length) sincronizar().catch(() => {}) }
  window.addEventListener('online', tentar)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tentar() })
  setInterval(tentar, 30_000)
  setTimeout(() => { atualizarUsuarioOffline().then(tentar) }, 1500)
}

export const EVENTO_OFFLINE = EVENTO
