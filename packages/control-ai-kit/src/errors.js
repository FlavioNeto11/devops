// errors.js — erros estruturados da control-ai-kit.
//
// Padrao da plataforma: erro com `code` estavel (string) para o app reagir
// programaticamente (log/metrica/branch), nunca um Error cru.

export class ControlAiError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'CONTROL_AI_ERROR') {
    super(message);
    this.name = 'ControlAiError';
    this.code = code;
  }
}

export class ControlAiConfigError extends ControlAiError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'CONTROL_AI_CONFIG');
    this.name = 'ControlAiConfigError';
  }
}
