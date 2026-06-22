// Tipos do @flavioneto11/fiscal-kit (escritos a mao, minimos).

export interface InvoiceItem {
  desc: string;
  qty: number;
  price: number;
}

export interface Invoice {
  number: string | number;
  series: string | number;
  cnpj: string;
  items: InvoiceItem[];
  total: number;
}

export interface SubmitResult {
  receipt: string;
  status: string;
}

export interface StatusResult {
  receipt: string;
  status: string;
  protocol: string;
}

export interface FiscalGateway {
  buildNfeXml(invoice: Invoice): string;
  signXml(xml: string): string;
  submit(signedXml: string): SubmitResult;
  queryStatus(receipt: string): StatusResult;
}

export interface FiscalCertificate {
  pfx?: unknown;
  password?: string;
}

export interface FiscalGatewayConfig {
  mode?: 'sandbox' | 'real';
  certificate?: FiscalCertificate;
  uf?: string;
  environment?: string;
  timeoutMs?: number;
}

export function buildNfeXml(invoice: Invoice): string;

export interface SignXmlOptions {
  mode?: 'sandbox' | 'real';
  certPfx?: unknown;
  certPassword?: string;
}

export function signXml(xml: string, opts?: SignXmlOptions): string;

export function createFiscalGateway(config?: FiscalGatewayConfig): FiscalGateway;

export class FiscalError extends Error {
  code: string;
  constructor(message: string, code?: string);
}

export class FiscalConfigError extends FiscalError {
  constructor(message: string);
}

export class FiscalRejectedError extends FiscalError {
  constructor(message: string);
}
