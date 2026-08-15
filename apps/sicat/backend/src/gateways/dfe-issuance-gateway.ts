/**
 * Gateway de emissão de DF-e (PR-G, DL-103) — camada ÚNICA autorizada a "falar" com o
 * `@flavioneto11/fiscal-kit`; serviço/worker nunca importam o kit diretamente.
 *
 * A Fase G é CONDICIONAL a go/no-go comercial + certificado digital + credenciamento SEFAZ
 * ([LEGAL REVIEW REQUIRED]+[EXTERNAL DEPENDENCY], pendência P9 do guia do programa). Este gateway
 * entrega a arquitetura completa, testável hoje em `mode: 'sandbox'` (via o kit, fail-closed sem
 * certificado) — `mode: 'off'` (default de `DFE_ISSUANCE_MODE`) recusa TODA chamada.
 *
 * ── Padrão DL-102 aplicado à emissão fiscal ───────────────────────────────────────────────────────
 * O protocolo de autorização nasce na RESPOSTA de `submitDocument` (via `kit.submit` +
 * `kit.queryStatus`) — nenhum identificador nosso existe do lado da SEFAZ antes disso.
 * `queryByMarker` é a "pergunta ao provedor" que o reconciliador
 * (`services/dfe-issuance-reconciler.ts`) faz quando uma resposta se perde: consulta o MESMO
 * armazenamento sandbox que `submitDocument` escreve, chaveado pelo `correlationMarker` que o
 * service grava ANTES de qualquer chamada (`lib/transport/dfe-issuance-correlation.ts`).
 *
 * ── `mode: 'sandbox'` + NF-e — comportamento REAL observado do `@flavioneto11/fiscal-kit` ─────────
 * `createFiscalGateway({mode:'sandbox'})` (lido em `packages/fiscal-kit/src/index.js` +
 * `src/sefaz/sandbox.js` + `src/nfe/sign.js`): `buildNfeXml`/`signXml` são PUROS e DETERMINÍSTICOS
 * (mesma invoice ⇒ mesmo XML/assinatura, sem timestamp/aleatoriedade); `submit` devolve
 * `{receipt: 'rec_' + sha256(signedXml).slice(0,16), status: 'received'}` SEM rede/espera; e
 * `queryStatus(receipt)` devolve IMEDIATAMENTE `{status:'authorized', protocol: 'NFe'+sha256(receipt).slice(0,12)}`
 * — o sandbox do kit NUNCA rejeita e NUNCA deixa a emissão "pendente": não existe, hoje, um cenário
 * sandbox real de autorização demorada ou de rejeição pelo kit. A topologia DL-102
 * (`submitting`/`submit_unconfirmed`/reconciliação) desta Fase G existe para quando isso deixar de
 * ser verdade (emissor real futuro) e é exercitada nos testes injetando falha na chamada ao gateway
 * — não porque o kit sandbox produza esse cenário sozinho.
 *
 * ── Por que o XML persistido NÃO é o XML cru do kit ───────────────────────────────────────────────
 * `buildNfeXml` do kit produz um formato PRÓPRIO minimalista, incompatível com o parser real da
 * SEFAZ que a Fase E já usa (`lib/transport/dfe-parser.ts`). Este gateway CHAMA o kit de verdade em
 * cada etapa (build/sign/submit/queryStatus — nada é simulado por fora) e tece o resultado real
 * (digest da assinatura, recibo, protocolo) dentro de um envelope no layout que a Fase E sabe ler
 * (`lib/transport/dfe-issuance-nfe-mapper.ts`), para a emissão autorizada poder ser reimportada ao
 * acervo (`transport-fiscal-service.importarDocumentoFiscal`) SEM alterar uma linha daquele código.
 */

import { createFiscalGateway } from '@flavioneto11/fiscal-kit';
import type { FiscalGateway, Invoice } from '@flavioneto11/fiscal-kit';

