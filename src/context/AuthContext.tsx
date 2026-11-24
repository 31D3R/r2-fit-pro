import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { lerFila, limparOffline, sincronizar } from '../lib/offline'
import { confirmar } from '../components/Confirmacao'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes. Ao voltar para o app, o Supabase renova a sessão e avisa de novo:
    // mantemos o mesmo objeto de usuário (mesma conta) para não recarregar telas abertas,
    // como o contador de séries no meio de um exercício.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      const novo = session?.user ?? null
      setUser(atual => (event !== 'USER_UPDATED' && atual && novo && atual.id === novo.id ? atual : novo))
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    // envia o que foi registrado sem internet antes de sair; com algo ainda pendente, avisa (sair apagaria)
    await sincronizar().catch(() => {})
    const pendentes = lerFila().length
    if (pendentes && !(await confirmar(`${pendentes} ${pendentes === 1 ? 'registro feito' : 'registros feitos'} sem internet ainda não ${pendentes === 1 ? 'foi enviado' : 'foram enviados'}.`, {
      detalhe: 'Conecte à internet e espere sincronizar. Se sair agora, eles se perdem.', ok: 'Sair mesmo assim', cancelar: 'Ficar', perigo: true,
    }))) throw new Error('cancelado')
    const { error } = await supabase.auth.signOut()
    if (!error) {
      limparOffline()
      // dados pessoais guardados no aparelho (celular compartilhado: quem entrar depois não vê nada de quem saiu)
      try {
        for (const k of Object.keys(localStorage)) {
          if (/^(r2-acesso-|r2fit_sessao_|r2-compras-)/.test(k)) localStorage.removeItem(k)
        }
      } catch { /* sem armazenamento */ }
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
