import React, { useCallback, useEffect, useState } from 'react';
import {
  pmListMembers,
  pmCreateMember,
  pmSetMemberProjects,
  pmUpdateMember,
  pmDeleteMember,
  pmProjects,
} from '../api.js';

/**
 * AccessAdmin — "Usuários" (somente para platform-admins).
 * Cadastra usuários restritos (acessam só "Projetos & Tarefas") e define a quais
 * projetos cada um tem acesso. Identidade no Keycloak (grupo project-members);
 * o mapa usuário->projeto vive no pm-api. Reusa o design system do Console.
 */
export default function AccessAdmin() {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kcConfigured, setKcConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [created, setCreated] = useState(null); // { email, tempPassword }

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([pmListMembers(), pmProjects()]);
      setMembers(m?.members || []);
      setKcConfigured(m?.keycloakConfigured !== false);
      setProjects(p || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); setErr(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const createMember = () => run(async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) { setErr('Informe o e-mail.'); return; }
    const res = await pmCreateMember({ email, name: newName.trim() || undefined });
    setCreated(res?.tempPassword ? { email: res.email, tempPassword: res.tempPassword } : null);
    setNewEmail('');
    setNewName('');
    await load();
  });

  const toggleProject = (member, projectId) => run(async () => {
    const ids = new Set((member.projects || []).map((p) => p.id));
    if (ids.has(projectId)) ids.delete(projectId); else ids.add(projectId);
    await pmSetMemberProjects(member.email, [...ids]);
    await load();
  });

  const toggleDisabled = (member) => run(async () => {
    await pmUpdateMember(member.email, { disabled: !member.disabled });
    await load();
  });

  const removeMember = (member) => run(async () => {
    // eslint-disable-next-line no-alert
    if (!confirm(`Remover o acesso de ${member.email}? Ele perde os projetos e é desabilitado.`)) return;
    await pmDeleteMember(member.email);
    await load();
  });

  if (loading) return <p className="state state--loading">Carregando usuários…</p>;

  return (
    <div className="meta">
      {err && <div className="state state--error" role="alert">⚠ {err}</div>}

      {!kcConfigured && (
        <div className="app-card">
          <p className="app-card__meta" style={{ margin: 0 }}>
            ⚠ A criação de usuários no Keycloak não está configurada neste ambiente. Crie o usuário no
            Keycloak (grupo <code>project-members</code>) e depois vincule os projetos aqui pelo e-mail.
          </p>
        </div>
      )}

      {created && (
        <div className="app-card">
          <h3 className="app-card__title">Usuário criado · {created.email}</h3>
          <p className="app-card__meta" style={{ margin: '4px 0' }}>
            Senha temporária (exibida só agora): <code>{created.tempPassword}</code>
            <button
              className="btn"
              style={{ marginLeft: 8, fontSize: '.78rem', padding: '2px 8px' }}
              onClick={() => navigator.clipboard?.writeText(created.tempPassword)}
            >
              copiar
            </button>
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>O usuário troca a senha no primeiro login.</p>
        </div>
      )}

      {/* Criar usuário */}
      <div className="app-card">
        <h3 className="app-card__title">Novo usuário restrito</h3>
        <p className="app-card__meta">Acessa apenas "Projetos &amp; Tarefas", restrito aos projetos marcados.</p>
        <div className="toolbar" style={{ marginTop: 10, gap: 8 }}>
          <input
            className="input"
            style={{ minWidth: 220 }}
            placeholder="e-mail do usuário"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <input
            className="input"
            style={{ minWidth: 180 }}
            placeholder="nome (opcional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn btn--primary" disabled={busy || !newEmail.trim()} onClick={createMember}>+ usuário</button>
        </div>
      </div>

      <div className="section-title" style={{ margin: '16px 0 8px' }}>Usuários restritos ({members.length})</div>
      {!members.length && <p className="muted">Nenhum usuário restrito ainda. Crie um acima.</p>}

      {members.map((m) => (
        <div key={m.email} className="app-card" style={{ marginBottom: 10 }}>
          <div className="app-card__head">
            <div>
              <h3 className="app-card__title">
                {m.displayName || m.email}{' '}
                {m.disabled && <span className="badge badge-warn">desabilitado</span>}
              </h3>
              <p className="app-card__meta">{m.email}</p>
            </div>
            <div className="app-card__urls">
              <button className="btn" disabled={busy} onClick={() => toggleDisabled(m)}>
                {m.disabled ? 'reativar' : 'desabilitar'}
              </button>
              <button className="btn btn--danger" disabled={busy} onClick={() => removeMember(m)}>remover</button>
            </div>
          </div>
          <div className="app-section">
            <span className="app-section__label">Projetos com acesso ({(m.projects || []).length})</span>
            <div className="chips" style={{ gap: 12 }}>
              {projects.map((p) => {
                const has = (m.projects || []).some((mp) => mp.id === p.id);
                return (
                  <label key={p.id} className="check-inline" style={{ paddingBottom: 0 }}>
                    <input type="checkbox" checked={has} disabled={busy} onChange={() => toggleProject(m, p.id)} /> {p.name}
                  </label>
                );
              })}
              {!projects.length && <span className="muted">Nenhum projeto cadastrado.</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
