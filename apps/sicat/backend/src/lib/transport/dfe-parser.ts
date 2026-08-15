/**
 * Parser de XML de DF-e (NF-e/CT-e/MDF-e) — PR-E1, DL-103.
 *
 * PURO: nenhuma chamada a banco/HTTP/relógio. Recebe a string do XML (já lida do upload/request) e
 * devolve um `ParsedDfeDocument` tipado. Dependência de runtime NOVA e justificada:
 * `fast-xml-parser` (zero deps nativas, licença MIT) — o workspace não tinha nenhum parser XML
 * adequado (`packages/fiscal-kit` só CONSTRÓI XML simplificado próprio para emissão, nunca
 * interpreta o layout real da SEFAZ; ver `packages/fiscal-kit/src/nfe/build.js`). NUNCA usa
 * `eval`/regex-DOM-hack — `XMLValidator`/`XMLParser` fazem parsing estrutural de verdade.
 *
 * Detecta o tipo pela RAIZ do documento (`nfeProc`/`NFe`, `cteProc`/`CTe`, `mdfeProc`/`MDFe`) —
 * aceita tanto o XML "processado" (com o protocolo de autorização anexado pela SEFAZ,
 * `<nfeProc>`/`<cteProc>`/`<mdfeProc>`) quanto o XML "assinado" isolado (`<NFe>`/`<CTe>`/`<MDFe>`,
 * sem protocolo — `authorizationStatus` sai `unknown` nesse caso). Tolerante a namespaces
 * (`removeNSPrefix: true` — um XML com prefixo `<ns:NFe>` resolve igual a `<NFe>`).
 *
 * NÃO valida contra o XSD completo da SEFAZ (nenhum schema baixado/embutido) — ver
 * `dfe-validator.ts` para o que de fato é checado e por quê (limitação documentada, o schema
 * registry deste PR governa PERFIS de validação, não XSD).
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FiscalAuthorizationStatus, FiscalDocumentType } from './dfe-types.js';

export class DfeParseError extends Error {
  code: 'DFE_XML_INVALID' | 'DFE_UNSUPPORTED_ROOT';

  constructor(code: 'DFE_XML_INVALID' | 'DFE_UNSUPPORTED_ROOT', message: string) {
    super(message);
    this.name = 'DfeParseError';
    this.code = code;
  }
}

export interface DfeCiotEntry {
  ciotNumber: string;
  responsibleDocument: string | null;
}

export interface DfeTollInfo {
  hasValePedagio: boolean;
  categories: string[];
}

export interface DfeReferencedDocument {
  documentType: 'NFE' | 'CTE';
  accessKey: string;
}

export interface ParsedDfeMdfeDetails {
  ciots: DfeCiotEntry[];
  toll: DfeTollInfo;
  referencedDocuments: DfeReferencedDocument[];
  routeUfs: string[];
}

export interface ParsedDfeCteDetails {
  referencedDocuments: DfeReferencedDocument[];
}

export interface ParsedDfeParty {
  document: string | null;
  name: string | null;
}

export interface ParsedDfeDocument {
  documentType: FiscalDocumentType;
  accessKey: string;
  layoutVersion: string | null;
  authorizationStatus: FiscalAuthorizationStatus;
  protocol: string | null;
  issuedAt: string | null;
  issuer: ParsedDfeParty;
  recipient: ParsedDfeParty;
  totalAmount: number | null;
  mdfe?: ParsedDfeMdfeDetails;
  cte?: ParsedDfeCteDetails;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true
});

/** Sempre devolve array — normaliza a ambiguidade "1 ocorrência vira objeto" do fast-xml-parser. */
function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function toObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function toTrimmedStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function toAmountOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Documento (CNPJ/CPF) + nome de uma parte (`emit`/`dest`) — `null` quando o nó não existe. */
function extractParty(node: unknown): ParsedDfeParty {
  const obj = toObject(node);
  const document = toTrimmedStringOrNull(obj.CNPJ ?? obj.CPF);
  const name = toTrimmedStringOrNull(obj.xNome);
  return { document, name };
}

type RootMatch = { documentType: FiscalDocumentType; docNode: Record<string, any>; protNode: Record<string, any> | null };

