import { AppError } from '../lib/problem.js';
import { config } from '../lib/config.js';
import { getJwtExpirationIso } from '../lib/jwt.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';

type LooseRecord = Record<string, unknown>;
type AccountType = 'generator' | 'carrier' | 'receiver';
type RequestJsonGateway = {
  requestJson(args: {
    method: string;
    path: string;
    auth?: boolean;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  }): Promise<{
    response?: {
      data?: LooseRecord;
    };
  }>;
};

let gatewayOverrideFactory: (() => RequestJsonGateway) | null = null;

export function setAuthGatewayOverrideForTests(factory: (() => RequestJsonGateway) | null): void {
  gatewayOverrideFactory = factory;
}

function getGateway() {
  if (gatewayOverrideFactory) {
    return gatewayOverrideFactory();
  }
  return createCetesbGateway();
}

function asRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toPrimitiveString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function toTrimmedString(value: unknown): string {
  return toPrimitiveString(value).trim();
}

function toDigitsOnly(value: unknown): string {
  return toPrimitiveString(value).replaceAll(/\D/g, '');
}

function toResponseItems(rawObjectResponse: unknown): LooseRecord[] {
  if (Array.isArray(rawObjectResponse)) {
    return rawObjectResponse.map((item) => asRecord(item));
  }

  if (rawObjectResponse && typeof rawObjectResponse === 'object') {
    return [asRecord(rawObjectResponse)];
  }

  return [];
}

function getMatchedPartnerItem(items: LooseRecord[], normalizedDocument: string): LooseRecord | null {
  if (!items.length) {
    return null;
  }

  const matched = items.find((item) => toDigitsOnly(item.parCnpj || item.fisCpf) === normalizedDocument);
  return matched || items[0] || null;
}

function getFirstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    const normalized = toTrimmedString(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function buildEmailRequiredError(context: LooseRecord = {}) {
  return new AppError(400, 'Bad Request', 'E-mail do usuário CETESB é obrigatório para este acesso. Informe o e-mail vinculado e tente novamente.', {
    code: 'EMAIL_REQUIRED',
    context
  });
}

function buildInvalidCredentialsError(context: LooseRecord = {}) {
  return new AppError(400, 'Bad Request', 'Credenciais inválidas. Verifique documento e senha.', {
    code: 'INVALID_CREDENTIALS',
    context
  });
}

function handleInvalidCredentials(providedEmail: string, context: LooseRecord = {}): never {
  if (!providedEmail) {
    throw buildEmailRequiredError(context);
  }

  throw buildInvalidCredentialsError(context);
}

function buildLoginBody(payload: LooseRecord, normalizedDocument: string, resolvedEmail: string, resolvedPartnerCode: number) {
  return {
    sistema: 0,
    login: normalizedDocument,
    senha: payload.password || payload.senha,
    email: resolvedEmail,
    parCodigo: resolvedPartnerCode,
    recaptcha: payload.recaptchaToken || payload.recaptcha || ''
  };
}

function buildLoginResponse(resposta: LooseRecord, normalizedDocument: string) {
  const token = toPrimitiveString(resposta.token);
  return {
    token,
    expiresAt: getJwtExpirationIso(token),
    user: {
      userId: resposta.paaCodigo,
      name: resposta.paaNome,
      email: resposta.email,
      document: toTrimmedString(resposta.jurCnp) || normalizedDocument
    },
    partner: {
      partnerCode: resposta.parCodigo,
      description: resposta.parDescricao,
      document: toTrimmedString(resposta.jurCnp) || toTrimmedString(resposta.cnpjParceiro),
      accountType: resolveAccountTypeFromResponse(resposta)
    }
  };
}

function handleAppErrorDuringLogin(error: AppError, providedEmail: string): never {
  const remoteStatus = getAppErrorRemoteStatus(error);
  const remoteMessage = getAppErrorRemoteBodyMessage(error);

  if (
    error.code === 'CETESB_HTTP_ERROR' &&
    remoteStatus === 404 &&
    /inv[aá]lid|usu[aá]rio|senha|credencial/i.test(remoteMessage)
  ) {
    handleInvalidCredentials(providedEmail, {
      remoteStatus: remoteStatus || null,
      remoteMessage: remoteMessage || null
    });
  }

  if (error.code === 'CETESB_AUTH_FAILED') {
    handleInvalidCredentials(providedEmail, { remoteStatus: remoteStatus || null });
  }

  throw error;
}

function getGatewayWithRequestJson(): RequestJsonGateway {
  return getGateway() as unknown as RequestJsonGateway;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return toPrimitiveString(error) || 'Erro desconhecido';
}

function getAppErrorRemoteStatus(error: AppError): number {
  const asObject = asRecord(error as unknown);
  const rawStatus = asObject.remoteStatus ?? error.statusCode ?? error.status;
  return Number(rawStatus || 0);
}

function getAppErrorRemoteBodyMessage(error: AppError): string {
  const asObject = asRecord(error as unknown);
  const remoteBody = asRecord(asObject.remoteBody);
  return toTrimmedString(remoteBody.mensagem);
}

function resolveAccountType(rawValue: unknown): AccountType | null {
  const normalized = toTrimmedString(rawValue).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['generator', 'gerador', 'g', '1'].includes(normalized)) {
    return 'generator';
  }

  if (['carrier', 'transportador', 't', '2'].includes(normalized)) {
    return 'carrier';
  }

  if (['receiver', 'destinador', 'd', '3'].includes(normalized)) {
    return 'receiver';
  }

  return null;
}

