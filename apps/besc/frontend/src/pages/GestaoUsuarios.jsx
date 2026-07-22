import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, SkeletonList, HelpCallout, Field, ConfirmButton } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';

const ROLE_LABELS = { public: 'Público', investor: 'Investidor', lawyer: 'Advogado', judge: 'Juiz', manager: 'Gestor', admin: 'Administrador' };
const APPROVAL = {
  pending_approval: { l: 'Pendente de aprovação', c: 'b-amber' },
  active: { l: 'Aprovado', c: 'b-green' },
  rejected: { l: 'Rejeitado', c: 'b-red' },
};

function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/409|último gestor|last manager/i.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Operação bloqueada por uma trava de segurança.';
  if (/403/i.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Você não tem permissão para esta ação.';
  return m || 'Não foi possível concluir a operação.';
}

function fmtDate(s) { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR'); }

// GESTÃO DE USUÁRIOS (users:manage). Aprovar/rejeitar investidores, ativar/desativar,
// conceder/revogar papéis (rbac:manage), convidar (rbac:invite) e conceder acesso de
// auditoria a títulos (rbac:invite). Toda mutação sensível é auditada no backend.
export default function GestaoUsuarios() {
  const { hasPerm } = useAuth();
  const canManageRoles = hasPerm('rbac:manage');
  const canInvite = hasPerm('rbac:invite');

  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState(null); // de /meta/permissions (só se canManageRoles)
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    api.admin.users().then((u) => setUsers(Array.isArray(u) ? u : [])).catch((e) => setError(friendly(e.message)));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!canManageRoles) return;
    api.admin.permissions().then((p) => setRoles(p.roles || [])).catch(() => setRoles([]));
  }, [canManageRoles]);

  // ação que executa, mostra erro amigável e recarrega os usuários
  const run = async (promise) => {
    setError(null);
    try { await promise; load(); return true; } catch (e) { setError(friendly(e.message)); return false; }
  };

  const roleLabel = (k) => (roles && roles.find((r) => r.key === k)?.label) || ROLE_LABELS[k] || k;

  return (
    <>
      <div className="crumbs"><Link to="/casos">Gestão</Link> / Usuários e acesso</div>
      <div className="pgtitle"><h1><Icon name="user" size={22} /> Usuários e acesso</h1></div>

      <HelpCallout title="Quem entra e o que pode">
        Qualquer pessoa cria a própria conta e fica <strong>pendente, sem acesso</strong>. Para liberar,
        <strong> escolha um perfil</strong> na coluna “Papéis” e clique <em>Conceder acesso</em> — isso já
        aprova e libera a conta (não precisa de passo separado). Use <em>Rejeitar</em> para bloquear um
        cadastro indevido. Convide <strong>advogados e juízes</strong> (que não têm auto-cadastro) e conceda-lhes
        acesso de auditoria a títulos específicos. <strong>Tudo é auditado</strong>; travas de segurança impedem,
        por exemplo, desativar o <em>último Gestor</em>.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      {canInvite && <InvitePanel roles={roles} roleLabel={roleLabel} />}
      {canInvite && <GrantAccessPanel />}

      {!users && !error && <SkeletonList count={5} lines={2} />}

      {users && users.length === 0 && (
        <div className="card"><div className="empty"><h3>Nenhum usuário</h3><p className="muted">Nenhuma conta cadastrada ainda.</p></div></div>
      )}

      {users && users.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Usuários ({users.length})</h3></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Usuário</th><th>Papéis</th><th>Aprovação</th><th>Ativo</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u.id} user={u} roles={roles} roleLabel={roleLabel}
                    canManageRoles={canManageRoles} run={run}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function UserRow({ user, roles, roleLabel, canManageRoles, run }) {
  const [addRole, setAddRole] = useState('');
  const ap = APPROVAL[user.approval_status] || { l: user.approval_status || '—', c: 'b-grey' };
  const userRoles = Array.isArray(user.roles) ? user.roles : [];
  // 'public' é pseudo-papel do anônimo — nunca atribuível a uma conta
  const assignable = (roles || []).filter((r) => !userRoles.includes(r.key) && r.key !== 'public');
  const noAccessYet = userRoles.length === 0;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{user.name || '(sem nome)'}</div>
        <div className="small muted">{user.email}</div>
      </td>
      <td>
        <div className="chip-row">
          {userRoles.length === 0 && <span className="small muted">—</span>}
          {userRoles.map((k) => (
            <span key={k} className="chip">
              {roleLabel(k)}
              {canManageRoles && (
                <button
                  type="button"
                  title={`Remover o papel ${roleLabel(k)}`}
                  aria-label={`Remover o papel ${roleLabel(k)}`}
                  onClick={() => run(api.admin.revokeRole(user.id, k))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', lineHeight: 1, padding: 0, marginLeft: 2, opacity: 0.7 }}
                >×</button>
              )}
            </span>
          ))}
        </div>
        {canManageRoles && assignable.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <select value={addRole} onChange={(e) => setAddRole(e.target.value)} style={{ maxWidth: 170 }}>
              <option value="">{noAccessYet ? 'Escolher o perfil…' : '+ papel…'}</option>
              {assignable.map((r) => <option key={r.key} value={r.key}>{r.label || r.key}</option>)}
            </select>
            <button
              type="button" className={noAccessYet ? 'btn primary sm' : 'btn sm'}
              disabled={!addRole}
              title={noAccessYet ? 'Conceder este perfil já libera o acesso (aprova a conta)' : undefined}
              onClick={async () => { const ok = await run(api.admin.grantRole(user.id, addRole)); if (ok) setAddRole(''); }}
            >{noAccessYet ? 'Conceder acesso' : 'Conceder'}</button>
          </div>
        )}
        {canManageRoles && noAccessYet && (
          <div className="small muted" style={{ marginTop: 4 }}>Escolha um perfil para liberar o acesso.</div>
        )}
      </td>
      <td><span className={`badge ${ap.c}`}>{ap.l}</span></td>
      <td><span className={`badge ${user.is_active ? 'b-green' : 'b-grey'}`}>{user.is_active ? 'Ativo' : 'Inativo'}</span></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {user.approval_status === 'pending_approval' && (
          <>
            <button className="btn primary sm" onClick={() => run(api.admin.patchUser(user.id, { approvalStatus: 'active' }))}><Icon name="check" size={13} /> Aprovar</button>{' '}
            <ConfirmButton className="btn sm" label="Rejeitar" confirmLabel="Confirmar rejeição?" onConfirm={() => run(api.admin.patchUser(user.id, { approvalStatus: 'rejected' }))} />{' '}
          </>
        )}
        {user.is_active
          ? <ConfirmButton className="btn danger sm" label="Desativar" confirmLabel="Confirmar desativação?" onConfirm={() => run(api.admin.patchUser(user.id, { isActive: false }))} />
          : <button className="btn sm" onClick={() => run(api.admin.patchUser(user.id, { isActive: true }))}>Ativar</button>}
      </td>
    </tr>
  );
}

