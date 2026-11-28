import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Spinner } from '../components/UI'
import { Logo } from '../components/Logo'
import { carregarConfig } from '../lib/config'
import { traduzirErroAuth, validarEmail, validarSenha } from '../lib/formatos'
import { caminhoInterno } from '../lib/caminhoSeguro'
import VerificacaoHumana, { verificacaoLigada } from '../components/VerificacaoHumana'
import { aoErroLoginGoogle, entrarComGoogle, podeEntrarComGoogle } from '../lib/loginGoogle'

type Mode = 'login' | 'register'

// Proteção simples no cliente contra tentativas repetidas; o Supabase Auth
// aplica limites próprios por IP no servidor.
const CHAVE_TENTATIVAS = 'r2fit:login-falhas'
function bloqueioRestante(): number {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) ?? '{"n":0,"ate":0}')
    return Math.max(0, Math.ceil((r.ate - Date.now()) / 1000))
  } catch { return 0 }
}
function registrarFalha() {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) ?? '{"n":0,"ate":0}')
    const n = r.n + 1
    localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify({ n, ate: n >= 5 ? Date.now() + Math.min(60 * 2 ** (n - 5), 900) * 1000 : 0 }))
  } catch { /* sem storage */ }
}
const limparFalhas = () => { try { localStorage.removeItem(CHAVE_TENTATIVAS) } catch { /* ignore */ } }

/** Só permite redirecionar para rotas internas. */
const destinoSeguro = (next: string | null) => caminhoInterno(next) ?? '/dashboard'

