import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_HAR_FILES = {
  login: 'mtr.cetesb.sp.gov.br_login.har',
  submit: 'mtr.cetesb.sp.gov.br_gerar_mtr.har',
  print: 'mtr.cetesb.sp.gov.br_imprimir_mtr.har',
  cancel: 'mtr.cetesb.sp.gov.br_cancelar_mtr.har',
  cadastro: 'mtr.cetesb.sp.gov.br_criar_cadastro.har'
};

export const HAR_OPERATION_PROFILES = {
  login: {
    harFile: REQUIRED_HAR_FILES.login,
    method: 'POST',
    urlIncludes: '/api/mtr/carregaDadosLogin',
    requestKeys: ['sistema', 'login', 'email', 'senha', 'parCodigo', 'recaptcha'],
    responseRootKeys: ['mensagem', 'objetoResposta', 'erro'],
    responseObjectKeys: ['token', 'parCodigo', 'paaCodigo']
  },
  manifestSubmit: {
    harFile: REQUIRED_HAR_FILES.submit,
    method: 'PUT',
    urlIncludes: '/api/mtr/manifesto',
    requestKeys: ['manResponsavel', 'manDataExpedicao', 'tipoManifesto', 'listaManifestoResiduo', 'recaptcha'],
    responseRootKeys: ['mensagem', 'objetoResposta', 'erro'],
    responseMessageRequired: true
  },
  manifestPrint: {
    harFile: REQUIRED_HAR_FILES.print,
    method: 'GET',
    urlIncludes: '/api/mtr/imprimir/imprimeManifesto/',
    expectedStatus: 200,
    expectedMimeType: 'application/pdf'
  },
  manifestCancel: {
    harFile: REQUIRED_HAR_FILES.cancel,
    method: 'POST',
    urlIncludes: '/api/mtr/manifesto/cancelaManifesto',
    requestKeys: ['manCodigo', 'manNumero', 'manJustificativaCancelamento'],
    responseRootKeys: ['mensagem', 'objetoResposta', 'erro'],
    responseMessageRequired: true
  },
  cadastroSubmit: {
    harFile: REQUIRED_HAR_FILES.cadastro,
    method: 'POST',
    urlIncludes: '/api/cadastro/salvarAcesso',
    requestKeys: ['parDescricao', 'parTipoPessoa', 'listaParceiroTipoParceiro', 'estado', 'cidade'],
    responseRootKeys: ['mensagem', 'objetoResposta', 'erro'],
    responseMessageRequired: true
  }
};

