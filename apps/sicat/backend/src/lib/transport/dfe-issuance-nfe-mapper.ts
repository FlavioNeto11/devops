/**
 * Mapeamento `TransportOperationAggregate` → entradas de emissão de NF-e (PR-G) + construtores PUROS
 * do envelope XML no layout REAL da SEFAZ (`infNFe`/`ide`/`emit`/`dest`/`total`/`protNFe`).
 *
 * ── Por que este arquivo existe (e não usa o XML do `@flavioneto11/fiscal-kit` diretamente) ───────
 * `packages/fiscal-kit/src/nfe/build.js#buildNfeXml` produz um XML PRÓPRIO minimalista
 * (`<NFe><ide><number>/<series></ide><emit><cnpj></emit><det-list>...</det-list><total></NFe>`) —
 * deliberadamente simples, sem chave de acesso de 44 dígitos, sem `infNFe`, sem `dest`. Isso é
 * INCOMPATÍVEL com `lib/transport/dfe-parser.ts` (Fase E), que interpreta o layout REAL da SEFAZ
 * (`infNFe/@Id`, `ide/dhEmi`, `emit/dest` com `CNPJ`/`CPF`/`xNome`, `total/ICMSTot/vNF`,
 * `protNFe/infProt`). O gateway (`gateways/dfe-issuance-gateway.ts`) CHAMA o kit de verdade
 * (`buildNfeXml`/`signXml`/`submit`/`queryStatus` — build→sign→submit→queryStatus REAIS, sandbox
 * determinístico) para exercitar o pipeline documentado no kit e capturar o comportamento REAL
 * observado (digest da assinatura, recibo, protocolo) — mas o XML que vira `dfe_issuances.xml_storage_ref`
 * e é reimportado ao acervo da Fase E (`transport-fiscal-service.importarDocumentoFiscal`, SEM
 * alterar uma linha daquele parser/validador) é este envelope, no formato que a Fase E já sabe ler.
 * O digest/recibo/protocolo do kit são tecidos DENTRO deste envelope (marcador `<Signature
 * sandbox="true" .../>`, `<protNFe><infProt><nProt>` = protocolo do kit) — nunca inventados.
 *
 * PURO: nenhuma chamada a banco/HTTP/relógio além do `issuedAt`/`authorizedAt` recebidos por
 * parâmetro (o chamador decide "agora").
 */

import { createHash } from 'node:crypto';
import { AppError } from '../problem.js';
import { computeAccessKeyCheckDigit } from './dfe-validator.js';
import type { TransportOperationAggregate, TransportOperationParty } from './transport-operation-types.js';

// =================================================================================================
// Erros
// =================================================================================================

export function dfeIssuanceIncompleteData(detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(422, 'Unprocessable Entity', detail, {
    code: 'DFE_ISSUANCE_INCOMPLETE_DATA',
    ...(context ? { context } : {})
  });
}

// =================================================================================================
// Mapeamento do agregado → entradas mínimas honestas da NF-e
// =================================================================================================

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function findPartyByRole(parties: TransportOperationParty[], role: string): TransportOperationParty | null {
  return parties.find((party) => party.role === role) ?? null;
}

export type NfeIssuancePartyInput = {
  /** `CNPJ` ou `CPF` — decide a tag do envelope (`<CNPJ>`/`<CPF>`). */
  documentTag: 'CNPJ' | 'CPF';
  documentDigits: string;
  name: string;
};

export type NfeIssuanceItemInput = { desc: string; qty: number; price: number };

export type NfeIssuanceMappedInputs = {
  emit: NfeIssuancePartyInput;
  dest: NfeIssuancePartyInput;
  items: NfeIssuanceItemInput[];
  totalAmount: number;
  originUf: string | null;
};

/**
 * Mapeamento MÍNIMO HONESTO (linguagem do PR): emitente = parte `contractor`, destinatário = parte
 * `consignee`, itens a partir de `cargo` (valor declarado da carga — a NF-e reflete o valor da
 * MERCADORIA, não o frete). Campo faltante → `DFE_ISSUANCE_INCOMPLETE_DATA` (422), nunca um XML
 * fabricado com dado ausente.
 */
