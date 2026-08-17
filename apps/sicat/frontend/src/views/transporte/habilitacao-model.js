/**
 * Modelo PURO da tela "Minha habilitação" (onda F9 — REQ-SICAT-0037, com os
 * dados derivados de REQ-SICAT-0033). Sem Vue, sem store: importável em
 * node:test, mesmo racional de `features/dashboard/carrier-home-model.js` e
 * `views/transporte/operacao-create-model.js`.
 *
 * ─── POR QUE UM HELPER PRÓPRIO, e não `buildCarrierChecklist` ───────────────
 * O checklist da HOME é de ONBOARDING da CONTA: quatro passos de "existe?"
 * (transportadora → frota → seguros → primeira viagem) que somem quando
 * completos. Este aqui é um DIAGNÓSTICO PERMANENTE de UM transportador: mede
 * REGULARIDADE (RNTRC verificado E ativo — não basta existir cadastro), inclui
 * MOTORISTA (que a home não tem) e não some nunca, porque um RNTRC pode
 * regredir para suspenso a qualquer momento. Os dois checklists respondem
 * perguntas diferentes ("já comecei?" × "posso rodar hoje?"); fundi-los faria a
 * home mentir ou a habilitação esconder o que interessa. Ficam separados, e é
 * este arquivo que a tela de habilitação usa.
 */

/** Só RNTRC verificado (tem data) E com registro ativo habilita a operar. */
export function isRntrcRegular(carrier) {
  return String(carrier?.rntrcStatus || '').trim() === 'active' && Boolean(carrier?.rntrcVerifiedAt);
}

/**
 * "O que falta para operar" — os quatro requisitos que o motor de conformidade
 * cobra no pré-embarque, na ordem em que travam a viagem. Cada item leva ao
 * lugar onde se resolve (regra do produto: nada aponta para tela inexistente).
 */
export function buildHabilitacaoChecklist({
  carrier = null,
  vehiclesCount = 0,
  driversCount = 0,
  activePoliciesCount = 0
} = {}) {
  return [
    {
      key: 'rntrc',
      label: 'RNTRC verificado e regular',
      description: 'Registro na ANTT com situação ativa e verificação registrada — sem ele o frete é irregular.',
      done: isRntrcRegular(carrier),
      to: '/transporte/transportadores',
      actionLabel: 'Ver cadastro'
    },
    {
      key: 'frota',
      label: 'Pelo menos um veículo',
      description: 'A frota ativa também é o que define a tipologia (TAC até 3 · ETC 4 ou mais).',
      done: Number(vehiclesCount) > 0,
      to: '/transporte/veiculos',
      actionLabel: 'Ver veículos'
    },
    {
      key: 'motoristas',
      label: 'Pelo menos um motorista',
      description: 'CNH válida do condutor — é também o alvo da pesquisa cadastral da seguradora.',
      done: Number(driversCount) > 0,
      to: '/transporte/motoristas',
      actionLabel: 'Ver motoristas'
    },
    {
      key: 'seguro',
      label: 'Apólice vigente',
      description: 'Sem cobertura viva a viagem trava no pré-embarque (TR-SEG-004/005).',
      done: Number(activePoliciesCount) > 0,
      to: '/transporte/seguros/apolices',
      actionLabel: 'Ver apólices'
    }
  ];
}

export function isHabilitacaoComplete(steps) {
  return Array.isArray(steps) && steps.length > 0 && steps.every((step) => step.done);
}

export function countHabilitacaoPending(steps) {
  return Array.isArray(steps) ? steps.filter((step) => !step.done).length : 0;
}

const TYPOLOGY_COPY = Object.freeze({
  driver_pf: {
    label: 'Motorista autônomo (PF)',
    explanation: 'Pessoa física sem frota própria registrada — dirige, mas não figura como empresa transportadora.'
  },
  tac: {
    label: 'TAC — Transportador Autônomo de Cargas',
    explanation: 'Até 3 veículos na frota ativa. Não emite CIOT para si e, em geral, roda sob a apólice de quem contrata.'
  },
  etc: {
    label: 'ETC — Empresa de Transporte de Cargas',
    explanation: '4 ou mais veículos na frota ativa: emite CIOT ao contratar autônomo e é obrigada a contratar o seguro da carga.'
  }
});

/**
 * Traduz a tipologia DERIVADA (nunca persistida — vem calculada da frota
 * owned+leased ativa, REQ-SICAT-0033) para linguagem de operador, incluindo a
 * conta que a produziu. O aviso de divergência declarado × derivado é do
 * BACKEND (`typologyWarning`, não bloqueante) — a tela só o destaca, nunca o
 * recalcula: recalcular aqui criaria uma segunda verdade sobre a mesma regra.
 */
export function describeTypology(carrier) {
  const code = String(carrier?.derivedTypology || '').trim();
  const copy = TYPOLOGY_COPY[code] || null;
  const fleetSize = Number(carrier?.fleetSize ?? 0);
  const warning = String(carrier?.typologyWarning || '').trim();

  return {
    code,
    known: Boolean(copy),
    label: copy?.label || 'Tipologia ainda não derivada',
    explanation: copy?.explanation
      || 'A tipologia sai da frota ativa do transportador — cadastre veículos para que ela seja calculada.',
    fleetSize,
    fleetLabel: `${fleetSize} ${fleetSize === 1 ? 'veículo na frota ativa' : 'veículos na frota ativa'}`,
    warning: warning || null
  };
}
