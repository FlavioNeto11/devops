// Lista de reivindicações (F2, ADR-010). Cada linha mostra o estágio real — hoje, sempre
// POSSÍVEL DIREITO: confirmação externa (F4) e registro (F5) não existem nesta fase.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, Loading, friendly } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';
import { StageBadge, StagesLegend, CLAIM_STATE_LABEL, CLAIM_KIND_LABEL } from '../recovery-ui.jsx';

export default function RecuperacaoList() {
  const { hasPerm } = useAuth();
  const [claims, setClaims] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.recovery.claims().then(setClaims).catch((e) => setErr(friendly(e.message))); }, []);

  return (
    <>
      <div className="pgtitle row" style={{ justifyContent: 'space-between' }}>
        <h1>Reivindicações</h1>
        {hasPerm('recovery:write') && <Link className="btn primary sm" to="/recuperacao/nova"><Icon name="plus" size={14} /> Nova reivindicação</Link>}
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Uma reivindicação reúne evidências de um possível direito societário antigo. Documento antigo não é ativo:
        só a fonte oficial de registro confirma titularidade e quantidade.
      </p>
      <StagesLegend />
      {err && <Banner>{err}</Banner>}
      {!claims && !err && <Loading />}
      {claims && claims.length === 0 && (
        <div className="empty"><h3>Nenhuma reivindicação</h3><p>Cadastre o reclamante e envie a primeira evidência.</p></div>
      )}
      {claims && claims.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Estágio</th><th>Situação</th><th>Tipo</th><th>Origem</th><th>Evidências</th><th>Criada em</th></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td><StageBadge stage={c.stage} /></td>
                  <td>{CLAIM_STATE_LABEL[c.state] || c.state}{c.legacyCaseId && <span className="pill" style={{ marginLeft: 6 }}>migrada do levantamento</span>}</td>
                  <td><Link to={`/recuperacao/${c.id}`}>{CLAIM_KIND_LABEL[c.claimKind] || c.claimKind}</Link></td>
                  <td>{c.assetOriginId}</td>
                  <td>{c.evidenceCount}</td>
                  <td className="small muted">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
