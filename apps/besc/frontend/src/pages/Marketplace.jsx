import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import {
  Banner, SkeletonList, HelpCallout, useLabel,
  LegalStatusBadge, AvailableBadge, formatBRL,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';
import { useInvestorMode, DemoWatermark } from '../investor.jsx';

// Catálogo público (teaser): lista os títulos publicados com classe, estado jurídico,
// disponibilidade e valor unitário. O dossiê completo e a contratação ficam além do login.
export default function Marketplace() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const label = useLabel();
  const { user, hasPerm } = useAuth();
  const mode = useInvestorMode();

  useEffect(() => {
    api.investor.catalog().then(setItems).catch((e) => setError(e.message));
  }, []);

  const canInvest = hasPerm('contracts:read');

  return (
    <>
      {!mode.loading && !mode.goLive && <DemoWatermark />}

      <div className="pgtitle"><h1><Icon name="coins" size={22} /> Investir em títulos</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: '76ch' }}>
        Títulos originados de casos aptos do levantamento, publicados no catálogo. Cada título aponta a
        classe da ação, o estado jurídico atual e o valor unitário de referência. Abra o dossiê para ver
        os detalhes e, se você for um investidor aprovado, contratar tokens.
      </p>

      <HelpCallout title="Como ler o catálogo">
        O <strong>estado jurídico</strong> indica em que ponto do processo o título se encontra; só títulos
        <strong> disponíveis</strong> podem ser contratados. O <strong>valor unitário</strong> é o valor de face de
        referência — ele fica <strong>travado</strong> no momento em que você contrata. Nada é executado em blockchain.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>
      {!items && !error && <SkeletonList count={6} />}

      {items && items.length === 0 && (
        <div className="card"><div className="empty">
          <h3>Nenhum título publicado</h3>
          <p className="muted">Ainda não há títulos disponíveis no catálogo. Volte em breve.</p>
        </div></div>
      )}

      {items && items.length > 0 && (
        <div className="grid2">
          {items.map((t) => (
            <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontWeight: 680, color: 'var(--ink)', fontSize: 15, minWidth: 0 }}>{t.label}</div>
                  <AvailableBadge available={t.available} />
                </div>
                <div className="chip-row">
                  <span className="chip chip-accent">{label('share_class', t.share_class)}</span>
                  <LegalStatusBadge status={t.legal_status || t.legal_status_label} />
                </div>
                <div className="cs-metrics" style={{ marginTop: 4, paddingTop: 12 }}>
                  <div className="cs-metric">
                    <span className="m-k">Valor unitário</span>
                    <span className="m-v">{formatBRL(t.active_unit_value)}</span>
                  </div>
                  <div className="cs-metric">
                    <span className="m-k">Quantidade de ações</span>
                    <span className="m-v">{t.share_quantity != null ? Number(t.share_quantity).toLocaleString('pt-BR') : '—'}</span>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 'auto', paddingTop: 6 }}>
                  {user ? (
                    <Link className="btn primary sm" to={`/marketplace/titulos/${t.id}`}>
                      Ver dossiê <Icon name="chevronRight" size={13} />
                    </Link>
                  ) : (
                    <Link className="btn primary sm" to={`/entrar?next=${encodeURIComponent(`/marketplace/titulos/${t.id}`)}`}>
                      <Icon name="login" size={13} /> Entrar para investir
                    </Link>
                  )}
                  {user && !canInvest && (
                    <span className="small muted">Sua conta ainda não está habilitada a contratar.</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="help-callout" style={{ marginTop: 20 }}>
        <div className="hc-icon" aria-hidden="true"><Icon name="info" size={18} /></div>
        <div><div className="hc-body">
          Este catálogo é uma <strong>simulação auditável</strong>. As informações não constituem oferta pública,
          recomendação de investimento nem parecer jurídico.
        </div></div>
      </div>
    </>
  );
}
