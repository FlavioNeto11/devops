import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, Loading, HelpCallout, Field, ConfirmButton } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const SCOPE_LABEL = { all: 'Todos', own: 'Próprio', linked: 'Vinculado' };
const CATEGORY_LABEL = {
  conteudo: 'Conteúdo', casos: 'Casos', administracao: 'Administração',
  auditoria: 'Auditoria', marketplace: 'Marketplace', investidor: 'Investidor',
};

function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/403/i.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Você não tem permissão para esta ação.';
  if (/409|já existe/i.test(m)) return m.replace(/^Erro \d+:?\s*/, '') || 'Já existe um papel com essa chave.';
  return m || 'Não foi possível concluir a operação.';
}

const hasWildcard = (role) => (role.permissions || []).some((p) => p.key === '*');

// GESTÃO DE PAPÉIS (rbac:manage). Matriz papel × permissão, criação de papel novo
// (sem deploy) e edição da matriz de permissões/escopos de um papel. Papéis de sistema
// (is_system) não podem ser excluídos nem ter a chave alterada — mas suas permissões
// podem ser recombinadas. Toda mudança é auditada no backend.
export default function GestaoPapeis() {
  const [data, setData] = useState(null); // {catalog, scopes, roles}
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    return api.admin.permissions().then(setData).catch((e) => setError(friendly(e.message)));
  };
  useEffect(() => { load(); }, []);

  if (error && !data) {
    return (
      <>
        <div className="crumbs"><Link to="/casos">Gestão</Link> / Papéis</div>
        <div className="empty"><h3><Icon name="lock" size={16} /> Não foi possível carregar</h3><p>{error}</p></div>
      </>
    );
  }
  if (!data) return <Loading label="Carregando papéis e permissões…" />;

  const { catalog = [], scopes = ['own', 'linked', 'all'], roles = [] } = data;

  return (
    <>
      <div className="crumbs"><Link to="/casos">Gestão</Link> / Papéis</div>
      <div className="pgtitle"><h1><Icon name="shield" size={22} /> Papéis e permissões</h1></div>

      <HelpCallout title="RBAC em dados — papel novo sem deploy">
        Papéis são <strong>dados</strong>, não código: crie um papel novo, recombine permissões e escopos e salve —
        <strong> sem nenhum deploy</strong>. O que exige deploy é só uma <em>permissão</em> nova (recurso/ação inédita),
        pois o catálogo vem do código. Papéis de <strong>sistema</strong> não podem ser excluídos nem renomeados, mas
        têm as permissões editáveis. <strong>Toda mudança aqui é auditada.</strong>
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      <div className="stack">
        <CreateRolePanel onCreated={load} />
        <MatrixOverview catalog={catalog} roles={roles} />
        <RoleEditor catalog={catalog} scopes={scopes} roles={roles} onChanged={load} />
      </div>
    </>
  );
}

