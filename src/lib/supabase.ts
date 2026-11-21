import { createClient } from '@supabase/supabase-js'
import { criarFetchOffline, iniciarOffline } from './offline'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis de ambiente do Supabase não configuradas.')
}

// Sem internet: leituras guardadas no aparelho e gravações numa fila que sincroniza sozinha (lib/offline.ts)
const fetchOffline = criarFetchOffline(supabaseUrl, supabaseAnonKey, async () => (await supabase.auth.getSession()).data.session?.access_token ?? null)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchOffline } })

if (typeof window !== 'undefined') iniciarOffline()
