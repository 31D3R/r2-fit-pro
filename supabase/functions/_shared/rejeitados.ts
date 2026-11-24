// Avisos de pagamento recusados (assinatura ou token inválido): quem não é o Asaas/Mercado Pago não pode
// encher o banco. Campos cortados e no máximo 30 registros a cada 10 minutos (o resto só vai para o log).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'

export const curto = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 64))

export async function podeRegistrarRejeitado(admin: SupabaseClient): Promise<boolean> {
  const desde = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count } = await admin.from('webhook_events').select('id', { count: 'exact', head: true })
    .eq('status', 'rejeitado').gte('created_at', desde)
  return (count ?? 0) < 30
}
