-- ============================================================
-- R2 Fit Pro — limite diário da voz de nomes (/api/voz), conferido no servidor.
-- Antes só exigia Premium/teste: uma conta podia gerar vozes sem limite (custo na OpenAI).
-- ============================================================

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS voz INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registrar_uso_voz(limite INTEGER DEFAULT 60)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  total INTEGER;
  v_estado TEXT;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado'); END IF;
  v_estado := public.estado_acesso(uid);
  IF v_estado NOT IN ('admin', 'ativa', 'tolerancia', 'cancelada_vigente', 'teste') THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'sem_premium');
  END IF;
  INSERT INTO public.ai_usage (user_id, dia, chamadas, voz)
  VALUES (uid, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, 0, 1)
  ON CONFLICT (user_id, dia) DO UPDATE SET voz = public.ai_usage.voz + 1
  RETURNING voz INTO total;
  -- teste grátis: no máximo 20 por dia; o limite pedido nunca passa de 200
  IF total > LEAST(GREATEST(limite, 1), CASE WHEN v_estado = 'teste' THEN 20 ELSE 200 END) THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'limite_diario', 'chamadas', total);
  END IF;
  RETURN jsonb_build_object('permitido', true, 'chamadas', total);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_uso_voz(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_uso_voz(INTEGER) TO authenticated;
