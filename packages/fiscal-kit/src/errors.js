// Erros do fiscal-kit. Todos carregam um `code` estavel para o consumidor
// reagir de forma programatica (ex.: fail-closed vs. rejeicao de negocio).

export class FiscalError extends Error {
  constructor(message, code = 'FISCAL_ERROR') {
    super(message);
    this.name = 'FiscalError';
    this.code = code;
  }
}

// Configuracao ausente/invalida (ex.: modo real sem certificado). Fail-closed.
export class FiscalConfigError extends FiscalError {
  constructor(message) {
    super(message, 'FISCAL_CONFIG');
    this.name = 'FiscalConfigError';
  }
}

// Nota rejeitada pela autoridade (SEFAZ) por regra de negocio/validacao.
export class FiscalRejectedError extends FiscalError {
  constructor(message) {
    super(message, 'FISCAL_REJECTED');
    this.name = 'FiscalRejectedError';
  }
}
