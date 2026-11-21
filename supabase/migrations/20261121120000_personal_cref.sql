-- ============================================================
-- R2 Fit Pro — CREF obrigatório para o modo personal e verificação pelo admin.
-- O CONFEF não tem consulta pública automática: o formato é conferido aqui (número-categoria/UF) e
-- o admin confirma no site do CONFEF e marca como verificado. Mudar o CREF tira a verificação.
-- ============================================================

ALTER TABLE public.personais ADD COLUMN IF NOT EXISTS cref_verificado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.personais ADD COLUMN IF NOT EXISTS cref_verificado_em TIMESTAMPTZ;

/** "CREF 12345-G/SP", "012345 g sp", "012345G/SP" → "012345-G/SP"; NULL quando o formato não serve. */
CREATE OR REPLACE FUNCTION public._normalizar_cref(p TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE t TEXT; m TEXT[];
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  t := upper(regexp_replace(p, 'cref|[[:space:].]', '', 'gi'));
  m := regexp_match(t, '^(\d{1,6})-?([GP])/?(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$');
  IF m IS NULL OR m[1]::INTEGER = 0 THEN RETURN NULL; END IF;
  RETURN lpad(m[1], 6, '0') || '-' || m[2] || '/' || m[3];
END;
$$;

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
  IF atual.user_id IS NULL AND novo_cref IS NULL THEN RAISE EXCEPTION 'Informe o seu CREF para ativar o modo personal.'; END IF;
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

/** Admin: personais com o CREF e se já foi conferido. */
CREATE OR REPLACE FUNCTION public.admin_personais()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.user_id, 'nome', COALESCE(p.nome_exibicao, u.raw_user_meta_data->>'nome', u.email), 'email', u.email,
      'cref', p.cref, 'cref_verificado', p.cref_verificado, 'cref_verificado_em', p.cref_verificado_em, 'desde', p.created_at,
      'alunos', (SELECT count(*) FROM public.acompanhamentos a WHERE a.personal_id = p.user_id))
    ORDER BY p.cref_verificado, p.created_at DESC)
    FROM public.personais p JOIN auth.users u ON u.id = p.user_id), '[]'::JSONB);
END;
$$;

/** Admin: marca (ou desmarca) o CREF como conferido no site do CONFEF. */
CREATE OR REPLACE FUNCTION public.admin_verificar_cref(p_user UUID, p_ok BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  UPDATE public.personais SET cref_verificado = p_ok, cref_verificado_em = CASE WHEN p_ok THEN NOW() END WHERE user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public._normalizar_cref(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_personais() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verificar_cref(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_personais() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verificar_cref(UUID, BOOLEAN) TO authenticated;
