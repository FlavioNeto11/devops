import React, { useCallback, useEffect, useState } from 'react';
import { fetchApps, pmProjects } from '../api.js';
import { shortImage, asCount } from '../format.js';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import EmptyState from './EmptyState.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { appTypeLookup, typeMeta } from '../lib/appTypes.js';

/**
 * Apps
 * ----
 * Lista as aplicacoes agrupadas (dados de /apps), agrupadas por app via labels
 * (app.kubernetes.io/part-of / devops.flavioneto/app no backend).
 *
 * Formato real de /apps (array):
 *   {
 *     app,                 // chave/nome da aplicacao
 *     namespaces: [..],    // namespaces onde a app tem recursos
 *     services: [..],      // nomes de Services (strings)
 *     deployments: [..],   // nomes de Deployments (strings)
 *     images: [..],        // imagens distintas em uso
 *     restarts,            // soma de restarts dos pods da app
 *     pods,                // numero de pods da app
 *     age,                 // idade do recurso mais antigo (string)
 *     urls: [..]           // URLs publicadas (derivadas das IngressRoutes)
 *   }
 */
export default function Apps() {
  const [apps, setApps] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tipo da app: label do cluster (devops.flavioneto/app-type) com fallback no
  // cadastro do pm-api (projects.app_type) enquanto os Deployments não têm o label.
  const [types, setTypes] = useState({});
  const [filter, setFilter] = useState('');
  useEffect(() => {
    pmProjects().then((p) => setTypes(appTypeLookup(p))).catch(() => {});
  }, []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApps(signal ? { signal } : undefined);
      setApps(Array.isArray(res) ? res : res?.apps || []);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <section className="apps" aria-label="Aplicacoes">
      <PageHeader
        actions={(
          <>
            <input className="input" style={{ width: 200 }} placeholder="Filtrar apps…"
              value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar aplicações" />
            <button type="button" className="btn" onClick={() => load()} disabled={loading}>
              <Icon name="refresh" size={15} /> Atualizar
            </button>
          </>
        )}
      />

      {loading && apps.length === 0 && <ListSkeleton rows={3} />}

      {error && (
        <div className="state state--error" role="alert">
          Erro ao carregar aplicacoes: {error}
        </div>
      )}

      {!loading && !error && apps.length === 0 && (
        <EmptyState
          icon="layers"
          title="Nenhuma aplicação encontrada"
          hint="Apps aparecem aqui quando seus recursos têm o label app.kubernetes.io/part-of."
        />
      )}

      {apps.filter((a) => !filter || a.app.toLowerCase().includes(filter.toLowerCase())).map((app) => {
        const restarts = asCount(app.restarts);
        const t = app.appType || types[app.app] || null;
        return (
          <article key={app.app} className="app-card">
            <header className="app-card__head">
              <div>
                <h3 className="app-card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {app.app}
                  {t && <span className={'badge ' + typeMeta(t).badge}>{typeMeta(t).label}</span>}
                </h3>
                <p className="app-card__meta">
                  {(app.namespaces || []).length > 0 && (
                    <>
                      namespaces{' '}
                      {(app.namespaces || []).map((ns, i) => (
                        <React.Fragment key={ns}>
                          {i > 0 && ', '}
                          <code>{ns}</code>
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </p>
              </div>
              <div className="app-card__urls">
                {(app.urls || []).length === 0 && (
                  <span className="muted">sem URLs publicadas</span>
                )}
                {(app.urls || []).map((u) => (
                  <a
                    key={u}
                    href={u}
                    className="quick-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {u} ↗
                  </a>
                ))}
                {/* sinergia cross-app: do app vivo → seus requisitos no Reqhub (filtrado por produto) */}
                <a
                  href={`/reqs#/explorer?product=${encodeURIComponent(app.app)}`}
                  className="quick-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Requisitos ↗
                </a>
              </div>
            </header>

            <div className="app-stats">
              <Stat label="Pods" value={asCount(app.pods)} />
              <Stat
                label="Restarts"
                value={restarts}
                tone={restarts > 0 ? 'warn' : undefined}
              />
              <Stat label="Services" value={(app.services || []).length} />
              <Stat label="Deployments" value={(app.deployments || []).length} />
              <Stat label="Idade" value={app.age || '—'} />
            </div>

            {(app.services || []).length > 0 && (
              <div className="app-section">
                <span className="app-section__label">Services</span>
                <div className="chips">
                  {app.services.map((s) => (
                    <span key={s} className="chip mono">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(app.deployments || []).length > 0 && (
              <div className="app-section">
                <span className="app-section__label">Deployments</span>
                <div className="chips">
                  {app.deployments.map((d) => (
                    <span key={d} className="chip mono">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(app.images || []).length > 0 && (
              <div className="app-section">
                <span className="app-section__label">Imagens</span>
                <div className="chips">
                  {app.images.map((img) => (
                    <span key={img} className="chip mono" title={img}>
                      {shortImage(img, 56)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

/** Mini-estatistica reutilizavel exibida no topo de cada app. */
function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className={`stat__value ${tone ? `stat__value--${tone}` : ''}`}>
        {value}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
