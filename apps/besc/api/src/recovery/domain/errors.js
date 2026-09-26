// Erros do domínio de recuperação. Toda violação de invariante é explícita e tipada:
// nenhum objeto avança de classe "porque parece válido".
export class DomainInvariantError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainInvariantError';
    this.code = code;
    this.details = details;
  }
}

export class NotAvailableInPhaseError extends Error {
  constructor(capability, phase) {
    super(`${capability} não está disponível nesta fase (${phase}); nenhuma integração é simulada como real`);
    this.name = 'NotAvailableInPhaseError';
    this.code = 'NOT_AVAILABLE_IN_PHASE';
    this.phase = phase;
  }
}

export const fail = (code, message, details) => { throw new DomainInvariantError(code, message, details); };
