-- ============================================================
-- R2 Fit Pro — o personal edita direto o plano do aluno (o mesmo treino e a mesma dieta, não uma cópia).
-- Vale só com o acompanhamento ativo, o aluno tendo permitido "editar meus planos" e o personal com Premium.
-- Como é a mesma linha da tabela, o que um muda o outro vê na hora. O aluno recebe um aviso (no máximo um a cada
-- 20 minutos por plano, para não chegar um aviso a cada ajuste).
-- ============================================================

/** O personal logado pode editar os planos deste aluno? */
CREATE OR REPLACE FUNCTION public._personal_edita(p_aluno UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() <> p_aluno AND EXISTS (
    SELECT 1 FROM public.acompanhamentos a
    WHERE a.personal_id = auth.uid() AND a.aluno_id = p_aluno AND a.ativo AND a.editar_planos
  ) AND public.tem_premium();
$$;

/** O personal logado pode ver os treinos deste aluno (compartilhou os treinos ou deixou editar)? */
CREATE OR REPLACE FUNCTION public._personal_ve_treinos(p_aluno UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() <> p_aluno AND EXISTS (
    SELECT 1 FROM public.acompanhamentos a
    WHERE a.personal_id = auth.uid() AND a.aluno_id = p_aluno AND a.ativo AND (a.editar_planos OR a.ver_treinos)
  ) AND public.tem_premium();
$$;

REVOKE ALL ON FUNCTION public._personal_edita(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._personal_ve_treinos(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._personal_edita(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._personal_ve_treinos(UUID) TO authenticated;

-- Treinos do aluno: o personal vê (se compartilhado) e altera (se permitido). Não exclui nem cria por aqui
-- (treino novo continua pelo "Enviar treino"); o dono do treino nunca muda (WITH CHECK).
DROP POLICY IF EXISTS treinos_personal_select ON public.treinos;
CREATE POLICY treinos_personal_select ON public.treinos FOR SELECT TO authenticated USING (public._personal_ve_treinos(user_id));
DROP POLICY IF EXISTS treinos_personal_update ON public.treinos;
CREATE POLICY treinos_personal_update ON public.treinos FOR UPDATE TO authenticated
  USING (public._personal_edita(user_id)) WITH CHECK (public._personal_edita(user_id));

-- Dietas do aluno: o personal vê e altera quando o aluno permitiu editar os planos.
DROP POLICY IF EXISTS dietas_personal_select ON public.dietas;
CREATE POLICY dietas_personal_select ON public.dietas FOR SELECT TO authenticated USING (public._personal_edita(user_id));
DROP POLICY IF EXISTS dietas_personal_update ON public.dietas;
CREATE POLICY dietas_personal_update ON public.dietas FOR UPDATE TO authenticated
  USING (public._personal_edita(user_id)) WITH CHECK (public._personal_edita(user_id));

/** Avisa o aluno quando o personal muda o treino ou a dieta dele direto pelo app. */
CREATE OR REPLACE FUNCTION public._avisar_plano_editado_pelo_personal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_acomp UUID; v_tipo TEXT := CASE WHEN TG_TABLE_NAME = 'treinos' THEN 'treino' ELSE 'dieta' END;
BEGIN
  -- só edição direta feita pelo personal (as funções "Enviar treino/dieta" já mandam a própria mensagem)
  IF current_user <> 'authenticated' OR auth.uid() IS NULL OR auth.uid() = NEW.user_id THEN RETURN NEW; END IF;
  SELECT id INTO v_acomp FROM public.acompanhamentos
  WHERE personal_id = auth.uid() AND aluno_id = NEW.user_id AND ativo LIMIT 1;
  IF v_acomp IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.acomp_mensagens m WHERE m.acompanhamento_id = v_acomp AND m.ref_id = NEW.id
             AND m.tipo = v_tipo AND m.created_at > NOW() - INTERVAL '20 minutes') THEN RETURN NEW; END IF;
  INSERT INTO public.acomp_mensagens (acompanhamento_id, autor_id, tipo, texto, ref_id)
  VALUES (v_acomp, auth.uid(), v_tipo,
          CASE WHEN v_tipo = 'treino' THEN 'Atualizei seu treino: ' ELSE 'Atualizei sua dieta: ' END || left(coalesce(NEW.nome, ''), 120),
          NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._avisar_plano_editado_pelo_personal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS treinos_aviso_personal ON public.treinos;
CREATE TRIGGER treinos_aviso_personal AFTER UPDATE ON public.treinos
  FOR EACH ROW EXECUTE FUNCTION public._avisar_plano_editado_pelo_personal();
DROP TRIGGER IF EXISTS dietas_aviso_personal ON public.dietas;
CREATE TRIGGER dietas_aviso_personal AFTER UPDATE ON public.dietas
  FOR EACH ROW EXECUTE FUNCTION public._avisar_plano_editado_pelo_personal();