export function mapAggregateToNfeIssuanceInputs(aggregate: TransportOperationAggregate): NfeIssuanceMappedInputs {
  const contractor = findPartyByRole(aggregate.parties, 'contractor');
  if (!contractor) {
    throw dfeIssuanceIncompleteData(
      'Emitente da NF-e indisponível: nenhuma parte com papel "contractor" vinculada à operação.',
      { role: 'contractor' }
    );
  }
  const emitDigits = onlyDigits(contractor.partySnapshot.documentNumber);
  const emitName = String(contractor.partySnapshot.legalName ?? '').trim();
  const emitDocType = String(contractor.partySnapshot.documentType ?? '').toUpperCase() === 'CPF' ? 'CPF' : 'CNPJ';
  if (!emitDigits || !emitName) {
    throw dfeIssuanceIncompleteData(
      'Emitente da NF-e incompleto: parte "contractor" sem documentNumber/legalName no snapshot.',
      { role: 'contractor' }
    );
  }

  const consignee = findPartyByRole(aggregate.parties, 'consignee');
  if (!consignee) {
    throw dfeIssuanceIncompleteData(
      'Destinatário da NF-e indisponível: nenhuma parte com papel "consignee" vinculada à operação.',
      { role: 'consignee' }
    );
  }
  const destDigits = onlyDigits(consignee.partySnapshot.documentNumber);
  const destName = String(consignee.partySnapshot.legalName ?? '').trim();
  const destDocType = String(consignee.partySnapshot.documentType ?? '').toUpperCase() === 'CPF' ? 'CPF' : 'CNPJ';
  if (!destDigits || !destName) {
    throw dfeIssuanceIncompleteData(
      'Destinatário da NF-e incompleto: parte "consignee" sem documentNumber/legalName no snapshot.',
      { role: 'consignee' }
    );
  }

  if (aggregate.cargo.length === 0) {
    throw dfeIssuanceIncompleteData('Operação sem itens de carga — obrigatório ao menos um item para montar a NF-e.');
  }

  const items: NfeIssuanceItemInput[] = aggregate.cargo.map((entry) => ({
    desc: (entry.description || entry.cargoType || 'Carga transportada').slice(0, 120),
    qty: 1,
    price: Number(entry.declaredValue ?? 0)
  }));

  const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
  if (!(totalAmount > 0)) {
    throw dfeIssuanceIncompleteData(
      'Valor total da NF-e é zero: nenhum item de carga tem declaredValue informado.',
      { itemCount: items.length }
    );
  }

  return {
    emit: { documentTag: emitDocType, documentDigits: emitDigits, name: emitName },
    dest: { documentTag: destDocType, documentDigits: destDigits, name: destName },
    items,
    totalAmount,
    originUf: aggregate.route?.originUf ?? null
  };
}

// =================================================================================================
// Chave de acesso SANDBOX (44 dígitos, layout SEFAZ) — SINTETIZADA, NUNCA emitida por uma SEFAZ
// real. Determinística a partir do `correlationMarker`: o mesmo marcador sempre produz a mesma
// chave (idempotência de retry, mesmo racional de `ciot-provider-gateway.ts#deriveMockCiotNumber`).
// =================================================================================================

/** Códigos de UF (2 dígitos) usados no layout da chave de acesso — IBGE, mesma tabela da SEFAZ. */
const UF_ACCESS_KEY_CODE: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52',
  MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22',
  RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17'
};

const DEFAULT_UF_ACCESS_KEY_CODE: string = UF_ACCESS_KEY_CODE.SP ?? '35';

function resolveUfAccessKeyCode(uf: string | null | undefined): string {
  if (!uf) return DEFAULT_UF_ACCESS_KEY_CODE;
  return UF_ACCESS_KEY_CODE[uf.toUpperCase()] ?? DEFAULT_UF_ACCESS_KEY_CODE;
}

