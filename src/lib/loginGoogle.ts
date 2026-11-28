// Entrar com o Google.
// - Site (navegador): o Supabase leva para a tela do Google e volta para o site já com a sessão.
// - App Android: o Google não deixa fazer login dentro do app (WebView), então o login abre no navegador do
//   celular e volta para o app pelo endereço br.com.r2fitpro.app://login (app 1.9.3+, plugin NavegadorNativo).
//   No app usamos PKCE: o código que volta só vale junto com um segredo guardado no próprio app.
// O botão só aparece quando o Google estiver ligado no Supabase (Authentication → Sign In / Providers → Google).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Endereço de volta para o app (precisa estar nas Redirect URLs do Supabase e no AndroidManifest). */
export const RETORNO_APP = 'br.com.r2fitpro.app://login'
const CHAVE_PKCE = 'r2fit-login-google-app'
const EVENTO_ERRO = 'r2:erro-login-google'

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (nome: string) => boolean
  registerPlugin?: <T>(nome: string) => T
  Plugins?: Record<string, unknown>
}
const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
const ehApp = () => !!cap()?.isNativePlatform?.()
function pluginNativo<T>(nome: string): T | null {
  const c = cap()
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.(nome)) return null
  return (c.registerPlugin?.<T>(nome) ?? (c.Plugins?.[nome] as T | undefined)) ?? null
}
interface Navegador { abrir(o: { url: string }): Promise<void> }

let googleLigadoCache: Promise<boolean> | null = null
/** O Google está ligado no Supabase? (configuração pública do Auth). Sem resposta: considera desligado. */
export function googleLigado(): Promise<boolean> {
  if (!googleLigadoCache) {
    googleLigadoCache = fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => j?.external?.google === true)
      .catch(() => { googleLigadoCache = null; return false })
  }
  return googleLigadoCache
}

/** Dá para entrar com o Google aqui? No app antigo (antes da 1.9.3) não: falta abrir o navegador e voltar. */
export async function podeEntrarComGoogle(): Promise<boolean> {
  if (ehApp() && !pluginNativo<Navegador>('NavegadorNativo')) return false
  return googleLigado()
}

// Cliente só para o login do app: guarda o segredo do PKCE e nunca renova a sessão sozinho
// (quem cuida da sessão é o cliente principal; dois renovando o mesmo token derrubariam a sessão).
let clientePkce: SupabaseClient | null = null
const pkce = () => (clientePkce ??= createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce', storageKey: CHAVE_PKCE, autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
}))

/** Abre o login do Google. `destino` é a rota interna para onde ir depois (só no site). */
export async function entrarComGoogle(destino: string): Promise<void> {
  const queryParams = { prompt: 'select_account' }
  if (!ehApp()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${destino}`, queryParams },
    })
    if (error) throw error
    return
  }
  const nav = pluginNativo<Navegador>('NavegadorNativo')
  if (!nav) throw new Error('Atualize o app para entrar com o Google.')
  const { data, error } = await pkce().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: RETORNO_APP, skipBrowserRedirect: true, queryParams },
  })
  if (error) throw error
  if (!data.url) throw new Error('Não deu para abrir o login do Google.')
  await nav.abrir({ url: data.url })
}

function avisarErro(msg: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ERRO, { detail: msg }))
}
/** A tela de login escuta os erros que chegam na volta do Google para o app. */
export function aoErroLoginGoogle(cb: (msg: string) => void): () => void {
  const f = (e: Event) => cb(String((e as CustomEvent).detail ?? ''))
  window.addEventListener(EVENTO_ERRO, f)
  return () => window.removeEventListener(EVENTO_ERRO, f)
}

let tratando = ''
/** Volta do navegador para o app: troca o código pela sessão e entrega a sessão ao cliente principal. */
async function tratarRetorno(url: string) {
  if (!url.startsWith(RETORNO_APP) || tratando === url) return
  tratando = url
  let params: URLSearchParams
  try {
    const u = new URL(url)
    params = new URLSearchParams(u.search)
    new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => { if (!params.has(k)) params.set(k, v) })
  } catch { return }
  const erro = params.get('error_description') ?? params.get('error')
  if (erro) { avisarErro(erro); return }
  const code = params.get('code')
  if (!code) return
  try {
    const { data, error } = await pkce().auth.exchangeCodeForSession(code)
    if (error || !data.session) throw error ?? new Error('Login do Google não concluído.')
    const { error: e2 } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    if (e2) throw e2
  } catch (e) {
    avisarErro(e instanceof Error ? e.message : 'Login do Google não concluído.')
  } finally {
    try { localStorage.removeItem(CHAVE_PKCE); localStorage.removeItem(`${CHAVE_PKCE}-code-verifier`) } catch { /* ignore */ }
  }
}

interface AppUrl {
  addListener(ev: 'appUrlOpen', cb: (e: { url: string }) => void): unknown
  getLaunchUrl?: () => Promise<{ url?: string } | undefined>
}
let escutando = false
/** No app: escuta a volta do Google (app aberto ou aberto do zero pelo link). */
export function escutarRetornoGoogle() {
  if (escutando || !ehApp()) return
  const app = pluginNativo<AppUrl>('App')
  if (!app?.addListener) return
  escutando = true
  app.addListener('appUrlOpen', ({ url }) => { void tratarRetorno(url) })
  app.getLaunchUrl?.().then(r => { if (r?.url) void tratarRetorno(r.url) }).catch(() => {})
}