import { AppError } from '../lib/problem.js';
import { config } from '../lib/config.js';
import {
  appendSandboxSignature,
  buildAuthorizedNfeXml,
  buildNfeEnvelopeXml,
  buildSandboxNfeAccessKey,
  mapAggregateToNfeIssuanceInputs
} from '../lib/transport/dfe-issuance-nfe-mapper.js';
import type { TransportOperationAggregate } from '../lib/transport/transport-operation-types.js';
import type { DfeIssuanceDocumentType } from '../lib/transport/dfe-issuance-types.js';

const NFE_LAYOUT_VERSION = '4.00';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type DfeIssuanceGatewayMode = 'off' | 'sandbox';

export type DfeIssuanceBuildInput = {
  operationAggregate: TransportOperationAggregate;
  correlationMarker: string;
};

export type DfeIssuanceBuildResult = {
  /** Envelope SEM assinatura, layout real da SEFAZ — o que `dfe-parser.ts` sabe ler. */
  xml: string;
  accessKey: string;
  /** XML cru devolvido pelo kit (`buildNfeXml`) — evidência de que a chamada real aconteceu. */
  kitRawXml: string;
};

export type DfeIssuanceSignResult = {
  /** Envelope + `<Signature sandbox="true" digest="...">`. */
  signedXml: string;
  /** XML assinado cru devolvido pelo kit (`signXml`). */
  kitSignedRawXml: string;
  digest: string;
};

export type DfeIssuanceSubmitResult = {
  outcome: 'authorized' | 'rejected';
  protocol: string | null;
  /** Documento FINAL (`nfeProc`), pronto para `STORAGE_DIR` + reimportação à Fase E. `null` quando `rejected`. */
  authorizedXml: string | null;
  raw: Record<string, unknown>;
};

export type DfeIssuanceQueryResult =
  | { found: true; outcome: 'authorized' | 'rejected'; protocol: string | null; authorizedXml: string | null; raw: Record<string, unknown> }
  | { found: false };

export interface DfeIssuanceGateway {
  mode: DfeIssuanceGatewayMode;
  documentType: DfeIssuanceDocumentType;
  buildDocument(input: DfeIssuanceBuildInput): Promise<DfeIssuanceBuildResult>;
  signDocument(input: { correlationMarker: string }): Promise<DfeIssuanceSignResult>;
  submitDocument(input: { correlationMarker: string }): Promise<DfeIssuanceSubmitResult>;
  queryByMarker(input: { correlationMarker: string }): Promise<DfeIssuanceQueryResult>;
}

export type CreateDfeIssuanceGatewayOptions = {
  mode?: DfeIssuanceGatewayMode;
  documentType: DfeIssuanceDocumentType;
};

// =================================================================================================
// Erros tipados — DFE_ISSUANCE_*
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'DF-e Issuance Gateway Error', detail, { code, ...(context ? { context } : {}) });
}

function throwDisabled(): never {
  throw gatewayError(
    501,
    'DFE_ISSUANCE_DISABLED',
    'Emissão de DF-e desligada (DFE_ISSUANCE_MODE=off) — pendência [LEGAL REVIEW REQUIRED]+'
      + '[EXTERNAL DEPENDENCY] P9 do guia do programa (docs/30-transporte/transporte-guia.md): '
      + 'go/no-go comercial + certificado digital + credenciamento SEFAZ ainda pendentes. Use '
      + 'DFE_ISSUANCE_MODE=sandbox para testar o pipeline sem emissão real.',
    { code: 'DFE_ISSUANCE_DISABLED' }
  );
}

function throwTypeNotSupported(documentType: DfeIssuanceDocumentType): never {
  throw gatewayError(
    501,
    'DFE_ISSUANCE_TYPE_NOT_SUPPORTED',
    `Emissão de ${documentType} não suportada neste PR — @flavioneto11/fiscal-kit cobre apenas NF-e. `
      + 'CT-e/MDF-e entram quando houver emissor contratado/implementado (pendência P9 do guia do programa).',
    { documentType }
  );
}

