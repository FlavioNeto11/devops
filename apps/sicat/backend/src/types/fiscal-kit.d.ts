/**
 * Shim de tipos LOCAL para `@flavioneto11/fiscal-kit` (PR-G) — NÃO edita o pacote (instrução
 * explícita do programa: o kit só é CONSUMIDO).
 *
 * ── Por que este shim existe ────────────────────────────────────────────────────────────────────
 * `packages/fiscal-kit/package.json` declara `"exports": {".": "./src/index.js", ...}` SEM uma
 * condição `"types"` — sob `moduleResolution: "NodeNext"` (`tsconfig.json` deste backend) o
 * TypeScript resolve estritamente pelo mapa `exports` e NÃO encontra `index.d.ts` na raiz do
 * pacote (mesmo ele existindo e sendo referenciado por `"types"` no `package.json`), produzindo
 * `TS7016: Could not find a declaration file for module '@flavioneto11/fiscal-kit'`. Isto é uma
 * LACUNA DE EMPACOTAMENTO do kit (faltaria `"exports": {".": {"types": "./index.d.ts", "default":
 * "./src/index.js"}}`), reportada aqui em vez de corrigida — o kit é só consumido neste PR.
 *
 * O conteúdo abaixo REPLICA `packages/fiscal-kit/index.d.ts` (fonte da verdade da API pública do
 * kit) — se a API do kit mudar, este shim precisa acompanhar manualmente até o empacotamento ser
 * corrigido upstream.
 */

declare module '@flavioneto11/fiscal-kit' {
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
}
