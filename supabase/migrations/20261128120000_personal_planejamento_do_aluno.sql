-- ============================================================
-- R2 Fit Pro — o personal cuida de todo o planejamento do aluno, direto na conta do aluno.
--  1. Treinos, dietas e meta/parâmetros: o personal vê e altera as MESMAS linhas do aluno (não uma cópia),
--     então o que um muda o outro vê na hora. Vale só com o acompanhamento ativo, o aluno tendo permitido
--     "editar meu planejamento" e o personal com Premium. O personal não exclui nada do aluno.
--  2. Ergogênicos do aluno (user_settings.preferencias.rotina): só por funções, que conferem o vínculo.
--  3. Fotos de evolução: o personal só vê (nunca altera) e só se o aluno ligar "ver_fotos" (vem desligado).
--  4. Aviso automático na conversa quando o personal muda algo (no máximo um a cada 20 minutos por item).
--  5. Nome público e foto de perfil: amigos, personal e alunos veem a foto um do outro; ninguém mais.
--  6. Endurecimento: o dono de um treino/dieta/meta nunca muda; colunas sensíveis de profiles só pelo servidor.
-- ============================================================

-- Schema interno (fora da API REST): funções auxiliares que os gatilhos chamam
CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA privado TO authenticated;

-- ---------- Permissão de fotos ----------
ALTER TABLE public.acompanhamentos ADD COLUMN IF NOT EXISTS ver_fotos BOOLEAN NOT NULL DEFAULT FALSE;

/** Ao encerrar, a permissão de fotos volta a desligada (um convite novo não herda a antiga). */
CREATE OR REPLACE FUNCTION privado.acomp_encerrado_limpa_fotos()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT NEW.ativo THEN NEW.ver_fotos := FALSE; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS acompanhamentos_limpa_fotos ON public.acompanhamentos;
CREATE TRIGGER acompanhamentos_limpa_fotos BEFORE UPDATE ON public.acompanhamentos
  FOR EACH ROW EXECUTE FUNCTION privado.acomp_encerrado_limpa_fotos();

