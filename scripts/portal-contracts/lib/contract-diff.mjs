// contract-diff.mjs — lógica PURA de comparação contrato-de-portal × mapa-do-consumidor.
//
// Sem I/O (testável com node:test, padrão do store.js do ai-control-plane). O comparador
// (compare-sicat-cetesb.mjs) faz a leitura dos arquivos e chama diffContractAgainstConsumer.
//
// Modelo "teste de contrato": cada endpoint do contrato (a verdade do portal real) é um caso;
// o mapa do consumidor declara como o app (ex.: o gateway do SICAT) acessa cada endpoint hoje;
// o diff produz achados por severidade. Genérico: serve para qualquer portal/consumidor.

export const SEVERITIES = ['info', 'warning', 'high', 'error', 'critical'];

const SEVERITY_RANK = Object.freeze({ info: 0, warning: 1, high: 2, error: 3, critical: 4 });

export function severityAtLeast(severity, threshold) {
  return (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[threshold] ?? 0);
}

function normMethod(m) {
  return String(m || '').trim().toUpperCase();
}

/** Conjunto de campos required do request schema (presentes e não-optional). */
function requiredRequestFields(endpoint) {
  const schema = endpoint?.request?.schema;
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema.required)) return schema.required.slice();
  // fallback: properties não marcadas optional
  const props = schema.properties || {};
  return Object.keys(props).filter((k) => props[k] && props[k].optional !== true);
}

function allRequestFields(endpoint) {
  const props = endpoint?.request?.schema?.properties;
  return props ? Object.keys(props) : [];
}

/** True quando o endpoint foi inferido de poucas amostras (baixa confiança). */
function isLowConfidence(endpoint, threshold = 3) {
  const n = endpoint?.observability?.sample_count;
  return Number.isInteger(n) && n < threshold;
}

/**
 * Compara um contrato (lista de endpoints) com o mapa de um consumidor.
 *   contractEndpoints: [{ id, method, path_template, auth:{token_header_mode}, request:{schema}, observability }]
 *   consumerMap:       [{ contract_id, gateway_method, method, path_template, auth:{token_header_mode}, request_fields }]
 * Retorna { findings: [{severity, code, contractId, message, recommendation}], summary }.
 */
export function diffContractAgainstConsumer(contractEndpoints, consumerMap, opts = {}) {
  const lowConfThreshold = opts.lowConfidenceThreshold ?? 3;
  const byId = new Map(contractEndpoints.map((e) => [e.id, e]));
  const mapById = new Map(consumerMap.map((m) => [m.contract_id, m]));
  const findings = [];
  const add = (severity, code, contractId, message, recommendation) =>
    findings.push({ severity, code, contractId, message, recommendation: recommendation || null });

  // 1) Endpoints que o consumidor declara mas não existem no contrato real.
  for (const m of consumerMap) {
    if (!byId.has(m.contract_id)) {
      add('error', 'CONSUMER_ENDPOINT_NOT_IN_CONTRACT', m.contract_id,
        `O consumidor (${m.gateway_method || '?'}) usa "${m.contract_id}", ausente no contrato capturado.`,
        'Confirmar se o endpoint ainda existe na CETESB; capturar uma amostra real ou remover do gateway.');
    }
  }

  // 2) Por endpoint do contrato: casar com o mapa e comparar.
  for (const endpoint of contractEndpoints) {
    const m = mapById.get(endpoint.id);
    if (!m) {
      add('info', 'CONTRACT_ENDPOINT_NOT_USED', endpoint.id,
        `A CETESB expõe "${endpoint.id}" (${normMethod(endpoint.method)} ${endpoint.path_template}) mas o consumidor não o declara.`,
        'Avaliar se o SICAT deveria usar este endpoint.');
      continue;
    }

    const lowConf = isLowConfidence(endpoint, lowConfThreshold);
    const downgrade = (sev) => (lowConf && SEVERITY_RANK[sev] >= SEVERITY_RANK.high ? 'warning' : sev);

    // método
    if (normMethod(endpoint.method) !== normMethod(m.method)) {
      add('critical', 'METHOD_MISMATCH', endpoint.id,
        `método diverge: contrato=${normMethod(endpoint.method)} consumidor=${normMethod(m.method)}.`,
        `Alinhar o método em ${m.gateway_method || 'gateway'} para ${normMethod(endpoint.method)}.`);
    }
    // path
    if (String(endpoint.path_template) !== String(m.path_template)) {
      add('critical', 'PATH_MISMATCH', endpoint.id,
        `path diverge: contrato="${endpoint.path_template}" consumidor="${m.path_template}".`,
        `Alinhar o path em ${m.gateway_method || 'gateway'} para "${endpoint.path_template}".`);
    }
    // token header mode
    const cMode = endpoint?.auth?.token_header_mode;
    const sMode = m?.auth?.token_header_mode;
    if (cMode && sMode && cMode !== sMode) {
      add(downgrade('high'), 'TOKEN_HEADER_MODE_MISMATCH', endpoint.id,
        `token_header_mode diverge: contrato=${cMode} consumidor=${sMode}.`,
        `Ajustar o envio do token (CETESB_TOKEN_HEADER_MODE / headers) de ${sMode} para ${cMode}.`);
    }
    // campos required do request ausentes no consumidor
    const consumerFields = Array.isArray(m.request_fields) ? m.request_fields : [];
    if (consumerFields.length || requiredRequestFields(endpoint).length) {
      const reqFields = requiredRequestFields(endpoint);
      for (const f of reqFields) {
        if (!consumerFields.includes(f)) {
          add(downgrade('high'), 'REQUIRED_FIELD_MISSING_IN_CONSUMER', endpoint.id,
            `campo obrigatório "${f}" do request não é enviado pelo consumidor.`,
            `Garantir que ${m.gateway_method || 'gateway'} envie "${f}".`);
        }
      }
      // campos extras que o consumidor envia e nunca foram observados
      const known = new Set(allRequestFields(endpoint));
      for (const f of consumerFields) {
        if (known.size && !known.has(f)) {
          add('warning', 'EXTRA_FIELD_IN_CONSUMER', endpoint.id,
            `consumidor envia "${f}", nunca observado na captura real.`,
            'Verificar se o campo ainda é aceito pela CETESB.');
        }
      }
    }
    if (lowConf) {
      add('info', 'LOW_CONFIDENCE_BASELINE', endpoint.id,
        `endpoint inferido de ${endpoint?.observability?.sample_count} amostra(s); achados de alta severidade foram rebaixados.`,
        'Capturar mais amostras reais para elevar a confiança.');
    }
  }

  const summary = SEVERITIES.reduce((acc, s) => { acc[s] = findings.filter((f) => f.severity === s).length; return acc; }, {});
  summary.total = findings.length;
  return { findings, summary };
}

/** True se algum achado atinge o limiar de severidade (para o gate). */
export function hasFindingAtLeast(findings, threshold) {
  return findings.some((f) => severityAtLeast(f.severity, threshold));
}
