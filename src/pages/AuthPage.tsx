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
