// Vocabulário visual da recuperação de ativos legados (ADR-010).
// Três estágios, nunca confundidos: POSSÍVEL DIREITO (evidência + reivindicação),
// DIREITO CONFIRMADO (confirmação externa, F4) e ATIVO REGISTRADO (system of record, F5).
import React from 'react';

export const STAGES = [
  { key: 'POSSIBLE_RIGHT', label: 'POSSÍVEL DIREITO', tone: 'b-amber', text: 'Há evidência e uma reivindicação. Nenhuma fonte oficial confirmou nada.' },
  { key: 'CONFIRMED_RIGHT', label: 'DIREITO CONFIRMADO', tone: 'b-blue', text: 'Escriturador, depositário ou decisão definitiva confirmou titularidade e quantidade (fase F4).' },
  { key: 'REGISTERED_ASSET', label: 'ATIVO REGISTRADO', tone: 'b-green', text: 'A posição está registrada no sistema oficial de registro (fase F5).' },
];

export function StageBadge({ stage }) {
  const s = STAGES.find((x) => x.key === stage) || STAGES[0];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export const CLAIM_STATE_LABEL = {
  DRAFT: 'Rascunho', OPEN: 'Aberta', EVIDENCE_GATHERING: 'Reunindo evidências', UNDER_ANALYSIS: 'Em análise',
  LITIGATION: 'Em litígio', VALIDATION_REQUESTED: 'Validação solicitada', RECOGNIZED: 'Reconhecida',
  INCONCLUSIVE: 'Inconclusiva', REJECTED: 'Rejeitada', WITHDRAWN: 'Desistência',
};

export const EVIDENCE_STATE_LABEL = {
  RECEIVED: 'Recebida', CLASSIFIED: 'Classificada', LINKED: 'Vinculada', SUSPECT: 'Suspeita', REJECTED: 'Rejeitada', SUPERSEDED: 'Substituída',
};

export const CLAIM_KIND_LABEL = {
  BOOK_ENTRY_POSITION: 'Posição escritural não localizada',
  UNCONVERTED_POSITION: 'Posição não regularizada após a conversão',
  UNPAID_PROCEEDS: 'Proventos não pagos',
  FRACTION_PROCEEDS: 'Produto de frações retido',
  DAMAGES: 'Indenização',
  UNKNOWN: 'A definir',
};

export const PERSON_TYPE_LABEL = { PF: 'Pessoa física', PJ: 'Pessoa jurídica', ESTATE: 'Espólio', UNKNOWN: 'Não informado' };

export const JOURNEY_STATUS = {
  DONE: { label: 'Feito', tone: 'b-green' },
  PENDING: { label: 'Pendente', tone: 'b-amber' },
  NOT_AVAILABLE_IN_PHASE: { label: 'Não disponível nesta fase', tone: 'b-grey' },
};

export const VALUE_TYPE_LABEL = {
  claimed_value: 'Valor alegado',
  historical_value: 'Valor histórico (documento de época)',
  expert_estimate: 'Estimativa de especialista (laudo)',
  recognized_value: 'Valor reconhecido',
  market_value: 'Valor de mercado',
  collateral_value: 'Valor como garantia',
  liquidation_value: 'Valor de liquidação',
};

export function StagesLegend() {
  return (
    <div className="grid3" style={{ gap: 10, marginBottom: 16 }}>
      {STAGES.map((s) => (
        <div key={s.key} className="card"><div className="card-body" style={{ padding: 12 }}>
          <span className={`badge ${s.tone}`}>{s.label}</span>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{s.text}</p>
        </div></div>
      ))}
    </div>
  );
}