/** `YYMM` (4 dígitos) da data de emissão, no fuso do processo — mesmo padrão de outros pontos do domínio. */
function formatYyMm(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/** Sequência determinística de dígitos a partir de um seed — nunca aleatória (retry produz a MESMA chave). */
function deriveDigits(seed: string, length: number): string {
  let out = '';
  let round = 0;
  while (out.length < length) {
    const hex = createHash('sha256').update(`${seed}:${round}`, 'utf8').digest('hex');
    // Cada 8 chars hex → um bloco de até 8 dígitos decimais (mod 10^8), concatenados até completar `length`.
    for (let i = 0; i < hex.length && out.length < length; i += 8) {
      const chunk = hex.slice(i, i + 8);
      const num = Number.parseInt(chunk, 16) % 100_000_000;
      out += String(num).padStart(8, '0');
    }
    round += 1;
  }
  return out.slice(0, length);
}

export type SandboxNfeAccessKeyInput = {
  originUf: string | null;
  emitDocumentDigits: string;
  correlationMarker: string;
  issuedAt: Date;
};

/**
 * Sintetiza uma chave de acesso de 44 dígitos VÁLIDA (dígito verificador correto, modelo `55`, CNPJ
 * do emitente embutido quando o emitente é CNPJ) — suficiente para `dfe-validator.ts#checkAccessKeyCoherence`
 * aprovar sem erro. NÃO É UMA CHAVE REAL: é sandbox, nunca emitida por uma SEFAZ.
 */
export function buildSandboxNfeAccessKey(input: SandboxNfeAccessKeyInput): string {
  const ufCode = resolveUfAccessKeyCode(input.originUf);
  const yymm = formatYyMm(input.issuedAt);
  const cnpj14 = input.emitDocumentDigits.padStart(14, '0').slice(-14);
  const model = '55';
  const serie = '001';
  const numero = deriveDigits(`${input.correlationMarker}:numero`, 9);
  const tpEmis = '1';
  const cNF = deriveDigits(`${input.correlationMarker}:cnf`, 8);

  const body43 = `${ufCode}${yymm}${cnpj14}${model}${serie}${numero}${tpEmis}${cNF}`;
  if (body43.length !== 43) {
    // Defensivo — provaria um erro de aritmética no layout acima, nunca deveria disparar em runtime.
    throw new Error(`[dfe-issuance-nfe-mapper] corpo da chave de acesso com tamanho inesperado: ${body43.length}`);
  }
  const dv = computeAccessKeyCheckDigit(body43);
  return `${body43}${dv}`;
}

// =================================================================================================
// Construtores PUROS do envelope XML — layout REAL da SEFAZ (o que `dfe-parser.ts` sabe ler)
// =================================================================================================

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => XML_ESCAPES[ch] ?? ch);
}

function money(value: number): string {
  return Number(value ?? 0).toFixed(2);
}

export type BuildNfeEnvelopeXmlInput = {
  accessKey: string;
  layoutVersion: string;
  issuedAtIso: string;
  natOp: string;
  emit: NfeIssuancePartyInput;
  dest: NfeIssuancePartyInput;
  items: NfeIssuanceItemInput[];
  totalAmount: number;
};

/**
 * Envelope `<NFe><infNFe>...</infNFe></NFe>` (SEM assinatura, SEM prólogo `<?xml?>` — embutível).
 * Único elemento raiz (`NFe`), estrutura que `lib/transport/dfe-parser.ts` interpreta sem alteração:
 * `infNFe/@Id` (chave), `ide/dhEmi`, `emit`/`dest` (`CNPJ`|`CPF` + `xNome`), `total/ICMSTot/vNF`.
 */