// =================================================================================================
// Armazenamento sandbox — STATEFUL EM MEMÓRIA POR PROCESSO (módulo-level, mesmo molde de
// `gateways/ciot-provider-gateway.ts#mockCiotStore`): simula o "outro lado" (a SEFAZ sandbox), não
// um banco — não sobrevive a restart do processo, e essa É a semântica correta de um simulador.
// =================================================================================================

type SandboxIssuanceRecord = {
  envelopeXml: string;
  signedEnvelopeXml: string | null;
  accessKey: string;
  kitInvoice: Invoice;
  kitXml: string;
  kitSignedXml: string | null;
  digest: string | null;
  receipt: string | null;
  protocol: string | null;
  authorizedXml: string | null;
};

const sandboxStore = new Map<string, SandboxIssuanceRecord>();

/** Exposto só para testes — nenhum código de produção deve resetar o estado do "provedor" sandbox. */
export function resetDfeIssuanceSandboxStoreForTests(): void {
  sandboxStore.clear();
}

function requireSandboxRecord(marker: string, step: string): SandboxIssuanceRecord {
  const record = sandboxStore.get(marker);
  if (!record) {
    throw gatewayError(
      409,
      'DFE_ISSUANCE_STEP_OUT_OF_ORDER',
      `Nenhuma emissão sandbox iniciada sob o marcador "${marker}" — "${step}" exige um `
        + '"buildDocument" anterior no MESMO processo (o simulador sandbox é em memória).',
      { correlationMarker: marker, step }
    );
  }
  return record;
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createDfeIssuanceGateway(options: CreateDfeIssuanceGatewayOptions): DfeIssuanceGateway {
  const mode = options.mode ?? config.dfeIssuanceMode;
  const documentType = options.documentType;

  if (mode === 'off') {
    return {
      mode,
      documentType,
      buildDocument: async () => throwDisabled(),
      signDocument: async () => throwDisabled(),
      submitDocument: async () => throwDisabled(),
      queryByMarker: async () => throwDisabled()
    };
  }

  if (documentType !== 'NFE') {
    return {
      mode,
      documentType,
      buildDocument: async () => throwTypeNotSupported(documentType),
      signDocument: async () => throwTypeNotSupported(documentType),
      submitDocument: async () => throwTypeNotSupported(documentType),
      queryByMarker: async () => throwTypeNotSupported(documentType)
    };
  }

  // `mode: 'sandbox'` + NF-e — única combinação implementada. `kit` é o `@flavioneto11/fiscal-kit`
  // REAL, sempre em `mode: 'sandbox'` (nunca 'real' — este PR não tem certificado nem P9 resolvida).
  const kit: FiscalGateway = createFiscalGateway({ mode: 'sandbox' });

  async function buildDocument({ operationAggregate, correlationMarker }: DfeIssuanceBuildInput): Promise<DfeIssuanceBuildResult> {
    const mapped = mapAggregateToNfeIssuanceInputs(operationAggregate);
    const issuedAt = new Date();
    const accessKey = buildSandboxNfeAccessKey({
      originUf: mapped.originUf,
      emitDocumentDigits: mapped.emit.documentDigits,
      correlationMarker,
      issuedAt
    });
    // `numero` da NF-e = fatia da própria chave de acesso (posições 25..33, layout SEFAZ) — mesma
    // origem determinística, sem inventar um segundo esquema de numeração.
    const invoiceNumber = accessKey.slice(25, 34);

    const invoice: Invoice = {
      number: invoiceNumber,
      series: '1',
      cnpj: mapped.emit.documentDigits,
      items: mapped.items,
      total: mapped.totalAmount
    };

    // Chamada REAL ao kit — determinística (mesma invoice ⇒ mesmo XML, sem timestamp).
    const kitXml = kit.buildNfeXml(invoice);

    const envelopeXml = buildNfeEnvelopeXml({
      accessKey,
      layoutVersion: NFE_LAYOUT_VERSION,
      issuedAtIso: issuedAt.toISOString(),
      natOp: 'Venda de mercadoria (transporte SICAT — sandbox)',
      emit: mapped.emit,
      dest: mapped.dest,
      items: mapped.items,
      totalAmount: mapped.totalAmount
    });

    sandboxStore.set(correlationMarker, {
      envelopeXml,
      signedEnvelopeXml: null,
      accessKey,
      kitInvoice: invoice,
      kitXml,
      kitSignedXml: null,
      digest: null,
      receipt: null,
      protocol: null,
      authorizedXml: null
    });

    return { xml: envelopeXml, accessKey, kitRawXml: kitXml };
  }

  async function signDocument({ correlationMarker }: { correlationMarker: string }): Promise<DfeIssuanceSignResult> {
    const record = requireSandboxRecord(correlationMarker, 'signDocument');

    // Chamada REAL ao kit — sandbox: marcador determinístico `<Signature sandbox="true" digest="..."/>`
    // derivado do SHA-256 do XML (ver `packages/fiscal-kit/src/nfe/sign.js`).
    const kitSignedXml = kit.signXml(record.kitXml);
    const digest = /digest="([a-f0-9]+)"/.exec(kitSignedXml)?.[1] ?? '';

    const signedEnvelopeXml = appendSandboxSignature(record.envelopeXml, digest);
    record.kitSignedXml = kitSignedXml;
    record.digest = digest;
    record.signedEnvelopeXml = signedEnvelopeXml;

    return { signedXml: signedEnvelopeXml, kitSignedRawXml: kitSignedXml, digest };
  }

  async function submitDocument({ correlationMarker }: { correlationMarker: string }): Promise<DfeIssuanceSubmitResult> {
    const record = requireSandboxRecord(correlationMarker, 'submitDocument');
    if (!record.kitSignedXml || !record.signedEnvelopeXml) {
      throw gatewayError(
        409,
        'DFE_ISSUANCE_STEP_OUT_OF_ORDER',
        `submitDocument exige um "signDocument" concluído antes (marcador "${correlationMarker}").`,
        { correlationMarker }
      );
    }

    // Chamadas REAIS ao kit — submit devolve um recibo síncrono; queryStatus (sandbox) já responde
    // 'authorized' IMEDIATAMENTE, sem polling (comportamento observado, documentado no header do
    // arquivo). O sandbox do kit NUNCA rejeita — `outcome` fica sempre 'authorized' nesta combinação.
    const { receipt } = kit.submit(record.kitSignedXml);
    const statusResult = kit.queryStatus(receipt);

    record.receipt = receipt;
    record.protocol = statusResult.protocol;

    const authorizedXml = buildAuthorizedNfeXml({
      signedEnvelopeXml: record.signedEnvelopeXml,
      accessKey: record.accessKey,
      protocol: statusResult.protocol,
      authorizedAtIso: new Date().toISOString(),
      layoutVersion: NFE_LAYOUT_VERSION
    });
    record.authorizedXml = authorizedXml;

    return {
      outcome: 'authorized',
      protocol: statusResult.protocol,
      authorizedXml,
      raw: { receipt, kitStatus: statusResult.status, kitProtocol: statusResult.protocol }
    };
  }

  async function queryByMarker({ correlationMarker }: { correlationMarker: string }): Promise<DfeIssuanceQueryResult> {
    const record = sandboxStore.get(correlationMarker);
    if (!record || !record.receipt) return { found: false };

    // Chamada REAL ao kit — idempotente: o mesmo `receipt` sempre devolve o mesmo protocolo.
    const statusResult = kit.queryStatus(record.receipt);
    return {
      found: true,
      outcome: 'authorized',
      protocol: statusResult.protocol,
      authorizedXml: record.authorizedXml,
      raw: { receipt: record.receipt, kitStatus: statusResult.status, kitProtocol: statusResult.protocol }
    };
  }

  return { mode, documentType, buildDocument, signDocument, submitDocument, queryByMarker };
}