/** Detecta o tipo pela raiz e devolve o nó do documento + o nó de protocolo (quando processado). */
function detectRoot(parsed: Record<string, any>): RootMatch | null {
  if (parsed.nfeProc) {
    const proc = toObject(parsed.nfeProc);
    return { documentType: 'NFE', docNode: toObject(proc.NFe), protNode: proc.protNFe ? toObject(proc.protNFe) : null };
  }
  if (parsed.NFe) {
    return { documentType: 'NFE', docNode: toObject(parsed.NFe), protNode: null };
  }
  if (parsed.cteProc) {
    const proc = toObject(parsed.cteProc);
    return { documentType: 'CTE', docNode: toObject(proc.CTe), protNode: proc.protCTe ? toObject(proc.protCTe) : null };
  }
  if (parsed.CTe) {
    return { documentType: 'CTE', docNode: toObject(parsed.CTe), protNode: null };
  }
  if (parsed.mdfeProc) {
    const proc = toObject(parsed.mdfeProc);
    return { documentType: 'MDFE', docNode: toObject(proc.MDFe), protNode: proc.protMDFe ? toObject(proc.protMDFe) : null };
  }
  if (parsed.MDFe) {
    return { documentType: 'MDFE', docNode: toObject(parsed.MDFe), protNode: null };
  }
  return null;
}

const ACCESS_KEY_PREFIXES: Record<FiscalDocumentType, string> = { NFE: 'NFe', CTE: 'CTe', MDFE: 'MDFe' };
const INF_TAG: Record<FiscalDocumentType, string> = { NFE: 'infNFe', CTE: 'infCte', MDFE: 'infMDFe' };

/** `Id="NFe352608..."` → `"352608..."` (strip do prefixo do tipo). Tolerante a prefixo ausente. */
function stripAccessKeyPrefix(rawId: string, documentType: FiscalDocumentType): string {
  const prefix = ACCESS_KEY_PREFIXES[documentType];
  return rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
}

/** `cStat` do protocolo → `authorizationStatus` (regra fixada no PR-E1: 100 autorizado; 101/135 cancelado; demais "denegado" no texto do motivo → denied; ausente/outro → unknown). */
function resolveAuthorizationStatus(protInfo: Record<string, any> | null): { status: FiscalAuthorizationStatus; protocol: string | null } {
  if (!protInfo) return { status: 'unknown', protocol: null };
  const cStat = toTrimmedStringOrNull(protInfo.cStat);
  const xMotivo = toTrimmedStringOrNull(protInfo.xMotivo) ?? '';
  const protocol = toTrimmedStringOrNull(protInfo.nProt);

  if (cStat === '100') return { status: 'authorized', protocol };
  if (cStat === '101' || cStat === '135') return { status: 'cancelled', protocol };
  if (cStat != null && /denegad/i.test(xMotivo)) return { status: 'denied', protocol };
  return { status: 'unknown', protocol };
}

function extractMdfeDetails(infMDFe: Record<string, any>): ParsedDfeMdfeDetails {
  const rodo = toObject(toObject(infMDFe.infModal).rodo);
  const infANTT = toObject(rodo.infANTT);

  const ciots: DfeCiotEntry[] = toArray(infANTT.infCIOT)
    .map((entry) => {
      const obj = toObject(entry);
      const ciotNumber = toTrimmedStringOrNull(obj.CIOT);
      const responsibleDocument = toTrimmedStringOrNull(obj.CNPJ ?? obj.CPF);
      return ciotNumber ? { ciotNumber, responsibleDocument } : null;
    })
    .filter((entry): entry is DfeCiotEntry => entry !== null);

  const dispList = toArray(toObject(infANTT.valePed).disp);
  const toll: DfeTollInfo = {
    hasValePedagio: dispList.length > 0,
    categories: dispList
      .map((entry) => toTrimmedStringOrNull(toObject(entry).tpCategVeic))
      .filter((value): value is string => value !== null)
  };

  const infDoc = toObject(infMDFe.infDoc);
  const referencedDocuments: DfeReferencedDocument[] = [];
  for (const mun of toArray(infDoc.infMunDescarga)) {
    const munObj = toObject(mun);
    for (const cte of toArray(munObj.infCTe)) {
      const key = toTrimmedStringOrNull(toObject(cte).chCTe);
      if (key) referencedDocuments.push({ documentType: 'CTE', accessKey: key });
    }
    for (const nfe of toArray(munObj.infNFe)) {
      const key = toTrimmedStringOrNull(toObject(nfe).chNFe);
      if (key) referencedDocuments.push({ documentType: 'NFE', accessKey: key });
    }
  }

  const ide = toObject(infMDFe.ide);
  const routeUfs: string[] = [];
  const ufIni = toTrimmedStringOrNull(ide.UFIni);
  if (ufIni) routeUfs.push(ufIni);
  for (const perc of toArray(infMDFe.infPercurso)) {
    const ufPer = toTrimmedStringOrNull(toObject(perc).UFPer);
    if (ufPer) routeUfs.push(ufPer);
  }
  const ufFim = toTrimmedStringOrNull(ide.UFFim);
  if (ufFim) routeUfs.push(ufFim);

  return { ciots, toll, referencedDocuments, routeUfs };
}