export function buildNfeEnvelopeXml(input: BuildNfeEnvelopeXmlInput): string {
  const detXml = input.items
    .map((item, index) => {
      const vProd = money(item.qty * item.price);
      return (
        `<det nItem="${index + 1}">`
        + `<prod><xProd>${esc(item.desc)}</xProd><qCom>${esc(money(item.qty))}</qCom>`
        + `<vUnCom>${esc(money(item.price))}</vUnCom><vProd>${esc(vProd)}</vProd></prod>`
        + `</det>`
      );
    })
    .join('');

  return (
    `<NFe>`
    + `<infNFe Id="NFe${esc(input.accessKey)}" versao="${esc(input.layoutVersion)}">`
    + `<ide><natOp>${esc(input.natOp)}</natOp><mod>55</mod><serie>1</serie><dhEmi>${esc(input.issuedAtIso)}</dhEmi><tpNF>1</tpNF></ide>`
    + `<emit><${input.emit.documentTag}>${esc(input.emit.documentDigits)}</${input.emit.documentTag}><xNome>${esc(input.emit.name)}</xNome></emit>`
    + `<dest><${input.dest.documentTag}>${esc(input.dest.documentDigits)}</${input.dest.documentTag}><xNome>${esc(input.dest.name)}</xNome></dest>`
    + detXml
    + `<total><ICMSTot><vNF>${esc(money(input.totalAmount))}</vNF></ICMSTot></total>`
    + `</infNFe>`
    + `</NFe>`
  );
}

/**
 * Anexa o marcador de assinatura sandbox como IRMÃO de `infNFe` dentro de `<NFe>` (layout real: a
 * assinatura NÃO fica dentro de `infNFe`) — mantém raiz ÚNICA, nunca dois elementos de topo. O
 * `digest` vem do `signXml` REAL do `@flavioneto11/fiscal-kit` (aplicado ao XML PRÓPRIO do kit,
 * capturado à parte — ver `dfe-issuance-gateway.ts`), tecido aqui só como evidência auditável.
 */
export function appendSandboxSignature(envelopeXml: string, digest: string): string {
  if (!envelopeXml.endsWith('</NFe>')) {
    throw new Error('[dfe-issuance-nfe-mapper] envelope inesperado — esperava terminar em </NFe>.');
  }
  const withoutRoot = envelopeXml.slice(0, -'</NFe>'.length);
  return `${withoutRoot}<Signature sandbox="true" digest="${esc(digest)}"/></NFe>`;
}

export type BuildAuthorizedNfeXmlInput = {
  signedEnvelopeXml: string;
  accessKey: string;
  protocol: string;
  authorizedAtIso: string;
  layoutVersion: string;
};

/**
 * Documento FINAL autorizado — `<nfeProc><NFe>...</NFe><protNFe><infProt>...</infProt></protNFe></nfeProc>`,
 * com prólogo `<?xml?>` (documento standalone, o que vai para `STORAGE_DIR` e para
 * `transport-fiscal-service.importarDocumentoFiscal`). `cStat=100`/`xMotivo` fixos (autorização
 * sandbox determinística — o `@flavioneto11/fiscal-kit` sandbox NUNCA rejeita, ver README do kit);
 * `nProt` é o protocolo REAL devolvido por `queryStatus` do kit.
 */
export function buildAuthorizedNfeXml(input: BuildAuthorizedNfeXmlInput): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>`
    + `<nfeProc versao="${esc(input.layoutVersion)}">`
    + input.signedEnvelopeXml
    + `<protNFe versao="${esc(input.layoutVersion)}">`
    + `<infProt>`
    + `<tpAmb>2</tpAmb>`
    + `<verAplic>SICAT-FISCAL-KIT-SANDBOX</verAplic>`
    + `<chNFe>${esc(input.accessKey)}</chNFe>`
    + `<dhRecbto>${esc(input.authorizedAtIso)}</dhRecbto>`
    + `<nProt>${esc(input.protocol)}</nProt>`
    + `<cStat>100</cStat>`
    + `<xMotivo>Autorizado o uso da NF-e (SANDBOX — fiscal-kit)</xMotivo>`
    + `</infProt>`
    + `</protNFe>`
    + `</nfeProc>`
  );
}
