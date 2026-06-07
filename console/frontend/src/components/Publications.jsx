import React, { useCallback, useEffect, useState } from 'react';
import { fetchPublications } from '../api.js';

/**
 * Publications
 * ------------
 * Tabela com o historico de publicacoes lido de /publications. Cada linha
 * representa um deploy realizado pela esteira (metadados anotados no Deployment).
 *
 * Formato real de /publications (lido das annotations devops.flavioneto/* dos
 * Deployments):
 *  [
 *    {
 *      namespace, deployment, app, commitSha, branch, imageTag,
 *      deployedAt (ISO), runId, image
 *    }
 *  ]
 */
export default function Publications() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPublications(signal ? { signal } : undefined);
      setRows(Array.isArray(res) ? res : res?.publications || []);
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
    <section className="publications" aria-label="Publicacoes">
      <div className="toolbar">
        <h2 className="section-title">Publicacoes</h2>
        <button type="button" className="btn" onClick={() => load()}>
          Atualizar
        </button>
      </div>

      {loading && rows.length === 0 && (
        <p className="state state--loading">Carregando publicacoes…</p>
      )}

      {error && (
        <div className="state state--error" role="alert">
          Erro ao carregar publicacoes: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="state state--empty">Nenhuma publicacao registrada.</p>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>App / Deployment</th>
                <th>Tag / Imagem</th>
                <th>Commit</th>
                <th>Branch</th>
                <th>Publicado em</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const tag = r.imageTag || '—';
                const sha = (r.commitSha || '').slice(0, 7) || '—';
                const when = formatDate(r.deployedAt);
                return (
                  <tr key={`${r.namespace || ''}/${r.deployment || ''}/${idx}`}>
                    <td className="mono">
                      <strong>{r.app || '—'}</strong>
                      {r.deployment ? ` / ${r.deployment}` : ''}
                    </td>
                    <td className="mono" title={r.image || ''}>
                      {tag}
                    </td>
                    <td className="mono" title={r.commitSha || ''}>
                      {sha}
                    </td>
                    <td className="mono">{r.branch || '—'}</td>
                    <td title={r.deployedAt || ''}>{when}</td>
                    <td className="mono">{r.runId || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Formata uma data ISO para o padrao pt-BR; tolera valores ausentes/invalidos. */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}