function extractCteDetails(infCte: Record<string, any>): ParsedDfeCteDetails {
  const infCTeNorm = toObject(infCte.infCTeNorm);
  const infDoc = toObject(infCTeNorm.infDoc);
  const referencedDocuments: DfeReferencedDocument[] = toArray(infDoc.infNFe)
    .map((entry) => toTrimmedStringOrNull(toObject(entry).chave))
    .filter((value): value is string => value !== null)
    .map((accessKey) => ({ documentType: 'NFE' as const, accessKey }));

  return { referencedDocuments };
}

/**
 * Interpreta uma string XML de NF-e/CT-e/MDF-e. Lança `DfeParseError` (`DFE_XML_INVALID` para XML
 * malformado, `DFE_UNSUPPORTED_ROOT` para XML bem-formado mas de uma raiz não reconhecida).
 */
export function parseDfeXml(xmlString: string): ParsedDfeDocument {
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new DfeParseError('DFE_XML_INVALID', 'xmlContent vazio ou não é uma string.');
  }

  const validation = XMLValidator.validate(xmlString);
  if (validation !== true) {
    const reason = typeof validation === 'object' && validation.err ? validation.err.msg : 'XML malformado';
    throw new DfeParseError('DFE_XML_INVALID', `XML malformado: ${reason}.`);
  }

  let parsed: Record<string, any>;
  try {
    parsed = parser.parse(xmlString);
  } catch (error: unknown) {
    throw new DfeParseError(
      'DFE_XML_INVALID',
      `Falha ao interpretar o XML: ${error instanceof Error ? error.message : String(error)}.`
    );
  }

  const match = detectRoot(toObject(parsed));
  if (!match) {
    throw new DfeParseError(
      'DFE_UNSUPPORTED_ROOT',
      'Raiz do XML não reconhecida — esperado nfeProc/NFe, cteProc/CTe ou mdfeProc/MDFe.'
    );
  }

  const { documentType, docNode, protNode } = match;
  const infTag = INF_TAG[documentType];
  const infNode = toObject(docNode[infTag]);
  if (Object.keys(infNode).length === 0) {
    throw new DfeParseError('DFE_UNSUPPORTED_ROOT', `Documento ${documentType} sem nó ${infTag}.`);
  }

  const rawId = toTrimmedStringOrNull(infNode['@_Id']);
  if (!rawId) {
    throw new DfeParseError('DFE_XML_INVALID', `${infTag} sem atributo Id (chave de acesso).`);
  }
  const accessKey = stripAccessKeyPrefix(rawId, documentType);

  const layoutVersion = toTrimmedStringOrNull(infNode['@_versao']);
  const protInfo = protNode ? toObject(protNode.infProt) : null;
  const { status: authorizationStatus, protocol } = resolveAuthorizationStatus(
    protInfo && Object.keys(protInfo).length > 0 ? protInfo : null
  );

  const ide = toObject(infNode.ide);
  const issuedAt = toTrimmedStringOrNull(ide.dhEmi ?? ide.dhIniViagem);
  const issuer = extractParty(infNode.emit);
  const recipient = documentType === 'MDFE' ? { document: null, name: null } : extractParty(infNode.dest);

  let totalAmount: number | null = null;
  if (documentType === 'NFE') {
    totalAmount = toAmountOrNull(toObject(toObject(infNode.total).ICMSTot).vNF);
  } else if (documentType === 'CTE') {
    totalAmount = toAmountOrNull(toObject(infNode.vPrest).vTPrest);
  }

  const result: ParsedDfeDocument = {
    documentType,
    accessKey,
    layoutVersion,
    authorizationStatus,
    protocol,
    issuedAt,
    issuer,
    recipient,
    totalAmount
  };

  if (documentType === 'MDFE') result.mdfe = extractMdfeDetails(infNode);
  if (documentType === 'CTE') result.cte = extractCteDetails(infNode);

  return result;
}
