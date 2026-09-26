// Roadmap (ADR-010): fases da reconciliação (repo besc, docs/reconciliation/15-roadmap.md).
// Sem números de mercado: o gate multi-emissor está fechado e o TAM não foi medido.
import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';

const STATUS = {
  pronto: { cls: 'b-green', label: 'Pronto' },
  planejado: { cls: 'b-grey', label: 'Planejado' },
  bloqueado: { cls: 'b-amber', label: 'Bloqueado por gate' },
  fora: { cls: 'b-grey', label: 'Opcional / fora do escopo' },
};

const PHASES = [
  { id: 'F0', status: 'pronto', title: 'F0 — Reconciliação do conhecimento', body: 'A pesquisa jurídica nova foi confrontada com a tese antiga. Resultado: ações BESC foram convertidas em ações do BB em 2009; cautela é evidência histórica; laudo privado é alegação; token não cria propriedade.', links: [['/referencia', 'Referência']] },
  { id: 'F1', status: 'pronto', title: 'F1 — Correção do domínio', body: 'Marketplace, emissão de tokens, aluguel e investimento congelados no servidor. Novo domínio: evidência legada, reivindicação, direito reconhecido e ativo registrado, com invariantes no banco e aprovação em quatro olhos.' },
  { id: 'F2', status: 'pronto', title: 'F2 — Ingestão de evidência legada', body: 'Upload com hash, classificação do documento e da natureza da fonte, reivindicações e migração dos casos de levantamento. Todo registro nasce como POSSÍVEL DIREITO.', links: [['/recuperacao', 'Reivindicações']] },
  { id: 'F3', status: 'planejado', title: 'F3 — Cadeia de titularidade', body: 'Reconstrução de quem era titular, por herança, cessão ou partilha, com eventos societários da origem (grupamentos, conversão, frações).' },
  { id: 'F4', status: 'planejado', title: 'F4 — Validação externa', body: 'Pedido formal ao escriturador, ao depositário ou ao tribunal. Só uma resposta real, com evidência externa, leva a DIREITO CONFIRMADO. Nada é simulado.' },
  { id: 'F5', status: 'planejado', title: 'F5 — Ativo registrado', body: 'Posição confirmada e registrada no sistema oficial de registro. Só aqui passa a existir um ativo.' },
  { id: 'F6', status: 'planejado', title: 'F6 — Motor de garantias', body: 'Garantia só é constituída quando registrada na infraestrutura oficial. Bloqueio digital não é garantia.' },
  { id: 'F7', status: 'planejado', title: 'F7 — Integrações institucionais', body: 'Canais com escrituradores, depositários e registradoras. Nenhuma integração existe hoje.' },
  { id: 'F8', status: 'bloqueado', title: 'F8 — Múltiplos emissores', body: 'Outras origens (bancos estaduais incorporados) permanecem em pesquisa. O gate multi-emissor está fechado e nenhuma escala foi comprovada.' },
  { id: 'F9', status: 'fora', title: 'F9 — Representação regulada', body: 'Tokenização é opcional e só faria sentido sobre ativo registrado, dentro de estrutura regulada. Blockchain é opcional.' },
];

export default function Roadmap() {
  return (
    <>
      <div className="help-hero">
        <h1>Roadmap</h1>
        <p>
          Da evidência histórica à confirmação na fonte oficial. As fases F0 a F2 estão no ar; as demais
          dependem de pesquisa, de integrações reais ou de decisões regulatórias ainda não tomadas.
        </p>
      </div>

      {PHASES.map((p) => {
        const s = STATUS[p.status];
        return (
          <div key={p.id} className="phase-card">
            <div className="pc-head">
              <h3>{p.title}</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <span className={`badge ${s.cls}`}>{s.label}</span>
            </div>
            <p>{p.body}</p>
            {p.links && (
              <div className="row" style={{ marginTop: 8 }}>
                {p.links.map(([to, lbl]) => <Link key={to} to={to} className="btn sm ghost">{lbl} <Icon name="chevronRight" size={13} /></Link>)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
