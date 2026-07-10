import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Banner, Field, Loading } from '../ui.jsx';
import { Icon } from '../icons.jsx';

// Só aceita destinos internos da SPA (evita open redirect via ?next=).
function safeNext(raw) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/casos';
}

function friendlyError(err, fallback) {
  const m = (err && err.message) || '';
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  }
  return m || fallback;
}

// ---- /entrar — login local (e-mail+senha) + SSO Keycloak (realm besc) ----
export default function Entrar() {
  const { user, loading, login, loginSso } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    api.auth.config()
      .then((cfg) => { if (alive) setSsoEnabled(!!(cfg && cfg.ssoEnabled)); })
      .catch(() => { /* sem config → segue só com login local */ });
    return () => { alive = false; };
  }, []);

  if (loading) return <Loading label="Verificando sessão…" />;
  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Informe seu e-mail e sua senha.'); return; }
    setBusy(true); setError(null);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      const m = (err && err.message) || '';
      setError(/401|invalid|incorret|credencia|senha/i.test(m)
        ? 'E-mail ou senha incorretos. Confira os dados e tente de novo.'
        : friendlyError(err, 'Não foi possível entrar. Tente novamente.'));
      setBusy(false);
    }
  };

  const sso = async () => {
    setSsoBusy(true); setError(null);
    try {
      sessionStorage.setItem('besc_next', next);
      await loginSso(); // redireciona para o Keycloak — não volta desta chamada
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível iniciar o login com SSO. Tente novamente.'));
      setSsoBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-head">
        <div className="ah-ic"><Icon name="lock" size={24} /></div>
        <h1>Entrar no Portal BESC</h1>
        <p>A área de casos é restrita. O conteúdo público — biblioteca, jurisprudência e referência — continua aberto, sem login.</p>
      </div>
      <div className="card auth-card">
        <div className="card-body">
          <Banner kind="err">{error}</Banner>
          <form onSubmit={submit}>
            <Field label="E-mail">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com.br"
                autoComplete="email"
                autoFocus
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
              />
            </Field>
            <div className="auth-actions">
              <button type="submit" className="btn primary" disabled={busy || ssoBusy}>
                {busy ? 'Entrando…' : <>Entrar <Icon name="login" size={14} /></>}
              </button>
            </div>
          </form>
          {ssoEnabled && (
            <>
              <div className="auth-divider">ou</div>
              <div className="auth-actions">
                <button type="button" className="btn" onClick={sso} disabled={busy || ssoBusy}>
                  <Icon name="shield" size={15} /> {ssoBusy ? 'Redirecionando…' : 'Entrar com SSO'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="auth-foot">
        Sem acesso? Fale com o gestor da plataforma. <Link to="/">Voltar ao início</Link>
      </p>
    </div>
  );
}

// ---- /entrar/callback — consome code/state do Keycloak e fecha a sessão do app ----
export function EntrarCallback() {
  const { completeSsoCallback } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const ranRef = useRef(false); // evita troca dupla do code no StrictMode (dev)

  useEffect(() => {
    if (ranRef.current) return undefined;
    ranRef.current = true;

    const kcError = params.get('error');
    const code = params.get('code');
    const state = params.get('state');
    if (kcError) {
      setError('O provedor de identidade recusou o login. Tente novamente ou use o login com e-mail e senha.');
      return undefined;
    }
    if (!code) {
      setError('Retorno do login incompleto (código de autorização ausente). Tente entrar de novo.');
      return undefined;
    }

    let alive = true;
    completeSsoCallback({ code, state })
      .then(() => {
        const next = safeNext(sessionStorage.getItem('besc_next'));
        sessionStorage.removeItem('besc_next');
        if (alive) navigate(next, { replace: true });
      })
      .catch((err) => {
        if (alive) setError(friendlyError(err, 'Não foi possível concluir o login com SSO. Tente entrar de novo.'));
      });
    return () => { alive = false; };
    // roda uma única vez, no retorno do Keycloak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="empty">
        <h3>Falha ao concluir o login</h3>
        <p>{error}</p>
        <p><Link to="/entrar" className="btn sm">Tentar novamente</Link></p>
      </div>
    );
  }
  return <Loading label="Concluindo o login com SSO…" />;
}
