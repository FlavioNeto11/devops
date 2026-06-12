import React from 'react';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import { appTypeOf, isPortal, typeMeta } from '../lib/appTypes.js';

/**
 * Painel inicial do usuário (member): separa claramente os dois mundos de acesso —
 * "Meus Portais" (sites com conteúdo gerenciado pelo CMS) e "Meus Sistemas & Produtos"
 * (softwares com board de Projetos & Tarefas). Quem só tem portal não vê o board;
 * quem só tem produto não vê CMS; quem tem ambos vê as duas áreas bem separadas.
 */
export default function UserHome({ me, onGo }) {
  const projects = me?.projects || [];
  const portals = projects.filter(isPortal);
  const products = projects.filter((p) => !isPortal(p));

  if (!projects.length) {
    return (
      <EmptyState
        icon="home"
        title="Nenhum acesso atribuído ainda"
        hint="Fale com um administrador para receber acesso a um portal (conteúdo/CMS) ou a um sistema (projetos & tarefas)."
      />
    );
  }

  const grid = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' };

  const Card = ({ p, action }) => {
    const meta = typeMeta(appTypeOf(p));
    return (
      <article className="app-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Icon name={meta.icon} size={18} />
          <h3 className="app-card__title" style={{ margin: 0, flex: 1 }}>{p.name}</h3>
          {p.approvalStatus === 'pending_approval' && <span className="badge badge-warn" title="Aguardando aprovação do administrador — você já pode montar o conteúdo">pendente</span>}
          {p.approvalStatus === 'rejected' && <span className="badge badge-err" title="Rejeitado pelo administrador — fale com ele para entender o motivo">rejeitado</span>}
          {p.approvalStatus === 'approved' && p.status && p.status !== 'active' && <span className="badge badge-warn" title="Fora do ar — o conteúdo está preservado">desativado</span>}
          <span className={'badge ' + meta.badge}>{meta.short}</span>
        </div>
        {p.approvalStatus === 'pending_approval' && (
          <p className="muted" style={{ fontSize: '.78rem', margin: '0 0 8px' }}>
            Aguardando aprovação — monte o conteúdo normalmente; ele vai ao ar quando o administrador aprovar.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {action}
          {p.route && (
            <a className="quick-link" href={p.route} target="_blank" rel="noopener noreferrer">
              Abrir {p.route} ↗
            </a>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="meta" style={{ display: 'grid', gap: 24 }}>
      {portals.length > 0 && (
        <section>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
            <Icon name="file-text" size={18} /> Meus Portais
          </h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '.85rem' }}>
            Sites com conteúdo gerenciado: edite textos, imagens e seções pelo CMS — sem build nem publicação técnica.
          </p>
          <div style={grid}>
            {portals.map((p) => (
              <Card
                key={p.id}
                p={p}
                action={(
                  <button className="btn btn--primary" style={{ fontSize: '.82rem', padding: '5px 12px' }} onClick={() => onGo?.('conteudo', p.id)}>
                    Editar conteúdo
                  </button>
                )}
              />
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
            <Icon name="layers" size={18} /> Meus Sistemas &amp; Produtos
          </h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '.85rem' }}>
            Softwares completos: acompanhe e trabalhe o board de projetos, itens e tarefas.
          </p>
          <div style={grid}>
            {products.map((p) => (
              <Card
                key={p.id}
                p={p}
                action={(
                  <button className="btn btn--primary" style={{ fontSize: '.82rem', padding: '5px 12px' }} onClick={() => onGo?.('projects', p.id)}>
                    Abrir board
                  </button>
                )}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
