import React, { useCallback, useEffect, useState } from 'react';
import { pmSharedResources, pmProjects } from '../api.js';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { useToast } from './ToastProvider.jsx';
import { appTypeLookup, typeMeta } from '../lib/appTypes.js';

/**
 * SharedResources — "Compartilhados" (admin). Mostra os recursos compartilhados entre os projetos
 * (libs @flavioneto11/* + infra de plataforma) e qual versão cada projeto consome, destacando DRIFT
 * (projeto atrás da versão canônica). Inventário gerado por scripts/scan-shared-resources.mjs.
 */
const STATUS_BADGE = {
  ok: { cls: 'badge-ok', label: 'atualizado' },
  outdated: { cls: 'badge-err', label: 'desatualizado' },
  ahead: { cls: 'badge-warn', label: 'à frente' },
  shared: { cls: 'badge-muted', label: 'compartilhado' },
  unknown: { cls: 'badge-muted', label: '—' },
};

export default function SharedResources() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tipo de cada projeto consumidor (Portal CMS / Produto / Interno).
  const [types, setTypes] = useState({});

  const load = useCallback(async () => {
    try { setData(await pmSharedResources()); } catch (e) { toast.err(e.message); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    pmProjects().then((p) => setTypes(appTypeLookup(p))).catch(() => {});
  }, []);

  if (loading) return <ListSkeleton rows={3} />;

  const resources = data?.resources || [];
  const npm = resources.filter((r) => r.kind === 'npm');
  const infra = resources.filter((r) => r.kind !== 'npm');
  const driftTotal = npm.reduce((acc, r) => acc + (r.driftCount || 0), 0);
  const genAt = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('pt-BR') : '—';

  if (!resources.length) {
    return (
      <EmptyState
        icon="package"
        title="Nenhum recurso compartilhado mapeado"
        hint="Rode o scan (scripts/scan-shared-resources.mjs) e refaça o build do pm-api para gerar o inventário."
      />
    );
  }

  return (
    <div className="meta">
      <div className="app-card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="stat"><span className="stat__value">{npm.length}</span><span className="stat__label">libs compartilhadas</span></div>
        <div className="stat"><span className={'stat__value' + (driftTotal ? ' stat__value--warn' : '')}>{driftTotal}</span><span className="stat__label">projetos em drift</span></div>
        <div className="stat"><span className="stat__value">{infra.length}</span><span className="stat__label">recursos de plataforma</span></div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '.82rem' }}>inventário gerado em {genAt}</span>
      </div>

      <div className="section-title">Bibliotecas compartilhadas</div>
      {npm.map((r) => (
        <div key={r.name} className="app-card">
          <div className="app-card__head">
            <div>
              <h3 className="app-card__title">
                {r.name} <span className="badge badge-accent">v{r.canonicalVersion}</span>
                {r.driftCount > 0 && <span className="badge badge-err" style={{ marginLeft: 6 }}>drift em {r.driftCount}</span>}
              </h3>
              <p className="app-card__meta">{r.description}</p>
            </div>
            <div className="app-card__urls">
              {r.repoUrl && (
                <a className="quick-link" href={r.repoUrl} target="_blank" rel="noopener noreferrer">
                  {r.repoPath} <Icon name="external" size={13} />
                </a>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Projeto</th><th>Versão consumida</th><th>Situação</th></tr></thead>
              <tbody>
                {r.consumers.length === 0 && <tr><td colSpan={3} className="table__empty">Nenhum projeto consome esta lib.</td></tr>}
                {r.consumers.map((c) => {
                  const b = STATUS_BADGE[c.status] || STATUS_BADGE.unknown;
                  return (
                    <tr key={c.project}>
                      <td className="mono">
                        {c.project}
                        {types[c.project] && <> {' '}<span className={'badge ' + typeMeta(types[c.project]).badge}>{typeMeta(types[c.project]).short}</span></>}
                      </td>
                      <td className="mono">{c.version}</td>
                      <td>
                        <span className={'badge ' + b.cls}>{b.label}</span>
                        {c.status === 'outdated' && (
                          <span className="muted" style={{ marginLeft: 8, fontSize: '.8rem' }}>tem {c.version}, atual {r.canonicalVersion}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="section-title">Plataforma (compartilhado, sem versão por projeto)</div>
      {infra.map((r) => (
        <div key={r.name} className="app-card">
          <div className="app-card__head">
            <div>
              <h3 className="app-card__title">
                {r.name}
                {r.canonicalVersion && r.canonicalVersion !== '—' && <span className="badge badge-muted" style={{ marginLeft: 6 }}>v{r.canonicalVersion}</span>}
              </h3>
              <p className="app-card__meta">{r.description}</p>
            </div>
            <div className="app-card__urls">
              {r.repoUrl && (
                <a className="quick-link" href={r.repoUrl} target="_blank" rel="noopener noreferrer">
                  {r.repoPath} <Icon name="external" size={13} />
                </a>
              )}
            </div>
          </div>
          <div className="app-section">
            <span className="app-section__label">Usado por</span>
            <div className="chips">
              {r.consumers.map((c) => <span key={c.project} className="chip">{c.project}</span>)}
              {!r.consumers.length && <span className="muted">—</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