export default function AuthPage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'cadastro' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [nome, setNome] = useState('')
  const [aceite, setAceite] = useState(false)
  const [marketing, setMarketing] = useState(false)
  // Contra robôs: verificação "não sou robô", campo-isca invisível e tempo mínimo para preencher o cadastro
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [versaoCaptcha, setVersaoCaptcha] = useState(0)
  const [isca, setIsca] = useState('')
  const abertoEm = useRef(Date.now())
  useEffect(() => { abertoEm.current = Date.now() }, [mode])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [podeReenviar, setPodeReenviar] = useState(false)
  const [espera, setEspera] = useState(bloqueioRestante())
  // Entrar com o Google: o botão só aparece quando o Google estiver ligado no Supabase (e no app 1.9.3+)
  const [comGoogle, setComGoogle] = useState(false)
  const [abrindoGoogle, setAbrindoGoogle] = useState(false)
  useEffect(() => {
    let vivo = true
    podeEntrarComGoogle().then(ok => { if (vivo) setComGoogle(ok) }).catch(() => {})
    const parar = aoErroLoginGoogle(msg => { setAbrindoGoogle(false); setError(traduzirErroAuth(msg)) })
    return () => { vivo = false; parar() }
  }, [])

  useEffect(() => {
    if (espera <= 0) return
    const t = setInterval(() => setEspera(bloqueioRestante()), 1000)
    return () => clearInterval(t)
  }, [espera])

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Spinner size="lg" /></div>
  }
  if (user) return <Navigate to={destinoSeguro(params.get('next'))} replace />

  const redirect = `${window.location.origin}${destinoSeguro(params.get('next'))}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess(''); setPodeReenviar(false)
    if (!validarEmail(email)) { setError('Informe um e-mail válido.'); return }

    if (mode === 'register') {
      if (nome.trim().length < 2) { setError('Informe seu nome.'); return }
      const erroSenha = validarSenha(password)
      if (erroSenha) { setError(erroSenha); return }
      if (password !== confirmar) { setError('As senhas não conferem.'); return }
      if (!aceite) { setError('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.'); return }
    } else {
      if (!password) { setError('Informe sua senha.'); return }
      if (bloqueioRestante() > 0) { setEspera(bloqueioRestante()); return }
    }

    if (mode === 'register') {
      // robô que preenche tudo (até o campo escondido) ou envia em menos de 2,5 s: finge que deu certo e não cria nada
      if (isca.trim()) { setSuccess('Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.'); return }
      if (Date.now() - abertoEm.current < 2500) { setError('Confira os dados e toque em Criar conta de novo.'); abertoEm.current = Date.now() - 1000; return }
    }
    if (verificacaoLigada() && !captcha) { setError('Aguarde a verificação de segurança terminar e tente de novo.'); return }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken: captcha ?? undefined } })
        if (error) {
          if (/Invalid login/i.test(error.message)) { registrarFalha(); setEspera(bloqueioRestante()) }
          if (/Email not confirmed/i.test(error.message)) setPodeReenviar(true)
          throw error
        }
        limparFalhas()
      } else {
        const { textos } = await carregarConfig()
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirect,
            captchaToken: captcha ?? undefined,
            data: { nome: nome.trim().slice(0, 120), versao_termos: textos.versao_termos, marketing_opt_in: marketing },
          },
        })
        if (error) throw error
        // Supabase não revela se o e-mail já existe: identities vazio indica cadastro existente
        if (data.user && data.user.identities?.length === 0) {
          setError('Este e-mail já está cadastrado. Entre ou recupere sua senha.')
        } else {
          setSuccess('Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.')
          setPassword(''); setConfirmar('')
        }
      }
    } catch (err: unknown) {
      setError(traduzirErroAuth(err instanceof Error ? err.message : 'Erro desconhecido'))
    } finally {
      setSubmitting(false)
      // cada verificação vale uma vez: pede outra para a próxima tentativa
      if (verificacaoLigada()) setVersaoCaptcha(v => v + 1)
    }
  }

  const google = async () => {
    setError(''); setSuccess(''); setAbrindoGoogle(true)
    try {
      await entrarComGoogle(destinoSeguro(params.get('next')))
      // no app o login segue no navegador do celular; ao voltar, a tela troca sozinha
      setTimeout(() => setAbrindoGoogle(false), 4000)
    } catch (err: unknown) {
      setAbrindoGoogle(false)
      setError(traduzirErroAuth(err instanceof Error ? err.message : 'Erro desconhecido'))
    }
  }

  const reenviar = async () => {
    setError(''); setSuccess('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect, captchaToken: captcha ?? undefined } })
    if (verificacaoLigada()) setVersaoCaptcha(v => v + 1)
    if (error) setError(traduzirErroAuth(error.message))
    else { setSuccess('Enviamos um novo link de confirmação.'); setPodeReenviar(false) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8 text-center flex flex-col items-center">
        <Logo tamanho="lg" />
        <h1 className="text-2xl font-bold text-zinc-100 mt-4">R2 Fit Pro</h1>
        <p className="text-zinc-500 text-sm mt-1">Dieta e treino personalizados com IA</p>
      </Link>

      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex bg-zinc-800 rounded-xl p-1 mb-6" role="tablist">
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setError(''); setSuccess('') }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${mode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        {comGoogle && (
          <>
            <button type="button" onClick={google} disabled={abrindoGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 font-semibold rounded-xl py-3 hover:bg-zinc-100 disabled:opacity-60 transition-colors cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              {abrindoGoogle ? 'Abrindo o Google…' : 'Continuar com o Google'}
            </button>
            <p className="text-xs text-zinc-500 text-center mt-2">Ao continuar com o Google, você aceita os <Link to="/termos" target="_blank" className="underline">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>.</p>
            <div className="flex items-center gap-3 my-5 text-xs text-zinc-500">
              <span className="flex-1 h-px bg-zinc-800" />ou com e-mail<span className="flex-1 h-px bg-zinc-800" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {mode === 'register' && (
            <Input label="Nome" type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" maxLength={120} required />
          )}
          <Input label="E-mail" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          <Input label="Senha" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required
            hint={mode === 'register' ? 'Mínimo de 8 caracteres, com letras e números.' : undefined} />
          {mode === 'register' && (
            <>
              <Input label="Confirmar senha" type="password" placeholder="••••••••" value={confirmar} onChange={e => setConfirmar(e.target.value)} autoComplete="new-password" required />
              <label className="flex items-start gap-2 text-sm text-zinc-400">
                <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="mt-1 accent-green-500" />
                <span>Li e aceito os <Link to="/termos" target="_blank" className="text-green-400 underline">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank" className="text-green-400 underline">Política de Privacidade</Link>.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-zinc-400">
                <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-1 accent-green-500" />
                <span>Quero receber novidades e dicas por e-mail (opcional).</span>
              </label>
            </>
          )}

          {mode === 'register' && (
            // campo-isca: pessoas não veem; robôs que preenchem tudo caem aqui
            <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
              <label>Site da empresa<input type="text" name="site_empresa" tabIndex={-1} autoComplete="off" value={isca} onChange={e => setIsca(e.target.value)} /></label>
            </div>
          )}
          <VerificacaoHumana onToken={setCaptcha} versao={versaoCaptcha} acao={mode === 'register' ? 'cadastro' : 'login'} />
          {error && <p role="alert" className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          {espera > 0 && mode === 'login' && (
            <p className="text-yellow-400 text-sm bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">Muitas tentativas. Tente novamente em {espera}s.</p>
          )}
          {success && <p role="status" className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{success}</p>}
          {podeReenviar && (
            <button type="button" onClick={reenviar} className="text-sm text-green-400 underline text-left">Reenviar e-mail de confirmação</button>
          )}

          <Button type="submit" loading={submitting} disabled={mode === 'login' && espera > 0} size="lg" className="w-full mt-1">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
          {mode === 'login' && (
            <Link to="/recuperar-senha" className="text-sm text-zinc-400 hover:text-zinc-200 text-center">Esqueci minha senha</Link>
          )}
        </form>
      </div>

      <p className="text-zinc-600 text-xs mt-6 text-center">
        <Link to="/termos" className="hover:text-zinc-400">Termos</Link> · <Link to="/privacidade" className="hover:text-zinc-400">Privacidade</Link> · <Link to="/suporte" className="hover:text-zinc-400">Ajuda</Link>
      </p>
    </div>
  )
}
