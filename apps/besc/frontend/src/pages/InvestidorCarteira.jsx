import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import {
  Banner, SkeletonList, HelpCallout, LegalStatusBadge, formatBRL,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useInvestorMode, DemoWatermark } from '../investor.jsx';

// Rótulos e cores dos status de contrato (espelham api/src/marketplace/states.js).
const CONTRACT_STATUS = {
  active: { l: 'Ativo', c: 'b-green' },
  suspended: { l: 'Suspenso', c: 'b-amber' },
  substituted: { l: 'Substituído', c: 'b-blue' },
  written_off: { l: 'Baixado', c: 'b-red' },
  settled: { l: 'Liquidado', c: 'b-grey' },
  terminated: { l: 'Encerrado', c: 'b-grey' },
};

function ContractStatusBadge({ status }) {
  const s = CONTRACT_STATUS[status] || { l: status || '—', c: 'b-grey' };
  return <span className={`badge ${s.c}`}>{s.l}</span>;
}

function fmtDate(s) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('pt-BR');
}

export default function InvestidorCarteira() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const mode = useInvestorMode();

  useEffect(() => {
    api.investor.wallet().then(setData).catch((e) => setError(e.message));
  }, []);

  const contracts = (data && data.contracts) || [];
  const demo = (!mode.loading && !mode.goLive) || !!(data && data.demonstration);

  const totals = useMemo(() => {
    let tokens = 0; let face = 0;
    for (const c of contracts) {
      tokens += Number(c.quantity) || 0;
      face += Number(c.total_face_value) || 0;
    }
    return { tokens, face };
  }, [contracts]);

  const hasSuspended = contracts.some((c) => c.status === 'suspended');

  return (
    <>
      <DemoWatermark show={demo} />
      <div className="pgtitle"><h1><Icon name="briefcase" size={22} /> Minha carteira</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: '76ch' }}>
        Seus contratos de tokens. Cada contrato guarda o <strong>valor de face travado</strong> no momento da
        contratação e acompanha o <strong>estado jurídico</strong> do título de origem.
      </p>

      <HelpCallout title="Como ler sua carteira">
        O <strong>valor travado</strong> é o valor de face por token registrado quando você contratou — ele não muda
        com eventos posteriores. Um contrato <strong>suspenso</strong> significa que o título está em
        <strong> revisão jurídica</strong> (por exemplo, decisão desfavorável ou recurso em andamento): as obrigações
        ficam congeladas até a situação se resolver — o que já era devido permanece devido.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>
      {!data && !error && <SkeletonList count={4} lines={2} />}

      {data && contracts.length === 0 && (
        <div className="card"><div className="empty">
          <h3>Você ainda não tem contratos</h3>
          <p className="muted">Quando você contratar tokens de um título, eles aparecem aqui.</p>
          <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
            <Link className="btn primary sm" to="/marketplace"><Icon name="coins" size={13} /> Ver títulos disponíveis</Link>
          </div>
        </div></div>
      )}

      {data && contracts.length > 0 && (
        <>
          <div className="cs-metrics" style={{ marginTop: 0, marginBottom: 18, paddingTop: 0, borderTop: 'none' }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="cs-metric"><span className="m-k">Contratos</span><span className="m-v">{contracts.length}</span></div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="cs-metric"><span className="m-k">Total de tokens</span><span className="m-v">{totals.tokens.toLocaleString('pt-BR')}</span></div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="cs-metric"><span className="m-k">Valor de face travado</span><span className="m-v">{formatBRL(totals.face)}</span></div>
            </div>
          </div>

          {hasSuspended && (
            <Banner kind="warn">
              Você tem contrato(s) <strong>suspenso(s)</strong>: o título está em revisão jurídica. As obrigações ficam
              congeladas até a situação se resolver.
            </Banner>
          )}

          <div className="card">
            <div className="card-head"><h3>Contratos ({contracts.length})</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Contrato</th><th>Título</th><th>Estado jurídico</th>
                    <th>Tokens</th><th>Valor travado (unit.)</th><th>Total</th>
                    <th>Situação</th><th>Contratado em</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.contract_number || c.id}</td>
                      <td>{c.title_label || '—'}</td>
                      <td><LegalStatusBadge status={c.legal_status} /></td>
                      <td>{c.quantity != null ? Number(c.quantity).toLocaleString('pt-BR') : '—'}</td>
                      <td>{formatBRL(c.unit_face_value_frozen)}</td>
                      <td>{formatBRL(c.total_face_value)}</td>
                      <td><ContractStatusBadge status={c.status} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.contracted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
