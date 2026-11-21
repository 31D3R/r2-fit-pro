-- ============================================================
-- R2 Fit Pro — admin pode abrir o painel do personal sem CREF (para conferir a versão do personal).
-- Para os demais, o CREF continua obrigatório.
-- ============================================================

CREATE OR REPLACE FUNCTION public.acomp_ativar_personal(p_nome TEXT DEFAULT NULL, p_cref TEXT DEFAULT NULL, p_novo_codigo BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := auth.uid(); r public.personais; atual public.personais; novo_cref TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF NOT public.tem_premium() THEN RAISE EXCEPTION 'Para atender alunos é preciso ter o Premium ativo.'; END IF;
  SELECT * INTO atual FROM public.personais WHERE user_id = uid;
  IF p_cref IS NOT NULL THEN
    novo_cref := public._normalizar_cref(p_cref);
    IF novo_cref IS NULL THEN RAISE EXCEPTION 'CREF inválido. Use o formato 000000-G/UF (número, G ou P e o estado).'; END IF;
  END IF;
  IF atual.user_id IS NULL AND novo_cref IS NULL AND NOT public.is_admin(uid) THEN RAISE EXCEPTION 'Informe o seu CREF para ativar o modo personal.'; END IF;
  INSERT INTO public.personais AS pe (user_id, codigo, nome_exibicao, cref)
  VALUES (uid, public._acomp_gerar_codigo(), NULLIF(left(trim(p_nome), 80), ''), novo_cref)
  ON CONFLICT (user_id) DO UPDATE SET
    nome_exibicao = COALESCE(NULLIF(left(trim(p_nome), 80), ''), pe.nome_exibicao),
    cref = COALESCE(novo_cref, pe.cref),
    cref_verificado = CASE WHEN novo_cref IS NOT NULL AND novo_cref IS DISTINCT FROM pe.cref THEN FALSE ELSE pe.cref_verificado END,
    cref_verificado_em = CASE WHEN novo_cref IS NOT NULL AND novo_cref IS DISTINCT FROM pe.cref THEN NULL ELSE pe.cref_verificado_em END,
    codigo = CASE WHEN p_novo_codigo THEN public._acomp_gerar_codigo() ELSE pe.codigo END
  RETURNING * INTO r;
  RETURN jsonb_build_object('codigo', r.codigo, 'nome_exibicao', r.nome_exibicao, 'cref', r.cref, 'cref_verificado', r.cref_verificado);
END;
$$;
