-- Convite de amigo: quem entra pelo link (ou digita o código) do amigo já vira amigo na hora.
-- O código é o convite do dono: compartilhar o link já é o "aceito" dele. Qualquer um desfaz a amizade depois.
CREATE OR REPLACE FUNCTION public.social_adicionar(p_codigo TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid UUID := public._social_exigir_perfil(); outro UUID; a public.amizades;
BEGIN
  SELECT user_id INTO outro FROM public.social_perfis WHERE codigo = upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  IF outro IS NULL THEN RAISE EXCEPTION 'Código não encontrado. Confira com seu amigo.'; END IF;
  IF outro = uid THEN RAISE EXCEPTION 'Este é o seu próprio código.'; END IF;
  SELECT * INTO a FROM public.amizades WHERE LEAST(solicitante, destinatario) = LEAST(uid, outro) AND GREATEST(solicitante, destinatario) = GREATEST(uid, outro);
  IF FOUND THEN
    IF a.status = 'aceita' THEN RETURN jsonb_build_object('status', 'ja_amigos', 'nome', public._social_nome(outro)); END IF;
    -- havia um pedido pendente (de qualquer um dos dois): o código do amigo confirma
    UPDATE public.amizades SET status = 'aceita', aceita_em = NOW() WHERE id = a.id;
    RETURN jsonb_build_object('status', 'aceita', 'nome', public._social_nome(outro));
  END IF;
  IF (SELECT count(*) FROM public.amizades WHERE uid IN (solicitante, destinatario)) >= 300 THEN RAISE EXCEPTION 'Você atingiu o limite de amigos.'; END IF;
  IF (SELECT count(*) FROM public.amizades WHERE solicitante = uid AND created_at > NOW() - INTERVAL '1 day') >= 30 THEN
    RAISE EXCEPTION 'Muitos amigos adicionados hoje. Tente amanhã.';
  END IF;
  INSERT INTO public.amizades (solicitante, destinatario, status, aceita_em) VALUES (uid, outro, 'aceita', NOW());
  RETURN jsonb_build_object('status', 'aceita', 'nome', public._social_nome(outro));
END;
$$;
REVOKE ALL ON FUNCTION public.social_adicionar(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_adicionar(TEXT) TO authenticated;
