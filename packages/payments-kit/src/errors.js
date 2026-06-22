// Erros do payments-kit. Cada um carrega .name e .code estaveis para
// auditoria/observabilidade e tratamento programatico (fail-closed).

export class PaymentError extends Error {
  constructor(message, code = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
  }
}

export class PaymentConfigError extends PaymentError {
  constructor(message) {
    super(message, 'PAYMENT_CONFIG');
    this.name = 'PaymentConfigError';
  }
}

export class PaymentDeclinedError extends PaymentError {
  constructor(message) {
    super(message, 'PAYMENT_DECLINED');
    this.name = 'PaymentDeclinedError';
  }
}
