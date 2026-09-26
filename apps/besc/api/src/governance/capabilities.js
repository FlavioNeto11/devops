// Capacidades da plataforma (ADR-010 — pivot para Legacy Asset Recovery).
//
// Estas flags NÃO são configuração: são constantes de código, congeladas, SEM override por
// variável de ambiente, banco ou frontend. Ligar qualquer uma delas exige mudança de código,
// nova ADR e parecer jurídico/regulatório externo (docs/pivot, repo besc docs/reconciliation).
// O gate regulatório antigo (marketplace/gate.js) lia um flag MUTÁVEL no banco e não bloqueava
// nenhuma rota de escrita; aqui o bloqueio é enforcement no backend, em três camadas:
//   1. rota  — governance/legacy-freeze.js responde 410 antes de qualquer autenticação;
//   2. domínio — as funções do marketplace chamam capabilityRefusal() antes de tocar o banco;
//   3. boot  — o adaptador Besu é recusado (bootMarketplace) enquanto TOKENIZATION_REAL = false.
export const CAPABILITIES = Object.freeze({
  TOKENIZATION_REAL: false, // emissão/representação real de tokens
  MARKETPLACE_REAL: false,  // oferta, listagem, contratação de títulos
  REAL_MONEY: false,        // faturas, taxas, aluguel, liquidação financeira
  REAL_INVESTMENT: false,   // qualquer operação de investimento por terceiros
});

export const CAPABILITY_ADR = 'ADR-010';

export class CapabilityDisabledError extends Error {
  constructor(capability) {
    super(`capacidade desativada: ${capability} (${CAPABILITY_ADR})`);
    this.name = 'CapabilityDisabledError';
    this.code = 'CAPABILITY_DISABLED';
    this.capability = capability;
  }
}

export function isCapabilityEnabled(name) {
  if (!Object.prototype.hasOwnProperty.call(CAPABILITIES, name)) throw new Error(`capacidade desconhecida: ${name}`);
  return CAPABILITIES[name] === true;
}

// Retorno no formato { status, body } usado pelos serviços do marketplace; null = permitido.
export function capabilityRefusal(...names) {
  const blocked = names.find((n) => !isCapabilityEnabled(n));
  if (!blocked) return null;
  return {
    status: 403,
    body: {
      error: 'operação desativada: a plataforma não opera marketplace, tokenização, dinheiro real nem investimento',
      code: 'CAPABILITY_DISABLED',
      capability: blocked,
      adr: CAPABILITY_ADR,
    },
  };
}

export function assertCapability(name) {
  if (!isCapabilityEnabled(name)) throw new CapabilityDisabledError(name);
}

// Middleware Express (para rotas novas que um dia dependam de capacidade real).
export function requireCapability(...names) {
  return (req, res, next) => {
    const r = capabilityRefusal(...names);
    if (r) return res.status(r.status).json(r.body);
    next();
  };
}
