// lib/app-error.js — REQ-STOCKPILOT-0004: erro tipado do gateway externo.
//
// Forma: { code, message, statusCode, originalError }. A STACK do erro original NUNCA é
// serializada nem logada — só a mensagem (já redigida). originalError carrega apenas a mensagem
// redigida do erro de baixo nível, para correlação, sem vazar segredos nem stack trace.
import { redactString } from './redact.js';

export class AppError extends Error {
  constructor(message, { code = 'GATEWAY_ERROR', statusCode = 502, transient = false, originalError = null } = {}) {
    super(redactString(message));
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.transient = !!transient;
    this.originalError = originalError
      ? { message: redactString(String(originalError.message || originalError)) }
      : null;
  }

  // Serialização segura: expõe a forma tipada SEM stack.
  toJSON() {
    return { code: this.code, message: this.message, statusCode: this.statusCode, originalError: this.originalError };
  }
}