export const GATEWAY_REQUIRED_PATTERNS = {
  login: [
    "path: '/api/mtr/carregaDadosLogin'",
    'sistema: system',
    'senha: password',
    'recaptcha'
  ],
  manifestSubmit: [
    "path: '/api/mtr/manifesto'",
    'function mapManifestToCetesb',
    'manResponsavel',
    'listaManifestoResiduo',
    'manJustificativaCancelamento'
  ],
  manifestPrint: [
    '/api/mtr/imprimir/imprimeManifesto/',
    'requestBuffer({ method: \'GET\''
  ],
  manifestCancel: [
    "path: '/api/mtr/manifesto/cancelaManifesto'",
    'validateCancelReason(reason)',
    'manJustificativaCancelamento: reason'
  ],
  cadastroSubmit: [
    "path: '/api/cadastro/salvarAcesso'",
    'function mapCadastroToCetesb'
  ],
  manifestSearchAuxiliary: [
    '/api/mtr/pesquisaManifesto/',
    '/api/mtr/pesquisaParceiro/',
    '/api/mtr/pesquisaParceiroByCodigo/',
    '/api/mtr/manifesto/listaResponsavelRecebimento/'
  ]
};

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJsonOrNull(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJson(absPath) {
  ensure(fs.existsSync(absPath), `Arquivo obrigatório ausente: ${absPath}`);
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function resolveHarPath(rootDir, harFile) {
  return path.resolve(rootDir, 'docs/cetesb', harFile);
}

function findHarEntry(entries, profile) {
  return entries.find((entry) => {
    const method = String(entry?.request?.method || '').toUpperCase();
    const url = String(entry?.request?.url || '');
    return method === profile.method && url.includes(profile.urlIncludes);
  });
}

function assertObjectKeys(obj, keys, contextLabel) {
  for (const key of keys || []) {
    ensure(obj && Object.hasOwn(obj, key), `${contextLabel}: chave obrigatória ausente '${key}'`);
  }
}

export function validateHarEntryShape(entry, profile, operationName) {
  ensure(entry, `Entrada HAR não encontrada para operação '${operationName}'`);

  const requestBodyText = entry?.request?.postData?.text || '';
  const responseBodyText = entry?.response?.content?.text || '';
  const requestBody = parseJsonOrNull(requestBodyText);
  const responseBody = parseJsonOrNull(responseBodyText);

  if (profile.requestKeys?.length) {
    assertObjectKeys(requestBody, profile.requestKeys, `${operationName}.request`);
  }

  if (profile.responseRootKeys?.length) {
    assertObjectKeys(responseBody, profile.responseRootKeys, `${operationName}.response`);
  }

  if (profile.responseObjectKeys?.length) {
    assertObjectKeys(responseBody?.objetoResposta, profile.responseObjectKeys, `${operationName}.response.objetoResposta`);
  }

  if (profile.responseMessageRequired) {
    ensure(
      typeof responseBody?.mensagem === 'string' && responseBody.mensagem.trim().length > 0,
      `${operationName}.response: campo 'mensagem' deve ser string não vazia`
    );
  }

  if (profile.expectedStatus != null) {
    ensure(entry?.response?.status === profile.expectedStatus, `${operationName}: status esperado ${profile.expectedStatus}, obtido ${entry?.response?.status}`);
  }

  if (profile.expectedMimeType) {
    ensure(
      String(entry?.response?.content?.mimeType || '').toLowerCase().includes(profile.expectedMimeType.toLowerCase()),
      `${operationName}: mimeType esperado '${profile.expectedMimeType}', obtido '${entry?.response?.content?.mimeType || 'n/a'}'`
    );
  }
}

export function validateHarEvidenceStructure(rootDir = process.cwd()) {
  const validatedOperations = [];

  for (const [operationName, profile] of Object.entries(HAR_OPERATION_PROFILES)) {
    const harPath = resolveHarPath(rootDir, profile.harFile);
    const harJson = readJson(harPath);
    const entries = harJson?.log?.entries || [];
    const entry = findHarEntry(entries, profile);
    validateHarEntryShape(entry, profile, operationName);
    validatedOperations.push({
      operationName,
      harFile: profile.harFile,
      method: profile.method,
      urlIncludes: profile.urlIncludes
    });
  }

  return {
    validatedOperations,
    totalValidated: validatedOperations.length
  };
}

export function validateGatewayStructure(rootDir = process.cwd()) {
  const gatewayPath = path.resolve(rootDir, 'src/gateways/cetesb-gateway.js');
  ensure(fs.existsSync(gatewayPath), `Gateway não encontrado: ${gatewayPath}`);
  const gatewayContent = fs.readFileSync(gatewayPath, 'utf8');

  const validatedSections = [];
  for (const [section, patterns] of Object.entries(GATEWAY_REQUIRED_PATTERNS)) {
    for (const pattern of patterns) {
      ensure(
        gatewayContent.includes(pattern),
        `Gateway sem padrão obrigatório para '${section}': ${pattern}`
      );
    }
    validatedSections.push({ section, patternsChecked: patterns.length });
  }

  return {
    gatewayPath,
    validatedSections,
    totalSections: validatedSections.length
  };
}

export function validateHarGatewayStructure(rootDir = process.cwd()) {
  const har = validateHarEvidenceStructure(rootDir);
  const gateway = validateGatewayStructure(rootDir);
  return {
    har,
    gateway,
    totalChecks: har.totalValidated + gateway.totalSections
  };
}