// Matriz read-only: papéis (colunas) × permissões (linhas), agrupada por categoria.
function MatrixOverview({ catalog, roles }) {
  const grouped = useMemo(() => groupByCategory(catalog), [catalog]);
  return (
    <div className="card">
      <div className="card-head"><h3>Matriz papel × permissão</h3><span className="small muted" style={{ marginLeft: 8 }}>visão geral (somente leitura)</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Permissão</th>
              {roles.map((r) => <th key={r.id} style={{ whiteSpace: 'nowrap' }}>{r.label || r.key}{r.is_system && <span title="papel de sistema" className="small muted"> ⛨</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ category, perms }) => (
              <React.Fragment key={category}>
                <tr><td colSpan={roles.length + 1} style={{ background: 'var(--surface-2)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--faint)' }}>{CATEGORY_LABEL[category] || category}</td></tr>
                {perms.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.label}</div>
                      <div className="small muted" style={{ fontFamily: 'monospace' }}>{p.key}{p.sensitive && <span className="badge b-amber" style={{ marginLeft: 6, padding: '0 7px', fontSize: 10 }}>sensível</span>}</div>
                    </td>
                    {roles.map((r) => {
                      if (hasWildcard(r)) return <td key={r.id} style={{ textAlign: 'center' }}><span className="badge b-teal" style={{ padding: '1px 7px', fontSize: 10 }}>total</span></td>;
                      const granted = (r.permissions || []).find((x) => x.key === p.key);
                      return <td key={r.id} style={{ textAlign: 'center' }}>{granted ? <span className="chip chip-green" style={{ fontSize: 10 }}>{SCOPE_LABEL[granted.scope] || granted.scope}</span> : <span className="muted">·</span>}</td>;
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Criar papel novo (key + label + descrição).
function CreateRolePanel({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const keyValid = /^[a-z][a-z0-9_]{1,40}$/.test(key);

  const submit = async () => {
    if (!keyValid || !label.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.admin.createRole({ key, label: label.trim(), description: description.trim() || undefined });
      setKey(''); setLabel(''); setDescription(''); setOpen(false);
      onCreated();
    } catch (e) { setError(friendly(e.message)); }
    setBusy(false);
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="plus" size={15} /> Novo papel</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => { setOpen((o) => !o); setError(null); }}>{open ? 'Fechar' : 'Criar papel'}</button>
      </div>
      {open && (
        <div className="card-body">
          <p className="small muted" style={{ marginTop: 0 }}>Depois de criar, defina as permissões do papel no editor abaixo. O papel nasce sem nenhuma permissão.</p>
          <Banner kind="err">{error}</Banner>
          <div className="form-grid">
            <Field label="Chave (key)" hint="minúsculas, números e _ (ex.: auditor_bacen)"><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auditor_bacen" /></Field>
            <Field label="Rótulo"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Auditor BACEN" /></Field>
            <div className="full"><Field label="Descrição (opcional)"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Leitura ampla para auditoria externa" /></Field></div>
          </div>
          {key && !keyValid && <Banner kind="warn">A chave deve começar com letra minúscula e conter apenas letras minúsculas, números e underscore (2 a 41 caracteres).</Banner>}
          <div className="row"><button className="btn primary" disabled={busy || !keyValid || !label.trim()} onClick={submit}>{busy ? <span className="spinner" /> : <Icon name="plus" size={14} />} Criar papel</button></div>
        </div>
      )}
    </div>
  );
}

// Editor da matriz permissão × escopo de UM papel.
function RoleEditor({ catalog, scopes, roles, onChanged }) {
  const [roleId, setRoleId] = useState('');
  const [edit, setEdit] = useState({}); // {permKey: scope}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const role = roles.find((r) => String(r.id) === String(roleId)) || null;
  const wildcard = role ? hasWildcard(role) : false;
  const grouped = useMemo(() => groupByCategory(catalog), [catalog]);

  // ao trocar o papel, carrega o estado atual das permissões
  useEffect(() => {
    if (!role) { setEdit({}); return; }
    const m = {};
    for (const p of (role.permissions || [])) { if (p.key !== '*') m[p.key] = p.scope || 'all'; }
    setEdit(m); setSaved(false); setError(null);
  }, [roleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key) => setEdit((e) => { const n = { ...e }; if (n[key]) delete n[key]; else n[key] = 'all'; return n; });
  const setScope = (key, scope) => setEdit((e) => ({ ...e, [key]: scope }));

  const save = async () => {
    if (!role) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const perms = Object.entries(edit).map(([key, scope]) => ({ key, scope }));
      await api.admin.setRolePerms(role.id, perms);
      setSaved(true);
      onChanged();
    } catch (e) { setError(friendly(e.message)); }
    setBusy(false);
  };

  const del = async () => {
    if (!role) return;
    setError(null);
    try { await api.admin.deleteRole(role.id); setRoleId(''); onChanged(); } catch (e) { setError(friendly(e.message)); }
  };

  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="edit" size={15} /> Editar permissões de um papel</h3></div>
      <div className="card-body">
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <Field label="Papel">
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">— selecione um papel —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label || r.key}{r.is_system ? ' (sistema)' : ''}</option>)}
            </select>
          </Field>
          {role && !role.is_system && (
            <div style={{ alignSelf: 'flex-end', marginBottom: 15 }}>
              <ConfirmButton className="btn danger sm" label="Excluir papel" confirmLabel="Confirmar exclusão?" onConfirm={del} />
            </div>
          )}
        </div>

        <Banner kind="err">{error}</Banner>
        {saved && <Banner kind="info">Permissões salvas. A mudança foi registrada na trilha de auditoria.</Banner>}

        {!role && <p className="muted">Selecione um papel para ver e editar suas permissões.</p>}

        {role && role.is_system && <Banner kind="warn">Este é um papel de <strong>sistema</strong>: a chave não muda e ele não pode ser excluído. As permissões abaixo <strong>podem</strong> ser recombinadas.</Banner>}

        {role && wildcard && (
          <Banner kind="info">Este papel possui o <strong>curinga (*)</strong> — acesso total à plataforma. Para evitar remoção acidental do administrador, a edição fica desabilitada aqui.</Banner>
        )}

        {role && !wildcard && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Permissão</th><th style={{ width: 90, textAlign: 'center' }}>Concedida</th><th style={{ width: 160 }}>Escopo</th></tr></thead>
                <tbody>
                  {grouped.map(({ category, perms }) => (
                    <React.Fragment key={category}>
                      <tr><td colSpan={3} style={{ background: 'var(--surface-2)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--faint)' }}>{CATEGORY_LABEL[category] || category}</td></tr>
                      {perms.map((p) => {
                        const on = Object.prototype.hasOwnProperty.call(edit, p.key);
                        return (
                          <tr key={p.key}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{p.label}</div>
                              <div className="small muted" style={{ fontFamily: 'monospace' }}>{p.key}{p.sensitive && <span className="badge b-amber" style={{ marginLeft: 6, padding: '0 7px', fontSize: 10 }}>sensível</span>}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={on} onChange={() => toggle(p.key)} aria-label={`Conceder ${p.label}`} style={{ width: 'auto' }} />
                            </td>
                            <td>
                              <select value={edit[p.key] || 'all'} onChange={(e) => setScope(p.key, e.target.value)} disabled={!on}>
                                {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s] || s}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Salvar permissões</button>
              <span className="small muted">{Object.keys(edit).length} permissão(ões) marcada(s).</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function groupByCategory(catalog) {
  const order = ['conteudo', 'casos', 'marketplace', 'investidor', 'auditoria', 'administracao'];
  const map = new Map();
  for (const p of catalog) {
    const c = p.category || 'outros';
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(p);
  }
  const cats = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return cats.map((category) => ({ category, perms: map.get(category) }));
}
