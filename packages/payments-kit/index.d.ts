// Tipos de @flavioneto11/payments-kit (entry Node).
//
// REGRA DE SEGURANCA: a superficie publica NUNCA expoe `cardNumber`/`PAN`.
// O unico dado de instrumento de pagamento aceito eh `paymentMethodToken` (opaco).

export type PaymentProvider = 'sandbox' | 'real';

export type ChargeStatus = 'authorized' | 'declined';
export type TransactionStatus = 'authorized' | 'declined' | 'refunded';

export interface ChargeInput {
  amount: number;
  currency?: string;
  /** Token opaco do instrumento de pagamento. NUNCA o numero do cartao. */
  paymentMethodToken: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface Transaction {
  transactionId: string;
  status: TransactionStatus;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEntry {
  event: 'charge' | 'refund';
  idempotencyKey?: string | null;
  transactionId: string;
  status: TransactionStatus;
  amount?: number;
}

export interface CreatePaymentGatewayOptions {
  provider?: PaymentProvider;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  onAudit?: (entry: AuditEntry) => void;
}

export interface VerifyWebhookArgs {
  rawBody: string | Buffer;
  signatureHeader: string;
  secret: string;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  charge(input: ChargeInput): Promise<Transaction>;
  refund(transactionId: string): Promise<Transaction>;
  getTransaction(transactionId: string): Promise<Transaction>;
  verifyWebhook(args: VerifyWebhookArgs): boolean;
}

export function createPaymentGateway(opts?: CreatePaymentGatewayOptions): PaymentGateway;
export function verifyWebhookSignature(args: VerifyWebhookArgs): boolean;

export class PaymentError extends Error {
  constructor(message: string, code?: string);
  code: string;
}
export class PaymentConfigError extends PaymentError {
  constructor(message: string);
}
export class PaymentDeclinedError extends PaymentError {
  constructor(message: string);
}