// ---- Convidar advogado/juiz/gestor (token exibido UMA vez) ----
function InvitePanel({ roles, roleLabel }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('lawyer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // {token, expiresInDays, email, roleKey}
  const [copied, setCopied] = useState(false);

  // papéis convidáveis: qualquer papel exceto 'admin' e o pseudo-papel 'public'
  const inviteRoles = useMemo(() => {
    const base = (roles && roles.length)
      ? roles.filter((r) => r.key !== 'admin' && r.key !== 'public').map((r) => ({ key: r.key, label: r.label || r.key }))
      : [{ key: 'lawyer', label: 'Advogado' }, { key: 'judge', label: 'Juiz' }, { key: 'manager', label: 'Gestor' }];
    return base;
  }, [roles]);

  const submit = async () => {
    if (!email.trim()) { setError('Informe o e-mail do convidado.'); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api.admin.invite({ email: email.trim(), roleKey });
      setResult({ ...r, email: email.trim(), roleKey });
      setEmail('');
    } catch (e) { setError(friendly(e.message)); }
    setBusy(false);
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* usuário copia manualmente */ }
  };

  // Link de resgate completo (rota pública /convite/:token). BASE_URL = '/besc/' (Vite), então
  // vira <origin>/besc/convite/<token> — é o que o convidado abre para definir a senha e entrar.
  const resgateUrl = result ? `${window.location.origin}${import.meta.env.BASE_URL}convite/${result.token}` : '';

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3><Icon name="login" size={15} /> Convidar usuário qualificado</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => { setOpen((o) => !o); setResult(null); setError(null); }}>{open ? 'Fechar' : 'Convidar'}</button>
      </div>
      {open && (
        <div className="card-body">
          <p className="small muted" style={{ marginTop: 0 }}>
            Advogados e juízes <strong>não têm auto-cadastro</strong> — entram só por convite. Não há envio de e-mail
            pela plataforma: <strong>o link de resgate abaixo é exibido uma única vez</strong> e você o repassa
            manualmente ao convidado, que define a própria senha e ativa o acesso.
          </p>
          <Banner kind="err">{error}</Banner>
          <div className="form-grid">
            <Field label="E-mail do convidado"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com.br" /></Field>
            <Field label="Papel"><select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>{inviteRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
          </div>
          <div className="row"><button className="btn primary" disabled={busy || !email.trim()} onClick={submit}>{busy ? <span className="spinner" /> : <Icon name="login" size={14} />} Gerar convite</button></div>

          {result && (
            <div className="banner info" style={{ marginTop: 14 }}>
              <div><strong>Convite gerado para {result.email}</strong> como <strong>{roleLabel(result.roleKey)}</strong>. Válido por {result.expiresInDays} dia(s).</div>
              <div className="small" style={{ marginTop: 8 }}>Envie o <strong>link de resgate</strong> ao convidado — ele abre a página, define a senha e ativa o acesso sozinho:</div>
              <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'stretch' }}>
                <code style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>{resgateUrl}</code>
                <button type="button" className="btn sm" onClick={() => copy(resgateUrl)}>{copied ? 'Copiado!' : 'Copiar link'}</button>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                <Icon name="alert" size={12} /> Repasse agora por um canal próprio: por segurança, <strong>este link não será mostrado de novo</strong>.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Conceder acesso de auditoria (escopo linked) a um título específico ----
// DECISÃO (documentada): a gestão de grants vive aqui, na tela de Usuários — o Gestor
// vincula um advogado/juiz (por e-mail) a um título, concedendo-lhe o escopo `linked`.
// O usuário precisa já existir (convide-o antes). Endpoints: /titles/:id/grants (rbac:invite).
function GrantAccessPanel() {
  const [open, setOpen] = useState(false);
  const [titles, setTitles] = useState(null);
  const [titleId, setTitleId] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [grants, setGrants] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  useEffect(() => {
    if (!open || titles) return;
    // reusa GET /titles (titles:read — o Gestor tem) só para listar id+label no seletor
    api.mkt.titles().then((t) => setTitles(Array.isArray(t) ? t : [])).catch(() => setTitles([]));
  }, [open, titles]);

  const loadGrants = (tid) => {
    if (!tid) { setGrants(null); return; }
    setGrants(null);
    api.admin.grants(tid).then((g) => setGrants(Array.isArray(g) ? g : [])).catch(() => setGrants([]));
  };
  useEffect(() => { loadGrants(titleId); }, [titleId]);

  const submit = async () => {
    if (!titleId || !email.trim()) { setError('Selecione um título e informe o e-mail.'); return; }
    setBusy(true); setError(null); setOk(null);
    try {
      await api.admin.grant(titleId, { userEmail: email.trim(), purpose: purpose.trim() || undefined });
      setOk(`Acesso concedido a ${email.trim()}.`);
      setEmail(''); setPurpose('');
      loadGrants(titleId);
    } catch (e) { setError(friendly(e.message)); }
    setBusy(false);
  };

  const revoke = async (userId) => {
    setError(null);
    try { await api.admin.revokeGrant(titleId, userId); loadGrants(titleId); } catch (e) { setError(friendly(e.message)); }
  };

  const activeGrants = (grants || []).filter((g) => !g.revoked_at);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3><Icon name="gavel" size={15} /> Acesso de auditoria a títulos</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => { setOpen((o) => !o); setOk(null); setError(null); }}>{open ? 'Fechar' : 'Conceder acesso'}</button>
      </div>
      {open && (
        <div className="card-body">
          <p className="small muted" style={{ marginTop: 0 }}>
            Vincule um <strong>advogado ou juiz</strong> (por e-mail) a um título — ele passa a vê-lo, somente leitura,
            no <Link to="/auditoria">Portal de auditoria</Link>. O usuário precisa já existir; <strong>convide-o antes</strong>.
          </p>
          <Banner kind="err">{error}</Banner>
          {ok && <Banner kind="info">{ok}</Banner>}
          <div className="form-grid">
            <Field label="Título">
              <select value={titleId} onChange={(e) => setTitleId(e.target.value)}>
                <option value="">— selecione um título —</option>
                {(titles || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="E-mail do auditor"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="advogado@exemplo.com.br" /></Field>
            <div className="full"><Field label="Finalidade (opcional)"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ex.: perícia no processo 0001234-56.2010.8.24.0023" /></Field></div>
          </div>
          <div className="row"><button className="btn primary" disabled={busy || !titleId || !email.trim()} onClick={submit}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Conceder acesso</button></div>

          {titleId && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ fontSize: 13, marginBottom: 8 }}>Acessos vigentes para este título</h4>
              {grants === null && <p className="small muted">Carregando…</p>}
              {Array.isArray(grants) && activeGrants.length === 0 && <p className="small muted">Nenhum acesso concedido para este título.</p>}
              {activeGrants.length > 0 && (
                <table className="data">
                  <thead><tr><th>Auditor</th><th>Finalidade</th><th>Concedido em</th><th></th></tr></thead>
                  <tbody>
                    {activeGrants.map((g) => (
                      <tr key={g.user_id}>
                        <td>{g.name || g.email}<div className="small muted">{g.email}</div></td>
                        <td className="small">{g.purpose || '—'}</td>
                        <td className="small">{fmtDate(g.granted_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <ConfirmButton className="btn danger sm" label="Revogar" confirmLabel="Confirmar revogação?" onConfirm={() => revoke(g.user_id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
