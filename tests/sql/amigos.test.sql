-- Testes dos amigos: código/link do amigo já vira amizade, pedidos antigos, feed só de amigos e com a privacidade respeitada, curtidas e ranking.
-- Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  a UUID := gen_random_uuid(); b UUID := gen_random_uuid(); c UUID := gen_random_uuid();
  n INT := 0; cnt INT; ok BOOLEAN; j JSONB; cod_a TEXT; cod_b TEXT; sid UUID; pid UUID;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-a-'||a||'@exemplo.invalid', 'x', NOW(), '{"nome":"Ana Lima"}', NOW(), NOW()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-b-'||b||'@exemplo.invalid', 'x', NOW(), '{"nome":"Bruno"}', NOW(), NOW()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-c-'||c||'@exemplo.invalid', 'x', NOW(), '{"nome":"Carla"}', NOW(), NOW());
  INSERT INTO public.sessoes_treino (user_id, treino_nome, dia_index, data_inicio, data_fim, concluido, series_realizadas)
  VALUES (b, 'Treino A', 0, NOW() - INTERVAL '50 minutes', NOW() - INTERVAL '5 minutes', TRUE, '{"e1": [1,1], "e2": [1]}') RETURNING id INTO sid;
  INSERT INTO public.food_logs (user_id, data, nome, calorias) VALUES (b, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'Arroz', 200);

  -- 1. Sem ativar não vê feed
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := FALSE; BEGIN PERFORM public.social_feed(); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 1: feed sem perfil'; END IF; n := n + 1;
  IF public.social_amigos()->'perfil' <> 'null'::JSONB THEN RAISE EXCEPTION 'FALHA 2: perfil inexistente'; END IF; n := n + 1;
  cod_a := public.social_ativar('Ana')->>'codigo';
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  cod_b := public.social_ativar(NULL)->>'codigo';
  IF cod_b !~ '^[A-Z0-9]{6}$' OR cod_a = cod_b THEN RAISE EXCEPTION 'FALHA 3: códigos'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 4. Ana usa o código (link) do Bruno: já são amigos; ninguém lê a tabela direto
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.social_adicionar(lower(cod_b));
  IF j->>'status' <> 'aceita' OR j->>'nome' <> 'Bruno' THEN RAISE EXCEPTION 'FALHA 4: amizade pelo código (%)', j; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM 1 FROM public.amizades; EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 5: amizades legível'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.social_adicionar(cod_a); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 6: adicionou a si mesma'; END IF; n := n + 1;
  -- O treino do Bruno já aparece (sem esperar aceite)
  IF jsonb_array_length(public.social_feed()) <> 1 THEN RAISE EXCEPTION 'FALHA 7: feed logo após adicionar'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 8. Bruno não tem pedido para aceitar; usar o código da Ana diz que já são amigos
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF jsonb_array_length(public.social_amigos()->'recebidos') <> 0 OR public.social_pendentes() <> 0 THEN RAISE EXCEPTION 'FALHA 8: sobrou pedido'; END IF; n := n + 1;
  j := public.social_adicionar(cod_a);
  IF j->>'status' <> 'ja_amigos' THEN RAISE EXCEPTION 'FALHA 9: já amigos (%)', j; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 10. Ana vê o treino do Bruno e curte
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.social_feed();
  IF jsonb_array_length(j) <> 1 OR j->0->>'nome' <> 'Bruno' OR (j->0->>'minutos')::INT <> 45 OR (j->0->>'exercicios')::INT <> 2 THEN RAISE EXCEPTION 'FALHA 10: feed (%)', j; END IF; n := n + 1;
  PERFORM public.social_curtir(sid, TRUE);
  PERFORM public.social_curtir(sid, TRUE); -- repetir não duplica
  j := public.social_feed();
  IF (j->0->>'curtidas')::INT <> 1 OR NOT (j->0->>'curti')::BOOLEAN OR j->0->'quem_curtiu'->>0 <> 'Ana' THEN RAISE EXCEPTION 'FALHA 11: curtida (%)', j; END IF; n := n + 1;
  -- 12. Ranking: Bruno 1 treino e 1 dia de diário, na frente da Ana
  j := public.social_ranking(CURRENT_DATE - 6, CURRENT_DATE + 1);
  IF jsonb_array_length(j) <> 2 OR j->0->>'nome' <> 'Bruno' OR (j->0->>'treinos')::INT <> 1 OR (j->0->>'dias_diario')::INT <> 1 THEN RAISE EXCEPTION 'FALHA 12: ranking (%)', j; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 13. Carla (sem amizade) não vê nem curte o treino do Bruno
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.social_ativar('Carla');
  IF jsonb_array_length(public.social_feed()) <> 0 THEN RAISE EXCEPTION 'FALHA 13: estranha vê feed'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.social_curtir(sid, TRUE); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 14: estranha curtiu'; END IF; n := n + 1;
  IF jsonb_array_length(public.social_ranking(CURRENT_DATE - 6, CURRENT_DATE)) <> 1 THEN RAISE EXCEPTION 'FALHA 15: estranha vê ranking'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  -- Pedido antigo (de antes do link aceitar na hora) da Carla para a Ana: Ana recusa
  INSERT INTO public.amizades (solicitante, destinatario) VALUES (c, a);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  pid := (public.social_amigos()->'recebidos'->0->>'id')::UUID;
  PERFORM public.social_responder(pid, FALSE);
  IF jsonb_array_length(public.social_amigos()->'recebidos') <> 0 THEN RAISE EXCEPTION 'FALHA 16: recusar'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 17. Bruno esconde os treinos e sai do ranking
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.social_ativar(NULL, FALSE, FALSE);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF jsonb_array_length(public.social_feed()) <> 0 THEN RAISE EXCEPTION 'FALHA 17: treino escondido aparece'; END IF; n := n + 1;
  IF jsonb_array_length(public.social_ranking(CURRENT_DATE - 6, CURRENT_DATE)) <> 1 THEN RAISE EXCEPTION 'FALHA 18: fora do ranking aparece'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.social_curtir(sid, FALSE); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 19: mexeu em treino escondido'; END IF; n := n + 1;
  -- 20. Desfazer a amizade apaga as curtidas trocadas
  pid := (public.social_amigos()->'amigos'->0->>'id')::UUID;
  PERFORM public.social_remover(pid);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.social_curtidas WHERE sessao_id = sid;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 20: curtidas ficaram após desfazer amizade'; END IF; n := n + 1;

  -- 21. Excluir a conta apaga perfil e amizades
  DELETE FROM auth.users WHERE id = c;
  SELECT count(*) INTO cnt FROM public.social_perfis WHERE user_id = c;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 21: perfil ficou após excluir a conta'; END IF; n := n + 1;

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
