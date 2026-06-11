import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getTimeline,
  normalizeSession,
  getContract,
  screenshotBlobUrl,
} from '../api.js';

/**
 * ReviewView
 * ----------
 * GET timeline -> renderiza uma timeline vertical ordenada por t_offset_ms mesclando:
 *   - eventos (metodo + host + path, status, expand do req/resp REDIGIDOS),
 *   - screenshots (img via /blob),
 *   - anotacoes (label/descricao).
 * Botao "Normalizar" -> POST normalize -> mostra os endpoints do contrato (metodo,
 * path_template, requires_captcha) numa tabela. Filtro opcional por host/metodo.
 */
export default function ReviewView({ sessionId }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hostFilter, setHostFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  const [normalizing, setNormalizing] = useState(false);
  const [contract, setContract] = useState(null);
  const [normalizeErr, setNormalizeErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tl = await getTimeline(sessionId);
      setTimeline(tl || { events: [], annotations: [], screenshots: [] });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lista mesclada e ordenada por offset temporal.
  const items = useMemo(() => {
    if (!timeline) return [];
    const merged = [];
    for (const ev of timeline.events || []) {
      merged.push({ kind: 'event', t: ev.t_offset_ms ?? 0, seq: ev.seq ?? 0, data: ev });
    }
    for (const ann of timeline.annotations || []) {
      merged.push({ kind: 'annotation', t: ann.start_offset_ms ?? 0, seq: -1, data: ann });
    }
    for (const shot of timeline.screenshots || []) {
      merged.push({ kind: 'screenshot', t: shot.t_offset_ms ?? 0, seq: -1, data: shot });
    }
    merged.sort((a, b) => (a.t - b.t) || (a.seq - b.seq));
    return merged;
  }, [timeline]);

  // Opcoes de filtro derivadas dos eventos.
  const hosts = useMemo(() => {
    const set = new Set();
    for (const ev of (timeline && timeline.events) || []) if (ev.host) set.add(ev.host);
    return [...set].sort();
  }, [timeline]);
  const methods = useMemo(() => {
    const set = new Set();
    for (const ev of (timeline && timeline.events) || []) if (ev.method) set.add(ev.method);
    return [...set].sort();
  }, [timeline]);

  const visible = useMemo(
    () =>
      items.filter((it) => {
        if (it.kind !== 'event') return true; // anotacoes e screenshots sempre visiveis
        if (hostFilter && it.data.host !== hostFilter) return false;
        if (methodFilter && it.data.method !== methodFilter) return false;
        return true;
      }),
    [items, hostFilter, methodFilter],
  );

  const runNormalize = async () => {
    setNormalizing(true);
    setNormalizeErr(null);
    try {
      const result = await normalizeSession(sessionId);
      // normalize pode retornar o contrato direto ou { id }. Buscamos por id quando preciso.
      let c = result;
      if (result && result.id && !result.endpoints) {
        c = await getContract(result.id);
      }
      setContract(c);
    } catch (e) {
      setNormalizeErr(e.message || String(e));
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div className="view review">
      <div className="view__head">
        <h2 className="view__title">Revisao da sessao</h2>
        <div className="review__toolbar">
          <select className="input" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="">todos os metodos</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select className="input" value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>
            <option value="">todos os hosts</option>
            {hosts.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={runNormalize} disabled={normalizing}>
            {normalizing ? 'Normalizando…' : 'Normalizar'}
          </button>
        </div>
      </div>

      {normalizeErr && <div className="alert alert-err">{normalizeErr}</div>}
      {contract && <ContractTable contract={contract} />}

      {error && <div className="alert alert-err">{error}</div>}

      {loading ? (
        <div className="empty">Carregando timeline…</div>
      ) : visible.length === 0 ? (
        <div className="empty">Nenhum evento/anotacao/screenshot para esta sessao.</div>
      ) : (
        <ol className="timeline">
          {visible.map((it, i) => (
            <TimelineItem key={`${it.kind}-${it.data.id ?? i}`} item={it} sessionId={sessionId} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({ item, sessionId }) {
  const { kind, t, data } = item;
  return (
    <li className={'timeline__item timeline__item--' + kind}>
      <div className="timeline__rail">
        <span className={'timeline__dot timeline__dot--' + kind} />
        <span className="timeline__time mono small">{fmtOffset(t)}</span>
      </div>
      <div className="timeline__body">
        {kind === 'event' && <EventRow ev={data} />}
        {kind === 'annotation' && <AnnotationRow ann={data} />}
        {kind === 'screenshot' && <ScreenshotRow shot={data} sessionId={sessionId} />}
      </div>
    </li>
  );
}

function EventRow({ ev }) {
  const [open, setOpen] = useState(false);
  const redacted = Array.isArray(ev.redacted_keys) && ev.redacted_keys.length > 0;
  return (
    <div className="card event-card">
      <button className="event-card__head" onClick={() => setOpen((o) => !o)}>
        <span className={'method method--' + methodKind(ev.method)}>{ev.method || '—'}</span>
        <span className="event-card__host mono">{ev.host}</span>
        <span className="event-card__path mono">{ev.path}</span>
        {ev.status_code != null && (
          <span className={'status status--' + httpKind(ev.status_code)}>{ev.status_code}</span>
        )}
        {redacted && <span className="badge badge-warn" title={ev.redacted_keys.join(', ')}>redigido</span>}
        <span className="event-card__chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="event-card__detail">
          <BodyBlock title="req_body" body={ev.req_body} redacted={redacted} />
          <BodyBlock title="resp_body" body={ev.resp_body} redacted={redacted} />
          {redacted && (
            <div className="muted small">
              chaves redigidas: <code>{ev.redacted_keys.join(', ')}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BodyBlock({ title, body, redacted }) {
  if (body == null || body === '') {
    return (
      <div className="body-block">
        <div className="body-block__title">{title}</div>
        <div className="muted small">(vazio)</div>
      </div>
    );
  }
  let text;
  try {
    text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  } catch {
    text = String(body);
  }
  return (
    <div className="body-block">
      <div className="body-block__title">
        {title}
        {redacted && <span className="badge badge-warn">contem ***</span>}
      </div>
      <pre className="body-block__pre mono">{text}</pre>
    </div>
  );
}

function AnnotationRow({ ann }) {
  return (
    <div className="card annotation-card">
      <div className="annotation-card__label">
        {typeof ann.step_index === 'number' && <span className="chip">passo {ann.step_index}</span>}
        {ann.label}
      </div>
      {ann.description && <div className="muted small">{ann.description}</div>}
    </div>
  );
}

function ScreenshotRow({ shot, sessionId }) {
  return (
    <div className="card screenshot-card">
      <img
        className="screenshot-card__img"
        src={screenshotBlobUrl(sessionId, shot.id)}
        alt={shot.caption || 'screenshot'}
        loading="lazy"
      />
      {shot.caption && <div className="muted small">{shot.caption}</div>}
    </div>
  );
}

function ContractTable({ contract }) {
  const endpoints = Array.isArray(contract.endpoints) ? contract.endpoints : [];
  return (
    <div className="card contract-card">
      <div className="view__head">
        <h3 className="view__title">
          Contrato {contract.version != null && <span className="chip">v{contract.version}</span>}
        </h3>
        <span className="muted small">{endpoints.length} endpoints</span>
      </div>
      {endpoints.length === 0 ? (
        <div className="empty empty--sm">Sem endpoints no contrato.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>method</th>
              <th>host</th>
              <th>path_template</th>
              <th>auth</th>
              <th>captcha</th>
              <th>ocorr.</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep, i) => (
              <tr key={i}>
                <td>
                  <span className={'method method--' + methodKind(ep.method)}>{ep.method}</span>
                </td>
                <td className="mono">{ep.host}</td>
                <td className="mono">{ep.path_template}</td>
                <td>{ep.requires_auth ? <span className="badge badge-warn">sim</span> : '—'}</td>
                <td>{ep.requires_captcha ? <span className="badge badge-err">sim</span> : '—'}</td>
                <td className="num">{ep.occurrence_count ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function methodKind(method) {
  switch ((method || '').toUpperCase()) {
    case 'GET':
      return 'get';
    case 'POST':
      return 'post';
    case 'PUT':
    case 'PATCH':
      return 'put';
    case 'DELETE':
      return 'delete';
    default:
      return 'other';
  }
}

function httpKind(code) {
  if (code >= 500) return 'err';
  if (code >= 400) return 'warn';
  if (code >= 200 && code < 300) return 'ok';
  return 'muted';
}

function fmtOffset(ms) {
  if (ms == null) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const millis = ms % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
