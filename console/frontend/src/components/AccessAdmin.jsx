import React, { useCallback, useEffect, useState } from 'react';
import {
  pmListMembers, pmCreateMember, pmSetMemberProjects,
  pmUpdateMember, pmDeleteMember, pmResetMemberPassword, pmProjects,
} from '../api.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import PageHeader from './PageHeader.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { useToast } from './ToastProvider.jsx';

/**
 * AccessAdmin — "Usuários" (platform-admins). Cadastra usuários restritos e define a quais
 * projetos cada um tem acesso. Senha temporária exibida em modal com "copiar" (e pode ser
 * redefinida a qualquer momento). Feedback por toast; remoção confirmada por diálogo.
 */
export default function AccessAdmin() {
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kcConfigured, setKcConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [pwInfo, setPwInfo] = useState(null);     // { email, tempPassword } -> modal
  const [confirmRemove, setConfirmRemove] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([pmListMembers(), pmProjects()]);
      setMembers(m?.members || []);
      setKcConfigured(m?.keycloakConfigured !== false);
      setProjects(p || []);
    } catch (e) { toast.err(e.message); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast.err(e.message); } finally { setBusy(false); } };

  const createMember = () => run(async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) { toast.err('Informe o e-mail.'); return; }
    const res = await pmCreateMember({ email, name: newName.trim() || undefined });
    setCreateOpen(false);
    setNewEmail(''); setNewName('');
    await load();
    if (res?.tempPassword) { setPwInfo({ email: res.email, tempPassword: res.tempPassword }); toast.ok('Usuário criado.'); }
    else if (res?.keycloakConfigured === false) toast.info('Usuário registrado. Crie-o no Keycloak (grupo project-members) para o login.');
    else toast.ok('Usuário registrado.');
  });

  const resetPassword = (member) => run(async () => {
    const res = await pmResetMemberPassword(member.email);
    if (res?.tempPassword) { setPwInfo({ email: member.email, tempPassword: res.tempPassword }); toast.ok('Senha redefinida.'); }
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
    toast.ok(member.disabled ? 'Usuário reativado.' : 'Usuário desabilitado.');
  });

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <div className="meta">
      <PageHeader
        actions={<button className="btn btn--primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16} /> Novo usuário</button>}
      />

      {!kcConfigured && (
        <div className="app-card">
          <p className="app-card__meta" style={{ margin: 0 }}>
            <Icon name="alert" size={14} /> A criação no Keycloak não está configurada aqui. Crie o usuário no
            Keycloak (grupo <code>project-members</code>) e depois vincule os projetos por e-mail.
          </p>
        </div>
      )}

      {!members.length && (
        <EmptyState icon="users" title="Nenhum usuário restrito ainda"
          hint="Crie um usuário para dar acesso somente à tela de Projetos & Tarefas, restrito aos projetos que você marcar."
          action={<button className="btn btn--primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16} /> Novo usuário</button>} />
      )}

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
              <button className="btn" disabled={busy} onClick={() => resetPassword(m)} title="Gera e mostra uma nova senha temporária">
                <Icon name="key" size={15} /> redefinir senha
              </button>
              <button className="btn" disabled={busy} onClick={() => toggleDisabled(m)}>{m.disabled ? 'reativar' : 'desabilitar'}</button>
              <button className="btn btn--danger" disabled={busy} onClick={() => setConfirmRemove(m)}><Icon name="trash2" size={15} /> remover</button>
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

      {createOpen && (
        <Modal title="Novo usuário restrito" size="sm" onClose={() => setCreateOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button className="btn btn--primary" disabled={busy || !newEmail.trim()} onClick={createMember}>Criar</button>
          </>}>
          <p className="app-card__meta" style={{ marginTop: 0 }}>Acessa apenas Projetos &amp; Tarefas, restrito aos projetos que você marcar depois.</p>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">E-mail</span>
            <input className="input" placeholder="usuario@empresa.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Nome (opcional)</span>
            <input className="input" placeholder="Nome do usuário" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
        </Modal>
      )}

      {pwInfo && (
        <Modal title="Senha temporária" size="sm" onClose={() => setPwInfo(null)}
          footer={<button className="btn btn--primary" onClick={() => setPwInfo(null)}>Entendi</button>}>
          <p className="app-card__meta" style={{ marginTop: 0 }}>Usuário <strong>{pwInfo.email}</strong> — exibida só agora; ele troca no primeiro login.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ fontSize: '1rem', padding: '6px 10px', flex: 1 }}>{pwInfo.tempPassword}</code>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(pwInfo.tempPassword); toast.ok('Senha copiada.'); }}>
              <Icon name="check" size={15} /> copiar
            </button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remover acesso"
          message={`Remover o acesso de ${confirmRemove.email}? Ele perde os projetos e é desabilitado no login.`}
          confirmLabel="Remover" danger
          onClose={() => setConfirmRemove(null)}
          onConfirm={async () => { await pmDeleteMember(confirmRemove.email); await load(); toast.ok('Acesso removido.'); }}
        />
      )}
    </div>
  );
}
