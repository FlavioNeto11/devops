import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, Loading, HelpCallout, useLabel, LegalStatusBadge, ListingBadge, formatBRL } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const CONTRACT_STATUS = {
  active: { l: 'Ativo', c: 'b-green' }, suspended: { l: 'Suspenso', c: 'b-amber' },
  substituted: { l: 'Substituído', c: 'b-blue' }, written_off: { l: 'Baixado', c: 'b-red' },
  settled: { l: 'Liquidado', c: 'b-grey' }, terminated: { l: 'Encerrado', c: 'b-grey' },
};

function fmtDateTime(s) { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR'); }

function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/403|acesso|permiss/i.test(m)) return 'Você não tem acesso concedido a este título. Peça ao Gestor para vinculá-lo.';
  if (/404|não encontrad/i.test(m)) return 'Título não encontrado.';
  if (/503|indispon/i.test(m)) return 'O serviço de auditoria está indisponível no momento. Tente novamente em instantes.';
  return m || 'Não foi possível carregar o título.';
}

// evidence_ref pode vir como objeto {ref}, string ou nulo — render seguro.
function evidenceText(ev) {
  if (!ev) return null;
  if (typeof ev === 'string') return ev;
  if (typeof ev === 'object') return ev.ref || ev.reference || JSON.stringify(ev);
  return String(ev);
}

