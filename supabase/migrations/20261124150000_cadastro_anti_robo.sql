-- ============================================================
-- R2 Fit Pro — cadastro só de gente de verdade.
-- 1) E-mails temporários/descartáveis (mailinator, 10minutemail...) não criam conta.
-- 2) Teste grátis uma vez por e-mail real: fulano+1@gmail.com, f.u.l.a.n.o@gmail.com e fulano@gmail.com são a
--    mesma caixa de entrada; a conta é criada, mas sem um segundo teste grátis.
-- (A verificação "não sou robô" — Cloudflare Turnstile — fica no Supabase Auth: Bot and Abuse Protection.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.emails_descartaveis (dominio TEXT PRIMARY KEY);
ALTER TABLE public.emails_descartaveis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emails_descartaveis FROM anon, authenticated;

INSERT INTO public.emails_descartaveis (dominio) VALUES
 ('mailinator.com'),('mailinator.net'),('mailinator2.com'),('10minutemail.com'),('10minutemail.net'),('10minemail.com'),
 ('guerrillamail.com'),('guerrillamail.net'),('guerrillamail.org'),('guerrillamail.biz'),('guerrillamail.de'),('sharklasers.com'),
 ('grr.la'),('guerrillamailblock.com'),('pokemail.net'),('spam4.me'),('tempmail.com'),('temp-mail.org'),('temp-mail.io'),
 ('tempmail.net'),('tempmailo.com'),('tempmail.plus'),('tempmail.dev'),('tmpmail.org'),('tmpmail.net'),('tmpeml.com'),
 ('throwawaymail.com'),('yopmail.com'),('yopmail.net'),('yopmail.fr'),('cool.fr.nf'),('jetable.fr.nf'),('nospam.ze.tc'),
 ('nomail.xl.cx'),('mega.zik.dj'),('speed.1s.fr'),('courriel.fr.nf'),('moncourrier.fr.nf'),('monemail.fr.nf'),('monmail.fr.nf'),
 ('trashmail.com'),('trashmail.net'),('trashmail.de'),('trashmail.me'),('trashmail.io'),('wegwerfmail.de'),('wegwerfmail.net'),
 ('getnada.com'),('nada.email'),('dispostable.com'),('maildrop.cc'),('mailnesia.com'),('mintemail.com'),('mohmal.com'),
 ('mytemp.email'),('emailondeck.com'),('fakeinbox.com'),('fakemail.net'),('getairmail.com'),('airmail.cc'),('mailcatch.com'),
 ('mail-temp.com'),('tempinbox.com'),('tempr.email'),('discard.email'),('discardmail.com'),('discardmail.de'),('spambox.us'),
 ('spamgourmet.com'),('mailpoof.com'),('emailfake.com'),('fakemailgenerator.com'),('emailtemporario.com.br'),
 ('tempemail.co'),('tempemail.net'),('burnermail.io'),('inboxkitten.com'),('mailsac.com'),('harakirimail.com'),
 ('mailforspam.com'),('spamfree24.org'),('trbvm.com'),('owlymail.com'),('linshiyouxiang.net'),('byom.de'),('mvrht.com'),
 ('mail.tm'),('mailto.plus'),('fexpost.com'),('fexbox.org'),('rover.info'),('chitthi.in'),('inboxbear.com'),('emltmp.com'),
 ('1secmail.com'),('1secmail.org'),('1secmail.net'),('esiix.com'),('wwjmp.com'),('xojxe.com'),('yoggm.com'),('kzccv.com'),
 ('qiott.com'),('vjuum.com'),('laafd.com'),('txcct.com'),('dpptd.com'),('rteet.com'),('dcctb.com'),('emailnax.com'),
 ('tempmailaddress.com'),('crazymailing.com'),('mailbox.in.ua'),('anonbox.net'),('mailnull.com'),('incognitomail.org'),
 ('mail7.io'),('tempmail.us.com'),('dropmail.me'),('10mail.org'),('emlpro.com'),('emlhub.com'),('spymail.one'),
 ('minuteinbox.com'),('tempail.com'),('tempmails.net'),('etranquil.com'),('gufum.com'),('cuvox.de'),('dayrep.com'),
 ('einrot.com'),('fleckens.hu'),('gustr.com'),('jourrapide.com'),('rhyta.com'),('superrito.com'),('teleworm.us'),
 ('armyspy.com'),('boximail.com'),('clrmail.com'),('emailtemporar.ro'),('correotemporal.org'),('lroid.com'),('vomoto.com'),
 ('maillei.com'),('oranek.com'),('zslsz.com'),('ezztt.com'),('tmail.ws'),('tmails.net'),('mail.gw'),('smartnator.com')
ON CONFLICT DO NOTHING;

/** Caixa de entrada real: minúsculas, sem "+apelido"; no Gmail os pontos não contam. */
CREATE OR REPLACE FUNCTION public._email_normalizado(p TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE e TEXT := lower(btrim(coalesce(p, ''))); usuario TEXT; dominio TEXT;
BEGIN
  IF position('@' IN e) = 0 THEN RETURN e; END IF;
  usuario := split_part(e, '@', 1); dominio := split_part(e, '@', 2);
  IF dominio = 'googlemail.com' THEN dominio := 'gmail.com'; END IF;
  usuario := split_part(usuario, '+', 1);
  IF dominio = 'gmail.com' THEN usuario := replace(usuario, '.', ''); END IF;
  RETURN usuario || '@' || dominio;
END;
$$;

/** Antes de criar a conta: recusa e-mail descartável (e subdomínios dele) ou sem domínio de verdade. */
CREATE OR REPLACE FUNCTION public.bloquear_cadastro_suspeito()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE dominio TEXT := lower(split_part(coalesce(NEW.email, ''), '@', 2));
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF; -- (contas sem e-mail não existem no app)
  IF dominio = '' OR position('.' IN dominio) = 0 THEN
    RAISE EXCEPTION 'R2_EMAIL_INVALIDO' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.emails_descartaveis d WHERE dominio = d.dominio OR dominio LIKE '%.' || d.dominio) THEN
    RAISE EXCEPTION 'R2_EMAIL_DESCARTAVEL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS antes_cadastro_bloquear_suspeito ON auth.users;
CREATE TRIGGER antes_cadastro_bloquear_suspeito BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cadastro_suspeito();
-- mudar para um e-mail descartável também não vale
DROP TRIGGER IF EXISTS antes_troca_email_bloquear_suspeito ON auth.users;
CREATE TRIGGER antes_troca_email_bloquear_suspeito BEFORE UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (NEW.email IS DISTINCT FROM OLD.email) EXECUTE FUNCTION public.bloquear_cadastro_suspeito();

REVOKE ALL ON FUNCTION public._email_normalizado(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_cadastro_suspeito() FROM PUBLIC, anon, authenticated;

-- Caixas de entrada que já usaram o teste grátis: só o resumo (hash), sem o e-mail. Fica mesmo depois de a conta
-- ser excluída (senão: excluir e criar de novo daria outro teste).
CREATE TABLE IF NOT EXISTS public.testes_usados (email_hash TEXT PRIMARY KEY, em TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE public.testes_usados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.testes_usados FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public._email_hash(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(extensions.digest('r2fit:' || public._email_normalizado(p), 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION public._email_hash(TEXT) FROM PUBLIC, anon, authenticated;
-- quem já teve teste até hoje
INSERT INTO public.testes_usados (email_hash)
SELECT DISTINCT public._email_hash(p.email) FROM public.subscriptions s JOIN public.profiles p ON p.id = s.user_id
WHERE s.modalidade = 'teste' AND p.email IS NOT NULL
ON CONFLICT DO NOTHING;

-- Teste grátis uma vez por caixa de entrada real
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plano JSONB;
  v_dias  INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email, aceite_termos_em, versao_termos, marketing_opt_in)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1)), 120),
    NEW.email,
    CASE WHEN NEW.raw_user_meta_data ? 'versao_termos' THEN NOW() END,
    NEW.raw_user_meta_data ->> 'versao_termos',
    COALESCE((NEW.raw_user_meta_data ->> 'marketing_opt_in')::BOOLEAN, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  -- Teste grátis: nunca impede o cadastro, mesmo se algo falhar aqui
  BEGIN
    SELECT valor INTO v_plano FROM public.app_config WHERE chave = 'plano';
    v_dias := COALESCE((v_plano ->> 'teste_dias')::INTEGER, 0);
    IF v_dias > 0 AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = NEW.id)
       -- a mesma caixa de entrada (com "+apelido", pontos no Gmail, ou conta excluída e criada de novo) já teve teste
       AND NOT EXISTS (SELECT 1 FROM public.testes_usados t WHERE t.email_hash = public._email_hash(NEW.email))
    THEN
      INSERT INTO public.testes_usados (email_hash) VALUES (public._email_hash(NEW.email)) ON CONFLICT DO NOTHING;
      INSERT INTO public.subscriptions (user_id, provider, modalidade, status, provider_status, plano_nome,
                                        preco_centavos, iniciada_em, periodo_atual_fim)
      VALUES (NEW.id, 'teste', 'teste', 'ativa', 'teste', COALESCE(v_plano ->> 'nome', 'R2 Fit Pro Premium'),
              GREATEST(COALESCE((v_plano ->> 'preco_centavos')::INTEGER, 100), 100), NOW(), NOW() + make_interval(days => v_dias));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'teste grátis não criado para %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