/** O aluno liga ou desliga "o personal pode ver minhas fotos". */
CREATE OR REPLACE FUNCTION public.acomp_permitir_fotos(p_id UUID, p_permitir BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.acompanhamentos SET ver_fotos = COALESCE(p_permitir, FALSE)
  WHERE id = p_id AND aluno_id = auth.uid() AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acompanhamento não encontrado.'; END IF;
END;
$$;

-- ---------- Quem pode o quê ----------

/** O personal logado pode editar o planejamento deste aluno? */
CREATE OR REPLACE FUNCTION public._personal_edita(p_aluno UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- CASE garante a ordem: nas leituras da própria conta (o caso comum) sai na primeira linha, sem consultar nada
  SELECT CASE WHEN auth.uid() IS NULL OR auth.uid() = p_aluno THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.acompanhamentos a
                 WHERE a.personal_id = auth.uid() AND a.aluno_id = p_aluno AND a.ativo AND a.editar_planos)
         AND public.tem_premium() END;
$$;

/** O personal logado pode ver os treinos deste aluno (compartilhou os treinos ou deixou editar)? */
CREATE OR REPLACE FUNCTION public._personal_ve_treinos(p_aluno UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR auth.uid() = p_aluno THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.acompanhamentos a
                 WHERE a.personal_id = auth.uid() AND a.aluno_id = p_aluno AND a.ativo AND (a.editar_planos OR a.ver_treinos))
         AND public.tem_premium() END;
$$;

/** Pasta do storage (texto) é de um aluno que liberou as fotos para o personal logado? */
CREATE OR REPLACE FUNCTION public._personal_ve_fotos(p_pasta TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR auth.uid()::TEXT = p_pasta THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.acompanhamentos a
                 WHERE a.personal_id = auth.uid() AND a.aluno_id::TEXT = p_pasta AND a.ativo AND a.ver_fotos)
         AND public.tem_premium() END;
$$;

/** Quem logou pode ver a foto de perfil de p_dono: a própria, amigos, personal e aluno (vínculo ativo). */
CREATE OR REPLACE FUNCTION public._pode_ver_avatar(p_dono UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE WHEN auth.uid() = p_dono THEN TRUE ELSE (
    EXISTS (SELECT 1 FROM public.amizades z WHERE z.status = 'aceita'
               AND ((z.solicitante = auth.uid() AND z.destinatario = p_dono) OR (z.destinatario = auth.uid() AND z.solicitante = p_dono)))
    OR EXISTS (SELECT 1 FROM public.acompanhamentos a WHERE a.ativo
               AND ((a.personal_id = auth.uid() AND a.aluno_id = p_dono) OR (a.aluno_id = auth.uid() AND a.personal_id = p_dono)))
  ) END;
$$;
CREATE OR REPLACE FUNCTION public._pode_ver_avatar_pasta(p_pasta TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p_pasta ~ '^[0-9a-f-]{36}$' THEN public._pode_ver_avatar(p_pasta::UUID) ELSE FALSE END;
$$;

-- ---------- Treinos, dietas e meta do aluno ----------

DROP POLICY IF EXISTS treinos_personal_select ON public.treinos;
CREATE POLICY treinos_personal_select ON public.treinos FOR SELECT TO authenticated USING (public._personal_ve_treinos(user_id));
DROP POLICY IF EXISTS treinos_personal_update ON public.treinos;
CREATE POLICY treinos_personal_update ON public.treinos FOR UPDATE TO authenticated
  USING (public._personal_edita(user_id)) WITH CHECK (public._personal_edita(user_id));

DROP POLICY IF EXISTS dietas_personal_select ON public.dietas;
CREATE POLICY dietas_personal_select ON public.dietas FOR SELECT TO authenticated USING (public._personal_edita(user_id));
DROP POLICY IF EXISTS dietas_personal_update ON public.dietas;
CREATE POLICY dietas_personal_update ON public.dietas FOR UPDATE TO authenticated
  USING (public._personal_edita(user_id)) WITH CHECK (public._personal_edita(user_id));

DROP POLICY IF EXISTS metas_personal_select ON public.metas_nutricionais;
CREATE POLICY metas_personal_select ON public.metas_nutricionais FOR SELECT TO authenticated USING (public._personal_edita(user_id));
DROP POLICY IF EXISTS metas_personal_insert ON public.metas_nutricionais;
CREATE POLICY metas_personal_insert ON public.metas_nutricionais FOR INSERT TO authenticated WITH CHECK (public._personal_edita(user_id));
DROP POLICY IF EXISTS metas_personal_update ON public.metas_nutricionais;
CREATE POLICY metas_personal_update ON public.metas_nutricionais FOR UPDATE TO authenticated
  USING (public._personal_edita(user_id)) WITH CHECK (public._personal_edita(user_id));

/** O dono de um treino, dieta ou meta nunca muda (nem pelo personal, nem pelo próprio dono). */
CREATE OR REPLACE FUNCTION privado.dono_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Não é possível mudar o dono deste registro.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS treinos_dono_imutavel ON public.treinos;
CREATE TRIGGER treinos_dono_imutavel BEFORE UPDATE OF user_id ON public.treinos FOR EACH ROW EXECUTE FUNCTION privado.dono_imutavel();
DROP TRIGGER IF EXISTS dietas_dono_imutavel ON public.dietas;
CREATE TRIGGER dietas_dono_imutavel BEFORE UPDATE OF user_id ON public.dietas FOR EACH ROW EXECUTE FUNCTION privado.dono_imutavel();
DROP TRIGGER IF EXISTS metas_dono_imutavel ON public.metas_nutricionais;
CREATE TRIGGER metas_dono_imutavel BEFORE UPDATE OF user_id ON public.metas_nutricionais FOR EACH ROW EXECUTE FUNCTION privado.dono_imutavel();

-- ---------- Aviso ao aluno ----------
ALTER TABLE public.acomp_mensagens DROP CONSTRAINT IF EXISTS acomp_mensagens_tipo_check;
ALTER TABLE public.acomp_mensagens ADD CONSTRAINT acomp_mensagens_tipo_check
  CHECK (tipo IN ('texto', 'treino', 'dieta', 'meta', 'rotina', 'aviso'));

/** Grava o aviso "Atualizei seu ..." (no máximo um a cada 20 minutos por item). Só o personal com permissão. */
CREATE OR REPLACE FUNCTION privado.avisar_plano(p_aluno UUID, p_tipo TEXT, p_ref UUID, p_texto TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_acomp UUID;
BEGIN
  IF p_tipo NOT IN ('treino', 'dieta', 'meta', 'rotina') OR NOT public._personal_edita(p_aluno) THEN RETURN; END IF;
  SELECT id INTO v_acomp FROM public.acompanhamentos WHERE personal_id = auth.uid() AND aluno_id = p_aluno AND ativo LIMIT 1;
  IF v_acomp IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.acomp_mensagens m WHERE m.acompanhamento_id = v_acomp AND m.tipo = p_tipo
             AND m.ref_id IS NOT DISTINCT FROM p_ref AND m.created_at > NOW() - INTERVAL '20 minutes') THEN RETURN; END IF;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto, ref_id)
  VALUES (v_acomp, auth.uid(), p_tipo, left(p_texto, 2000), p_ref);
END;
$$;
REVOKE ALL ON FUNCTION privado.avisar_plano(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.avisar_plano(UUID, TEXT, UUID, TEXT) TO authenticated;

/** Gatilho (roda como quem fez a mudança): só avisa na edição direta pelo personal. As funções
 *  "Enviar treino/dieta" e "Ajustar meta" rodam como dono do banco e já mandam a própria mensagem. */
CREATE OR REPLACE FUNCTION privado.plano_editado_pelo_personal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user <> 'authenticated' OR auth.uid() IS NULL OR auth.uid() = NEW.user_id THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'treinos' THEN
    PERFORM privado.avisar_plano(NEW.user_id, 'treino', NEW.id, 'Atualizei seu treino: ' || left(coalesce(NEW.nome, ''), 120));
  ELSIF TG_TABLE_NAME = 'dietas' THEN
    PERFORM privado.avisar_plano(NEW.user_id, 'dieta', NEW.id, 'Atualizei sua dieta: ' || left(coalesce(NEW.nome, ''), 120));
  ELSE
    PERFORM privado.avisar_plano(NEW.user_id, 'meta', NULL,
      format('Atualizei sua meta diária: %s kcal · P %sg · C %sg · G %sg', NEW.calorias, NEW.proteina_g, NEW.carboidrato_g, NEW.gordura_g));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION privado.plano_editado_pelo_personal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.plano_editado_pelo_personal() TO authenticated;

DROP TRIGGER IF EXISTS treinos_aviso_personal ON public.treinos;
CREATE TRIGGER treinos_aviso_personal AFTER UPDATE ON public.treinos FOR EACH ROW EXECUTE FUNCTION privado.plano_editado_pelo_personal();
DROP TRIGGER IF EXISTS dietas_aviso_personal ON public.dietas;
CREATE TRIGGER dietas_aviso_personal AFTER UPDATE ON public.dietas FOR EACH ROW EXECUTE FUNCTION privado.plano_editado_pelo_personal();
DROP TRIGGER IF EXISTS metas_aviso_personal ON public.metas_nutricionais;
CREATE TRIGGER metas_aviso_personal AFTER INSERT OR UPDATE ON public.metas_nutricionais FOR EACH ROW EXECUTE FUNCTION privado.plano_editado_pelo_personal();

-- ---------- Ergogênicos do aluno ----------

CREATE OR REPLACE FUNCTION public.acomp_rotina_aluno(p_aluno UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public._personal_edita(p_aluno) THEN RAISE EXCEPTION 'O aluno não permitiu que você edite o planejamento dele.'; END IF;
  RETURN (SELECT s.preferencias -> 'rotina' FROM public.user_settings s WHERE s.user_id = p_aluno);
END;
$$;

/** Grava os ergogênicos do aluno sem mexer nas outras preferências dele. */
CREATE OR REPLACE FUNCTION public.acomp_salvar_rotina_aluno(p_aluno UUID, p_rotina JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public._personal_edita(p_aluno) THEN RAISE EXCEPTION 'O aluno não permitiu que você edite o planejamento dele.'; END IF;
  IF p_rotina IS NULL OR jsonb_typeof(p_rotina) <> 'object' OR jsonb_typeof(p_rotina -> 'itens') <> 'array'
     OR jsonb_array_length(p_rotina -> 'itens') > 60 OR pg_column_size(p_rotina) > 12000 THEN
    RAISE EXCEPTION 'Lista de ergogênicos inválida.';
  END IF;
  INSERT INTO public.user_settings AS s (user_id, preferencias, updated_at)
  VALUES (p_aluno, jsonb_build_object('rotina', p_rotina), NOW())
  ON CONFLICT (user_id) DO UPDATE SET preferencias = s.preferencias || jsonb_build_object('rotina', p_rotina), updated_at = NOW();
  PERFORM privado.avisar_plano(p_aluno, 'rotina', NULL, 'Atualizei seus ergogênicos.');
END;
$$;

-- ---------- Fotos de evolução do aluno (só leitura) ----------

CREATE OR REPLACE FUNCTION public.acomp_fotos_aluno(p_aluno UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public._personal_ve_fotos(p_aluno::TEXT) THEN RAISE EXCEPTION 'O aluno não liberou as fotos para você.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'data', f.data, 'pose', f.pose, 'caminho', f.caminho) ORDER BY f.data DESC, f.created_at DESC)
    FROM (SELECT * FROM public.fotos_evolucao WHERE user_id = p_aluno ORDER BY data DESC, created_at DESC LIMIT 120) f), '[]'::JSONB);
END;
$$;

DROP POLICY IF EXISTS evolucao_select_personal ON storage.objects;
CREATE POLICY evolucao_select_personal ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evolucao' AND public._personal_ve_fotos((storage.foldername(name))[1]));

-- ---------- Foto e nome público ----------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_publico TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nome_publico_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_nome_publico_check CHECK (nome_publico IS NULL OR char_length(nome_publico) BETWEEN 1 AND 40);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_da_pessoa;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_da_pessoa CHECK (avatar_url IS NULL OR split_part(avatar_url, '/', 1) = id::TEXT);
UPDATE public.profiles p SET nome_publico = left(trim(s.apelido), 40)
FROM public.social_perfis s WHERE s.user_id = p.id AND p.nome_publico IS NULL AND NULLIF(trim(s.apelido), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public._social_nome(uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(trim(p.nome_publico), ''), NULLIF(trim(s.apelido), ''), split_part(public._acomp_nome(uid), ' ', 1))
  FROM (SELECT uid AS id) x LEFT JOIN public.social_perfis s ON s.user_id = x.id LEFT JOIN public.profiles p ON p.id = x.id;
$$;

/** Caminho da foto de perfil das pessoas que quem logou pode ver ({ user_id: caminho }). */
CREATE OR REPLACE FUNCTION public.avatares(p_ids UUID[])
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_object_agg(p.id, p.avatar_url), '{}'::JSONB)
  FROM public.profiles p
  WHERE p.id = ANY (p_ids[1:200]) AND p.avatar_url IS NOT NULL AND public._pode_ver_avatar(p.id);
$$;

DROP POLICY IF EXISTS avatars_select_vinculo ON storage.objects;
CREATE POLICY avatars_select_vinculo ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public._pode_ver_avatar_pasta((storage.foldername(name))[1]));

-- ---------- Endurecimento ----------
-- e-mail de profiles é usado para mandar e-mails do app: só o servidor muda (vem de auth.users)
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (nome, nome_publico, telefone, data_nascimento, avatar_url, marketing_opt_in, versao_termos, updated_at) ON public.profiles TO authenticated;
-- assinaturas e pagamentos: só o servidor grava (já não havia política de escrita; agora nem permissão)
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions, public.payments FROM authenticated, anon;

-- ---------- Permissões das funções ----------
REVOKE ALL ON FUNCTION privado.acomp_encerrado_limpa_fotos(), privado.dono_imutavel() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_personal_edita(UUID)', '_personal_ve_treinos(UUID)', '_personal_ve_fotos(TEXT)', '_pode_ver_avatar(UUID)', '_pode_ver_avatar_pasta(TEXT)',
    'acomp_permitir_fotos(UUID, BOOLEAN)', 'acomp_rotina_aluno(UUID)', 'acomp_salvar_rotina_aluno(UUID, JSONB)', 'acomp_fotos_aluno(UUID)',
    'avatares(UUID[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
