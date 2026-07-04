import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta, useLabel, CountBar } from '../ui.jsx';
import { Icon } from '../icons.jsx';

const VC_ICON = { seguranca: 'shield', liquidez: 'liquidity', versatilidade: 'layers', jurisprudencia: 'gavel' };

export default function PortalHome() {
  const { meta } = useMeta();
  const label = useLabel();
  const [stats, setStats] = useState(null);
  useEffect(() => { api.stats().then(setStats).catch(() => setStats(null)); }, []);

  const ref = (meta && meta.reference) || {};
  const vprop = ref.valueProposition || [];
  const jur = (stats && stats.jurisprudence) || {};
  const byCat = jur.byCreditorCategory || {};
  const maxCat = Math.max(1, ...Object.values(byCat));

  const entries = [
    { to: '/biblioteca', ic: 'library', title: 'Biblioteca institucional', desc: 'Fundamentos, histórico da incorporação, comunicados, custos e vídeos.', count: stats && stats.library.total, unit: 'itens' },
    { to: '/jurisprudencia', ic: 'gavel', title: 'Jurisprudência', desc: 'Acervo de decisões filtrável por tribunal, credor, mecanismo e resultado.', count: stats && stats.jurisprudence.total, unit: 'decisões' },
    { to: '/casos', ic: 'cases', title: 'Casos / levantamento', desc: 'Cadastro de titulares e processos, checklists, pendências e relatórios.', count: stats && stats.cases.total, unit: 'casos' },
    { to: '/glossario', ic: 'glossary', title: 'Glossário', desc: 'Termos do processo BESC explicados de forma objetiva.', count: stats && stats.glossary.total, unit: 'termos' },
    { to: '/roadmap', ic: 'roadmap', title: 'Roadmap do processo', desc: 'O que já existe e o que ainda falta para o fluxo completo até a tokenização.' },
  ];

  return (
    <>
      <section className="portal-hero">
        <div className="kicker">Portal BESC · Base de conhecimento</div>
        <h1>O que são as ações do BESC e como usá-las</h1>
        <p>
          O BESC (Banco do Estado de Santa Catarina) foi incorporado pelo Banco do Brasil. Suas ações
          deixaram de ser negociadas em mercado e passaram a ser utilizadas, na esfera judicial, para
          quitar e compensar passivos tributários, bancários e junto a empresas privadas. Este portal
          reúne a base institucional, a jurisprudência e o levantamento de casos que servirão de
          fundamento para uma futura tokenização.
        </p>
        <div className="hero-actions">
          <Link className="btn primary" to="/jurisprudencia"><Icon name="gavel" /> Explorar jurisprudência</Link>
          <Link className="btn" to="/biblioteca"><Icon name="library" /> Biblioteca</Link>
          <Link className="btn" to="/casos"><Icon name="cases" /> Casos</Link>
        </div>
      </section>

      {vprop.length > 0 && (
        <>
          <div className="section-title">Por que utilizar as ações do BESC</div>
          <div className="grid2" style={{ marginBottom: 24 }}>
            {vprop.map((v) => (
              <div key={v.key} className="card"><div className="card-body value-card">
                <div className="vc-ic"><Icon name={VC_ICON[v.key] || 'info'} size={20} /></div>
                <h3>{v.title}</h3>
                <p>{v.summary}</p>
              </div></div>
            ))}
          </div>
        </>
      )}

      <div className="grid2" style={{ marginBottom: 24 }}>
        {entries.map((e) => (
          <Link key={e.to} to={e.to} className="entry-card">
            <span className="ec-ic"><Icon name={e.ic} size={20} /></span>
            <span className="ec-body">
              <h3>{e.title}</h3>
              <p>{e.desc}</p>
              {e.count != null && <p style={{ marginTop: 6 }}><span className="ec-count">{e.count}</span> {e.unit}</p>}
            </span>
          </Link>
        ))}
      </div>

      {stats && jur.total > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><h3>Acervo de jurisprudência por natureza do credor</h3><div className="spacer" style={{ flex: 1 }} /><Link className="btn sm ghost" to="/jurisprudencia">Ver tudo <Icon name="chevronRight" size={13} /></Link></div>
          <div className="card-body">
            {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <Link key={k} to={`/jurisprudencia?creditorCategory=${k}`} style={{ display: 'block' }}>
                <CountBar label={label('creditor_category', k)} count={v} max={maxCat} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