function isTruthyRoleFlag(value: unknown) {
  if (value === true || value === 1) {
    return true;
  }

  const normalized = toTrimmedString(value).toLowerCase();
  return ['true', '1', 's', 'sim', 'yes', 'y'].includes(normalized);
}

function resolveAccountTypeFromResponse(rawResponse: unknown = {}): AccountType | null {
  const response = asRecord(rawResponse);
  const booleanFlags: Array<[string, AccountType]> = [
    ['isTransportador', 'carrier'],
    ['isDestinador', 'receiver'],
    ['isGerador', 'generator'],
    ['transportador', 'carrier'],
    ['destinador', 'receiver'],
    ['gerador', 'generator']
  ];

  for (const [fieldName, type] of booleanFlags) {
    const value = response[fieldName];
    if (isTruthyRoleFlag(value)) {
      return type;
    }
  }

  const candidates = [
    response.accountType,
    response.parTipoConta,
    response.parTipo,
    response.parPerfil,
    response.decTipo,
    response.tipoConta,
    response.tipoParceiro
  ];

  for (const candidate of candidates) {
    const resolved = resolveAccountType(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function resolvePartnerLoginContext(normalizedDocument: string) {
  const gateway = getGatewayWithRequestJson();

  if (!normalizedDocument) {
    return { email: '', partnerCode: 0 };
  }

  try {
    const exchange = await gateway.requestJson({
      method: 'GET',
      path: `/api/mtr/consultaParceiro/J/${normalizedDocument}`,
      auth: false
    });

    const payload = asRecord(exchange?.response?.data);
    const rawItems = toResponseItems(payload.objetoResposta);

    if (!rawItems.length) {
      return { email: '', partnerCode: 0 };
    }

    const raw = getMatchedPartnerItem(rawItems, normalizedDocument) || {};

    return {
      email: getFirstNonEmptyString([raw.paaEmail, raw.paaEmail2, raw.email]),
      partnerCode: Number(raw.parCodigo || 0)
    };
  } catch {
    return { email: '', partnerCode: 0 };
  }
}

/**
 * Autentica usuário no portal CETESB
 * 
 * @param {object} payload - { document, password, recaptchaToken? }
 * @returns {Promise<object>} { token, expiresAt, user, partner }
 */

export async function login(payload: LooseRecord) {
  const gateway = getGatewayWithRequestJson();

  const document = payload.document || payload.login;
  const password = payload.password || payload.senha;
  const email = payload.email;
  const parCodigo = payload.parCodigo;
  const normalizedDocument = toDigitsOnly(document);

  if (!normalizedDocument || !password) {
    throw new AppError(400, 'Bad Request', 'Campos obrigatórios ausentes: document/login, password/senha.', {
      code: 'MISSING_CREDENTIALS'
    });
  }

  // reCAPTCHA pode ser null, undefined, vazio ou ausente - não é validado
  // Fazer chamada real à API CETESB
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: config.cetesbPortalOrigin,
    Referer: `${config.cetesbPortalOrigin}/login`,
    'User-Agent': config.cetesbUserAgent
  };

  const providedEmail = toTrimmedString(email);
  const providedPartnerCode = Number(parCodigo || 0);
  const partnerContext = providedPartnerCode ? { email: '', partnerCode: 0 } : await resolvePartnerLoginContext(normalizedDocument);
  const resolvedEmail = providedEmail;
  const resolvedPartnerCode = providedPartnerCode || partnerContext.partnerCode || 0;
  const body = buildLoginBody(payload, normalizedDocument, resolvedEmail, resolvedPartnerCode);

  try {
    const exchange = await gateway.requestJson({
      method: 'POST',
      path: '/api/mtr/carregaDadosLogin',
      headers,
      body
    });

    const data = asRecord(exchange?.response?.data);
    const mensagem = toTrimmedString(data.mensagem);

    if (data.erro) {
      const isInvalidCredentials = /inv[aá]lid|usu[aá]rio|senha|credencial/i.test(mensagem);
      if (isInvalidCredentials) {
        handleInvalidCredentials(providedEmail, { remoteMessage: mensagem });
      }

      throw new AppError(502, 'Bad Gateway', mensagem || 'Erro ao autenticar no portal CETESB.', {
        code: 'CETESB_AUTH_ERROR',
        context: {
          remoteError: data.erro,
          remotePayload: data
        }
      });
    }

    const resposta = asRecord(data.objetoResposta);
    if (!resposta.token) {
      throw new AppError(502, 'Bad Gateway', 'Token não retornado pela CETESB.', {
        code: 'MISSING_TOKEN'
      });
    }

    return buildLoginResponse(resposta, normalizedDocument);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      handleAppErrorDuringLogin(error, providedEmail);
    }

    throw new AppError(502, 'Bad Gateway', `Erro ao conectar ao portal CETESB: ${getErrorMessage(error)}`, {
      code: 'CETESB_CONNECTION_ERROR',
      context: { originalError: getErrorMessage(error) }
    });
  }
}

/**
 * Busca informações de parceiro por documento (CNPJ/CPF)
 * Endpoint público, não requer autenticação
 * 
 * @param {string} document - CNPJ ou CPF
 * @returns {Promise<object>} { partnerCode, description, registeredUsers }
 */
export async function getPartnerInfo(document: string) {
  const gateway = getGatewayWithRequestJson();

  if (!document) {
    throw new AppError(400, 'Bad Request', 'Parâmetro obrigatório ausente: document.', {
      code: 'MISSING_DOCUMENT'
    });
  }

  const normalizedDocument = toDigitsOnly(document);
  if (!normalizedDocument || ![11, 14].includes(normalizedDocument.length)) {
    throw new AppError(400, 'Bad Request', 'Parâmetro document inválido. Informe CPF (11) ou CNPJ (14) com dígitos válidos.', {
      code: 'INVALID_DOCUMENT',
      context: { document }
    });
  }

  const exchange = await gateway.requestJson({
    method: 'GET',
    path: `/api/mtr/consultaParceiro/J/${normalizedDocument}`,
    auth: false
  });

  const payload = asRecord(exchange?.response?.data);
  const rawItems = toResponseItems(payload.objetoResposta);

  if (!rawItems.length) {
    throw new AppError(404, 'Not Found', `Parceiro não encontrado para o documento ${document}.`, {
      code: 'PARTNER_NOT_FOUND',
      context: { document }
    });
  }

  const raw = getMatchedPartnerItem(rawItems, normalizedDocument) || {};

  const registeredUsers: Array<{
    accessCode: unknown;
    name: string | null;
    email: string | null;
    cpf: string | null;
  }> = [];
  const pushUser = (accessCode: unknown, name: unknown, emailValue: unknown, cpf: unknown) => {
    if (!name && !emailValue && !cpf && !accessCode) return;
    registeredUsers.push({
      accessCode: accessCode ?? null,
      name: toNullableString(name),
      email: toNullableString(emailValue),
      cpf: toNullableString(cpf)
    });
  };

  pushUser(raw.paaCodigo, raw.paaNome, raw.paaEmail, raw.paaCpf);
  pushUser(raw.paaCodigo2 || raw.paaCodigoSecundario, raw.paaNome2, raw.paaEmail2, raw.paaCpf2);

  return {
    partnerCode: raw.parCodigo ?? null,
    description: raw.parDescricao || null,
    tradeName: raw.parNomeFantasia || null,
    document: raw.parCnpj || raw.fisCpf || normalizedDocument,
    documentType: raw.parTipoPessoa || (normalizedDocument.length > 11 ? 'J' : 'F'),
    state: {
      code: raw.estCodigo ?? null,
      abbreviation: raw.estAbreviacao ?? raw.parUf ?? null
    },
    registeredUsers
  };
}
function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized || null;
}