// Visão de AUDITORIA de um título — SOMENTE LEITURA. O simples carregamento desta tela
// registra o acesso na trilha (audit.access.viewed) — é esperado e informado ao usuário.
export default function AuditoriaTitulo() {
  const { id } = useParams();
  const label = useLabel();
  const [data, setData] = useState(null);   // {title, legalHistory, contracts}
  const [error, setError] = useState(null);
  const [events, setEvents] = useState(null); // trilha do título | null (carregando) | 'denied'

  useEffect(() => {
    let alive = true;
    setData(null); setError(null); setEvents(null);
    api.auditor.title(id)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(friendly(e.message)); });
    // trilha do título (audit:read) — degradação graciosa se o papel não tiver a permissão
    api.auditor.events({ entityType: 'security_title', entityId: id, limit: 50 })
      .then((rows) => { if (alive) setEvents(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (alive) setEvents(/403|permiss|acesso/i.test(String(e.message)) ? 'denied' : []); });
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return (
      <>
        <div className="crumbs"><Link to="/auditoria">Auditoria</Link> / consulta</div>
        <div className="empty">
          <h3><Icon name="lock" size={16} /> Consulta indisponível</h3>
          <p>{error}</p>
          <p><Link to="/auditoria" className="btn sm">Voltar à lista</Link></p>
        </div>
      </>
    );
  }
  if (!data) return <Loading label="Carregando consulta de auditoria…" />;

  const { title, legalHistory = [], contracts = [] } = data;

  return (
    <>
      <div className="crumbs"><Link to="/auditoria">Auditoria</Link> / {title.label}</div>

      <div className="case-summary">
        <div className="cs-top">
          <div className="cs-title">
            <h1>{title.label}</h1>
            <span className="cs-sub">{label('share_class', title.share_class)} · {title.share_quantity} ação(ões)</span>
          </div>
          <div className="cs-actions">
            <LegalStatusBadge status={title.legal_status} />
            <ListingBadge status={title.listing_status} />
          </div>
        </div>
      </div>

      <Banner kind="info">
        <Icon name="info" size={13} /> <strong>Esta consulta foi registrada na trilha de auditoria.</strong> O
        acesso qualificado (advogado/juiz) é rastreável por desenho. Esta é uma visão <strong>somente leitura</strong> —
        nenhuma alteração é possível aqui.
      </Banner>

      <div className="stack">
        {/* ---- Linha do tempo jurídica ---- */}
        <div className="card">
          <div className="card-head"><h3><Icon name="landmark" size={15} /> Linha do tempo jurídica ({legalHistory.length})</h3></div>
          <div className="card-body">
            <HelpCallout title="Histórico de estado jurídico">
              Cada transição registra o estado de origem e destino, a justificativa e, quando houver, a
              <strong> evidência</strong> (nº de processo/decisão ou referência do anexo). Fonte <em>manual</em> = ação do
              Gestor; <em>integração</em> = proposta de integração confirmada pelo Gestor.
            </HelpCallout>
            {legalHistory.length === 0
              ? <p className="muted">Sem histórico jurídico registrado.</p>
              : legalHistory.map((h, i) => {
                const ev = evidenceText(h.evidence_ref);
                return (
                  <div key={h.id || i} style={{ padding: '10px 0', borderBottom: i < legalHistory.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                    <div>
                      {h.from_status && h.from_status !== 'none' && <><LegalStatusBadge status={h.from_status} /> <Icon name="chevronRight" size={12} /> </>}
                      <LegalStatusBadge status={h.to_status} />
                    </div>
                    {h.reason && <div className="small" style={{ marginTop: 6 }}>{h.reason}</div>}
                    {ev && <div className="small" style={{ marginTop: 4 }}><span className="muted">Evidência:</span> {ev}</div>}
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {fmtDateTime(h.occurred_at || h.created_at)} · origem: {h.source === 'court_integration' ? 'integração' : 'manual'}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ---- Contratos vinculados (valor de face travado) ---- */}
        <div className="card">
          <div className="card-head"><h3><Icon name="file" size={15} /> Contratos vinculados ({contracts.length})</h3></div>
          {contracts.length === 0
            ? <div className="empty"><p className="muted">Nenhum contrato vinculado a este título.</p></div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Contrato</th><th>Qtde</th><th>Valor travado</th><th>Total</th><th>Status</th><th>Contratado em</th></tr></thead>
                  <tbody>
                    {contracts.map((c) => {
                      const st = CONTRACT_STATUS[c.status] || { l: c.status, c: 'b-grey' };
                      return (
                        <tr key={c.id}>
                          <td><span style={{ fontFamily: 'monospace' }}>{c.contract_number}</span></td>
                          <td>{Number(c.quantity).toLocaleString('pt-BR')}</td>
                          <td>{formatBRL(c.unit_face_value_frozen)}</td>
                          <td>{formatBRL(c.total_face_value)}</td>
                          <td><span className={`badge ${st.c}`}>{st.l}</span></td>
                          <td>{fmtDateTime(c.contracted_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          <div className="card-body" style={{ paddingTop: 0 }}>
            <p className="small muted">O <strong>valor de face travado</strong> é congelado no momento da contratação e não muda depois — nem para cima, nem para baixo.</p>
          </div>
        </div>

        {/* ---- Trilha de eventos deste título ---- */}
        <div className="card">
          <div className="card-head"><h3><Icon name="shield" size={15} /> Trilha de auditoria deste título</h3></div>
          <div className="card-body">
            <HelpCallout title="Registro encadeado (hash-chain)">
              Cada evento carrega o encadeamento de hash do anterior — a trilha é <strong>à prova de adulteração</strong>.
              A sua própria consulta a este título consta aqui como <code>audit.access.viewed</code>.
            </HelpCallout>
            {events === null && <Loading label="Carregando trilha…" />}
            {events === 'denied' && <Banner kind="info">Seu papel não inclui a leitura da trilha de eventos. A linha do tempo jurídica acima permanece disponível.</Banner>}
            {Array.isArray(events) && events.length === 0 && <p className="muted">Nenhum evento registrado para este título ainda.</p>}
            {Array.isArray(events) && events.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Quando</th><th>Evento</th><th>Ator</th><th>Encadeamento</th></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id || e.event_uid}>
                        <td>{fmtDateTime(e.occurred_at)}</td>
                        <td><span style={{ fontFamily: 'monospace' }} className="small">{e.event_type}</span></td>
                        <td className="small">{e.actor_role || '—'}</td>
                        <td className="small muted" style={{ fontFamily: 'monospace' }} title={e.event_hash || ''}>
                          {e.event_hash ? e.event_hash.slice(0, 12) + '…' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
