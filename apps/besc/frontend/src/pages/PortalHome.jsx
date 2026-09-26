// Home pública — Plataforma de Pesquisa e Recuperação de Ativos Legados (ADR-010, Passo 3/8).
// Sem linguagem de investimento, retorno, liquidez ou tokenização como produto. Os princípios vêm
// de /meta.reference.positioning (fonte única, testada no backend).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { useAuth } from '../auth.jsx';
import { StagesLegend } from '../recovery-ui.jsx';

export default function PortalHome() {
  const { meta } = useMeta();
  const { hasPerm } = useAuth();
  const canSeeRecovery = hasPerm('recovery:read');
  const [stats, setStats] = useState(null);
  useEffect(() => { api.stats().then(setStats).catch(() => setStats(null)); }, []);

  const pos = (meta && meta.reference && meta.reference.positioning) || {};
  const principles = pos.principles || [];
  const jur = (stats && stats.jurisprudence) || {};

  const entries = [
    { to: '/referencia', ic: 'scale', title: 'O que aconteceu com as ações BESC', desc: 'Linha do tempo da incorporação, relações de substituição e base legal, com fonte.' },
    { to: '/jurisprudencia', ic: 'gavel', title: 'Jurisprudência reavaliada', desc: 'Cada decisão com o que efetivamente decidiu, o que não decidiu e se é provisória.', count: stats && jur.total, unit: 'registros' },
    { to: '/biblioteca', ic: 'library', title: 'Biblioteca', desc: 'Documentos com a natureza da fonte indicada.', count: stats && stats.library.total, unit: 'itens públicos' },
    { to: '/glossario', ic: 'glossary', title: 'Glossário', desc: 'Termos jurídicos e societários explicados de forma objetiva.', count: stats && stats.glossary.total, unit: 'termos' },
    { to: '/recuperacao', ic: 'folder', title: 'Reivindicações', desc: 'Evidências, reivindicações e a jornada até a confirmação externa.', restricted: !canSeeRecovery },
    { to: '/roadmap', ic: 'roadmap', title: 'Roadmap', desc: 'Fases da plataforma e o que ainda não existe.' },
  ];

  return (
    <>
      <section className="portal-hero">
        <div className="kicker">{pos.name || 'Plataforma de Pesquisa e Recuperação de Ativos Legados'}</div>
        <h1>Documento antigo não é ativo. É o começo de uma pergunta.</h1>
        <p>
          {pos.tagline || 'Organizamos a evidência de direitos societários antigos e o caminho para confirmá-los na fonte oficial.'}
          {' '}O primeiro caso estudado é o do BESC, incorporado ao Banco do Brasil em 2008/2009. Aqui se pergunta, antes de
          qualquer outra coisa: que evidência é esta, que direito ela poderia representar, se esse direito ainda existe,
          quem o reconhece e onde ele está registrado.
        </p>
        <div className="hero-actions">
          <Link className="btn primary" to="/referencia"><Icon name="scale" /> Entender o caso BESC</Link>
          <Link className="btn" to="/jurisprudencia"><Icon name="gavel" /> Jurisprudência reavaliada</Link>
          {canSeeRecovery && <Link className="btn" to="/recuperacao"><Icon name="folder" /> Reivindicações</Link>}
        </div>
      </section>

      <div className="section-title">Como a plataforma trata um documento antigo</div>
      <StagesLegend />

      {principles.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}><div className="card-body">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Princípios</h3>
          <ol style={{ lineHeight: 1.7, paddingLeft: 20 }}>
            {principles.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </div></div>
      )}

      <div className="grid2" style={{ marginBottom: 24 }}>
        {entries.map((e) => (
          <Link key={e.to} to={e.to} className="entry-card">
            <span className="ec-ic"><Icon name={e.ic} size={20} /></span>
            <span className="ec-body">
              <h3>{e.title}</h3>
              <p>{e.desc}</p>
              {e.count != null && <p style={{ marginTop: 6 }}><span className="ec-count">{e.count}</span> {e.unit}</p>}
              {e.restricted && <p className="ec-lock"><Icon name="lock" size={12} /> Área restrita — requer acesso</p>}
            </span>
          </Link>
        ))}
      </div>

      {stats && jur.total > 0 && (
        <div className="card" style={{ marginBottom: 18 }}><div className="card-body">
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Sobre o acervo de jurisprudência</h3>
          <p className="small muted" style={{ lineHeight: 1.6 }}>{jur.caveat}</p>
          <p className="small" style={{ marginTop: 6 }}>
            {jur.provisional} das decisões públicas são provisórias ou tratam só de garantia do juízo. {jur.restricted} registros do acervo ficam restritos à curadoria: petições, laudos, documentos não judiciais e itens sem classificação.
          </p>
        </div></div>
      )}
    </>
  );
}
