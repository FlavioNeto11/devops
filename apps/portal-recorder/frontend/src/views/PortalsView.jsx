import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listPortals,
  createPortal,
  listSessions,
  createSession,
  deletePortal,
  deleteSession,
} from '../api.js';
import { navigate } from '../router.js';

/**
 * PortalsView
 * -----------
 * Lista de portais (cards) + form "Novo portal" + por portal a lista de sessoes
 * com status e botao "Nova captura" (cria a sessao e navega para a tela de captura).
 */
export default function PortalsView() {
  const [portals, setPortals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ps, ss] = await Promise.all([listPortals(), listSessions()]);
      setPortals(Array.isArray(ps) ? ps : []);
      setSessions(Array.isArray(ss) ? ss : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sessoes agrupadas por portal_id (ordem: mais recentes primeiro).
  const sessionsByPortal = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!map.has(s.portal_id)) map.set(s.portal_id, []);
      map.get(s.portal_id).push(s);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
    }
    return map;
  }, [sessions]);

  return (
    <div className="view">
      <NewPortalForm onCreated={load} />

      {error && <div className="alert alert-err">{error}</div>}

      {loading ? (
        <div className="empty">Carregando portais…</div>
      ) : portals.length === 0 ? (
        <div className="empty">Nenhum portal ainda. Crie o primeiro acima.</div>
      ) : (
        <div className="portal-grid">
          {portals.map((p) => (
            <PortalCard
              key={p.id}
              portal={p}
              sessions={sessionsByPortal.get(p.id) || []}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewPortalForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [entryUrl, setEntryUrl] = useState('');
  const [spaKind, setSpaKind] = useState('');
  const [relatedKey, setRelatedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { slug: slug.trim(), name: name.trim(), entry_url: entryUrl.trim() };
      if (spaKind.trim()) body.spa_kind = spaKind.trim();
      if (relatedKey.trim()) body.related_project_key = relatedKey.trim();
      await createPortal(body);
      setSlug('');
      setName('');
      setEntryUrl('');
      setSpaKind('');
      setRelatedKey('');
      setOpen(false);
      onCreated();
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="view__head">
        <h2 className="view__title">Portais externos (captura)</h2>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          + Novo portal externo
        </button>
      </div>
    );
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="view__head">
        <h2 className="view__title">Novo portal externo</h2>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Cadastre aqui um portal <strong>de terceiros</strong> (ex.: CETESB/MTR) para capturar num
        browser remoto e normalizar o contrato. Portais/sites próprios (CMS) são criados no
        DevOps Console, em <em>Conteúdo → Novo portal</em>.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>slug</span>
          <input
            className="input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="cetesb-mtr"
            required
          />
        </label>
        <label className="field">
          <span>name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CETESB — MTR"
            required
          />
        </label>
        <label className="field field--wide">
          <span>entry_url</span>
          <input
            className="input"
            type="url"
            value={entryUrl}
            onChange={(e) => setEntryUrl(e.target.value)}
            placeholder="https://portal.example.gov.br/login"
            required
          />
        </label>
        <label className="field">
          <span>spa_kind (opcional)</span>
          <input
            className="input"
            value={spaKind}
            onChange={(e) => setSpaKind(e.target.value)}
            placeholder="angular | react | mpa…"
          />
        </label>
        <label className="field" title="Vínculo apenas relacional: marca que este portal externo alimenta/contextualiza um produto da plataforma (serve a IA, governança e relatórios). Não muda a captura.">
          <span>produto relacionado (opcional)</span>
          <input
            className="input"
            list="related-project-keys"
            value={relatedKey}
            onChange={(e) => setRelatedKey(e.target.value)}
            placeholder="ex.: sicat"
          />
          <datalist id="related-project-keys">
            <option value="sicat" />
            <option value="gymops" />
          </datalist>
        </label>
      </div>
      {err && <div className="alert alert-err">{err}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Criando…' : 'Criar portal externo'}
        </button>
      </div>
    </form>
  );
}

function PortalCard({ portal, sessions, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removingSession, setRemovingSession] = useState(null);

  const startCapture = async () => {
    setBusy(true);
    setErr(null);
    try {
      const session = await createSession(portal.id, {});
      // O backend devolve { id, status }. Navega direto para a captura.
      navigate(`#/capture/${session.id}`);
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };

  const removePortal = async () => {
    const n = sessions.length;
    const msg = n
      ? `Excluir o portal "${portal.name}" e TODAS as ${n} sessão(ões) de captura dele? Isso não pode ser desfeito.`
      : `Excluir o portal "${portal.name}"?`;
    if (!window.confirm(msg)) return;
    setRemoving(true);
    setErr(null);
    try {
      await deletePortal(portal.id);
      onChanged();
    } catch (e) {
      setErr(e.message || String(e));
      setRemoving(false);
    }
  };

  const removeSession = async (s) => {
    if (!window.confirm(`Excluir a captura "${s.title || s.id}" e seus eventos?`)) return;
    setRemovingSession(s.id);
    setErr(null);
    try {
      await deleteSession(s.id);
      onChanged();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setRemovingSession(null);
    }
  };

  return (
    <div className="card portal-card">
      <div className="portal-card__head">
        <div>
          <div className="portal-card__name">{portal.name}</div>
          <div className="portal-card__origin mono">{portal.base_origin || portal.entry_url}</div>
          {portal.slug && <span className="chip">{portal.slug}</span>}
          {portal.related_project_key && (
            <span className="chip" title="Produto da plataforma relacionado a este portal externo (vínculo declarativo)">
              ↳ {portal.related_project_key}
            </span>
          )}
        </div>
        <div className="portal-card__head-actions">
          <button className="btn btn-primary" onClick={startCapture} disabled={busy || removing}>
            {busy ? 'Abrindo…' : 'Nova captura'}
          </button>
          <button
            className="btn btn-ghost btn-sm btn-danger-ghost"
            onClick={removePortal}
            disabled={removing}
            title="Excluir o portal e todas as suas capturas"
          >
            {removing ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>

      {err && <div className="alert alert-err">{err}</div>}

      <div className="portal-card__sessions">
        {sessions.length === 0 ? (
          <div className="muted small">Sem sessoes ainda.</div>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id} className="session-row">
                <span className={'status status--' + statusKind(s.status)}>{s.status}</span>
                <span className="session-row__title">{s.title || '(sem titulo)'}</span>
                <span className="muted small">{s.event_count ?? 0} ev.</span>
                <span className="muted small">{fmtDate(s.started_at)}</span>
                <span className="session-row__actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`#/capture/${s.id}`)}>
                    Captura
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`#/review/${s.id}`)}>
                    Revisao
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-danger-ghost"
                    onClick={() => removeSession(s)}
                    disabled={removingSession === s.id}
                    title="Excluir esta captura"
                  >
                    {removingSession === s.id ? '…' : 'Excluir'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Mapeia o status textual num "kind" para a cor do badge.
function statusKind(status) {
  switch (status) {
    case 'recording':
    case 'active':
      return 'ok';
    case 'created':
    case 'finalizing':
      return 'warn';
    case 'error':
      return 'err';
    default:
      return 'muted';
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}
