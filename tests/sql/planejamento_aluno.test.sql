-- Testes do personal editando o planejamento do aluno (treino, dieta, meta, ergogênicos), fotos com permissão,
-- foto e nome público e o endurecimento de profiles. Tudo revertido no fim; esperado: "TESTES_OK (n)".
DO $t$
DECLARE
  p UUID := gen_random_uuid();  -- personal (teste grátis = Premium)
  al UUID := gen_random_uuid(); -- aluno (sem assinatura)
  x UUID := gen_random_uuid();  -- estranho (Premium)
  n INT := 0; cnt INT; ok BOOLEAN; j JSONB; cod TEXT; vid UUID; ta UUID; da UUID;
  claims_p TEXT; claims_al TEXT; claims_x TEXT;
BEGIN
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 0}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (al, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-al-'||al||'@exemplo.invalid', 'x', NOW(), '{"nome":"Aluna Bia Souza"}', NOW(), NOW());
  UPDATE public.app_config SET valor = valor || '{"teste_dias": 7}' WHERE chave = 'plano';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  VALUES (p, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-p-'||p||'@exemplo.invalid', 'x', NOW(), '{"nome":"Rafa"}', NOW(), NOW()),
         (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg-x-'||x||'@exemplo.invalid', 'x', NOW(), '{"nome":"X"}', NOW(), NOW());
  claims_p := json_build_object('sub', p, 'role', 'authenticated')::TEXT;
  claims_al := json_build_object('sub', al, 'role', 'authenticated')::TEXT;
  claims_x := json_build_object('sub', x, 'role', 'authenticated')::TEXT;

  INSERT INTO public.treinos (user_id, nome, plano) VALUES (al, 'Treino da Bia', '{"nome":"Treino da Bia"}') RETURNING id INTO ta;
  INSERT INTO public.dietas (user_id, nome, calorias_dia, plano) VALUES (al, 'Dieta da Bia', 1600, '{}') RETURNING id INTO da;
  INSERT INTO public.metas_nutricionais (user_id, sexo, nascimento, altura_cm, peso_kg, atividade, objetivo, ritmo_kg_semana, calorias, proteina_g, carboidrato_g, gordura_g)
  VALUES (al, 'feminino', '1995-01-01', 165, 70, 'leve', 'perder', 0.5, 1600, 120, 160, 50);
  UPDATE public.user_settings SET preferencias = '{"jejum": {"horas": 16}, "rotina": {"itens": [], "discreto": true}}' WHERE user_id = al;
  INSERT INTO public.fotos_evolucao (user_id, data, pose, caminho) VALUES (al, CURRENT_DATE, 'frente', al || '/f1.jpg');
  UPDATE public.profiles SET avatar_url = al || '/avatar.jpg' WHERE id = al;

  -- Vínculo SEM permissão de editar
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  cod := public.acomp_ativar_personal('Rafa Personal', NULL) ->> 'codigo';
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  vid := public.acomp_aceitar(cod, FALSE, TRUE, TRUE, FALSE);
  EXECUTE 'RESET ROLE';

  -- 1. Sem permissão: não vê nem altera treino, dieta, meta e ergogênicos do aluno
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.treinos WHERE user_id = al;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 1: viu treino sem permissão'; END IF; n := n + 1;
  UPDATE public.dietas SET nome = 'hack' WHERE id = da; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 2: alterou dieta sem permissão'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_rotina_aluno(al); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 3: leu ergogênicos sem permissão'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- Aluno libera editar o planejamento
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_atualizar(vid, FALSE, TRUE, TRUE, TRUE);
  EXECUTE 'RESET ROLE';

  -- 4. Personal edita direto treino, dieta e meta (as mesmas linhas do aluno)
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.treinos SET nome = 'Treino A/B da Bia' WHERE id = ta; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 4: não editou o treino'; END IF; n := n + 1;
  UPDATE public.treinos SET nome = 'Treino A/B/C da Bia' WHERE id = ta;
  UPDATE public.dietas SET calorias_dia = 1500 WHERE id = da; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 5: não editou a dieta'; END IF; n := n + 1;
  UPDATE public.metas_nutricionais SET calorias = 1500, peso_kg = 69 WHERE user_id = al; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 6: não editou a meta'; END IF; n := n + 1;
  -- 7. Não exclui nada do aluno e não muda o dono
  DELETE FROM public.treinos WHERE id = ta; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 7: excluiu treino do aluno'; END IF; n := n + 1;
  ok := FALSE; BEGIN UPDATE public.treinos SET user_id = p WHERE id = ta; EXCEPTION WHEN raise_exception OR insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 8: mudou o dono do treino'; END IF; n := n + 1;
  -- 9. Ergogênicos: grava sem apagar as outras preferências
  PERFORM public.acomp_salvar_rotina_aluno(al, '{"itens": [{"id": "a1", "nome": "Creatina"}], "discreto": true}');
  j := public.acomp_rotina_aluno(al);
  IF j->'itens'->0->>'nome' <> 'Creatina' THEN RAISE EXCEPTION 'FALHA 9: ergogênicos (%)', j; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_salvar_rotina_aluno(al, '"lixo"'); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 10: aceitou ergogênicos inválidos'; END IF; n := n + 1;
  -- 11. Fotos: sem o aluno liberar, nada
  ok := FALSE; BEGIN PERFORM public.acomp_fotos_aluno(al); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 11: viu fotos sem permissão'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.fotos_evolucao WHERE user_id = al;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 12: leu fotos_evolucao direto'; END IF; n := n + 1;
  -- 13. Foto de perfil do aluno: o personal vê o caminho
  j := public.avatares(ARRAY[al, x]);
  IF j->>al::TEXT <> al || '/avatar.jpg' OR j ? x::TEXT THEN RAISE EXCEPTION 'FALHA 13: avatares (%)', j; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 14. Aviso ao aluno: um por item (o segundo ajuste do treino em 20 min não repete)
  SELECT count(*) INTO cnt FROM public.acomp_mensagens WHERE acompanhamento_id = vid AND autor_id = p AND tipo IN ('treino', 'dieta', 'meta', 'rotina');
  IF cnt <> 4 THEN RAISE EXCEPTION 'FALHA 14: avisos (%)', cnt; END IF; n := n + 1;
  -- 15. Outras preferências do aluno ficaram
  SELECT count(*) INTO cnt FROM public.user_settings WHERE user_id = al AND preferencias->'jejum'->>'horas' = '16';
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 15: apagou outras preferências'; END IF; n := n + 1;

  -- 16. Estranho não vê nada do aluno
  PERFORM set_config('request.jwt.claims', claims_x, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.treinos WHERE user_id = al;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 16: estranho viu treino'; END IF; n := n + 1;
  SELECT count(*) INTO cnt FROM public.metas_nutricionais WHERE user_id = al;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 17: estranho viu meta'; END IF; n := n + 1;
  j := public.avatares(ARRAY[al]);
  IF j <> '{}'::JSONB THEN RAISE EXCEPTION 'FALHA 18: estranho viu avatar'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_salvar_rotina_aluno(al, '{"itens": []}'); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 19: estranho gravou ergogênicos'; END IF; n := n + 1;
  ok := FALSE; BEGIN PERFORM public.acomp_permitir_fotos(vid, TRUE); EXCEPTION WHEN raise_exception THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 20: estranho liberou fotos'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 21. Aluno libera as fotos; aluno editando o próprio treino não gera aviso
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_permitir_fotos(vid, TRUE);
  UPDATE public.treinos SET nome = 'Meu treino' WHERE id = ta;
  -- 22. Profiles: e-mail só pelo servidor; nome público sim
  ok := FALSE; BEGIN UPDATE public.profiles SET email = 'outro@exemplo.invalid' WHERE id = al; EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 21: mudou o e-mail do perfil'; END IF; n := n + 1;
  UPDATE public.profiles SET nome_publico = 'Bia' WHERE id = al; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 22: nome público'; END IF; n := n + 1;
  ok := FALSE; BEGIN UPDATE public.profiles SET avatar_url = x || '/a.jpg' WHERE id = al; EXCEPTION WHEN check_violation THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 23: avatar de outra pessoa'; END IF; n := n + 1;
  ok := FALSE; BEGIN INSERT INTO public.subscriptions (user_id, provider, modalidade, status) VALUES (al, 'x', 'mensal', 'ativa'); EXCEPTION WHEN insufficient_privilege THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALHA 24: criou assinatura'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.acomp_mensagens WHERE acompanhamento_id = vid AND autor_id = p AND tipo IN ('treino', 'dieta', 'meta', 'rotina');
  IF cnt <> 4 THEN RAISE EXCEPTION 'FALHA 25: aviso indevido (%)', cnt; END IF; n := n + 1;
  IF public._social_nome(al) <> 'Bia' THEN RAISE EXCEPTION 'FALHA 26: nome público no app'; END IF; n := n + 1;

  -- 27. Com as fotos liberadas o personal vê a lista
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.acomp_fotos_aluno(al);
  IF jsonb_array_length(j) <> 1 THEN RAISE EXCEPTION 'FALHA 27: fotos (%)', j; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  -- 28. Encerrar desliga as fotos e corta tudo na hora
  PERFORM set_config('request.jwt.claims', claims_al, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.acomp_encerrar(vid);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO cnt FROM public.acompanhamentos WHERE id = vid AND NOT ver_fotos;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FALHA 28: fotos continuaram liberadas'; END IF; n := n + 1;
  PERFORM set_config('request.jwt.claims', claims_p, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.treinos SET nome = 'depois' WHERE id = ta; GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FALHA 29: editou após encerrar'; END IF; n := n + 1;
  j := public.avatares(ARRAY[al]);
  IF j <> '{}'::JSONB THEN RAISE EXCEPTION 'FALHA 30: avatar após encerrar'; END IF; n := n + 1;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'TESTES_OK (%) — tudo revertido', n;
END
$t$;
