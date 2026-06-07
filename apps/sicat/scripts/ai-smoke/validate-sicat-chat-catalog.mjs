import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_CATEGORIES = [
  'ajuda_navegacao',
  'manifestos_consulta',
  'manifestos_acao',
  'manifestos_composto',
  'cdf_consulta',
  'cdf_geracao',
  'dmr',
  'mtr_provisorio',
  'parceiros',
  'catalogos',
  'jobs_fila',
  'auditoria',
  'saude_cetesb',
  'dashboard_relatorios',
  'admin_permissoes',
  'atuacao_real',
  'confirmacao_obrigatoria',
  'diagnostico_complexo',
  'explicacao_simples',
  'automacao_assistida',
  'estrategia_gerencial',
  'simulacao_planejamento',
  'dados_mais_acao',
  'orquestrador_futuro'
];

const DISALLOWED_SCENARIO_TERMS = [
  'rule-based',
  'provider-adapter',
  'deterministic',
  'keyword',
  'static',
  'fallback fake',
  'mock',
  'stub',
  'unknown-llm'
];

const SENSITIVE_EXECUTION_POLICIES = new Set([
  'must_preview_safe_actions_and_require_confirmation_for_mutations',
  'must_preview_and_require_explicit_confirmation'
]);

const INTENT_TYPES_REQUIRING_CONFIRMATION = new Set([
  'mutation_or_preview',
  'mutation_requires_confirmation',
  'orchestration_mixed'
]);

const RUNNER_REQUIRED_FIELDS = [
  'id',
  'category',
  'prompt',
  'intent_type',
  'execution_policy',
  'expected_response',
  'must_contain_any',
  'must_not_contain',
  'minimum_score'
];

const FILES = {
  full: 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
  sample: 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl'
};

const ANTI_HEURISTIC_CHECKS = [
  {
    key: 'disallowedProvidersListInRunner',
    filePath: 'scripts/ai-smoke/run-sicat-ai-smoke.mjs',
    mustContainAll: [
      "'rule-based'",
      "'provider-adapter'",
      "'deterministic'",
      "'keyword'",
      "'static'",
      "'fallback'",
      "'mock'",
      "'stub'",
      "'unknown-llm'"
    ],
    description: 'Runner lista providers invalidos.'
  },
  {
    key: 'providerUnavailableNotRespondedInRunner',
    filePath: 'scripts/ai-smoke/run-sicat-ai-smoke.mjs',
    mustContainAll: [
      "status === 'responded' && providerUnavailable",
      "RESPONDED_PROVIDER_UNAVAILABLE"
    ],
    description: 'Runner reprova responded com provider unavailable.'
  },
  {
    key: 'fallbackTrueFailsSmoke',
    filePath: 'scripts/ai-smoke/run-sicat-ai-smoke.mjs',
    mustContainAll: [
      'const fallback = backendResponse?.result?.fallback === true;',
      'FALLBACK_NOT_ALLOWED'
    ],
    description: 'Runner reprova fallback=true fora de cenario explicitamente permitido.'
  },
  {
    key: 'explicitToolRequestGuardInService',
    filePath: 'src/services/conversation/conversation-service.ts',
    mustContainAll: [
      "provider === 'explicit-tool-request' && !explicitToolRequest",
      'return true;'
    ],
    description: 'Servico so aceita explicit-tool-request com body.toolRequest.'
  },
  {
    key: 'providerUnavailableReturnsFailed',
    filePath: 'src/services/conversation/conversation-service.ts',
    mustContainAll: [
      "provider: 'provider-unavailable'",
      "status: 'failed'",
      "actionStatus: 'failed'"
    ],
    description: 'Servico marca provider unavailable como failed, nao responded.'
  },
  {
    key: 'noStaticGuidedReplyRules',
    filePath: 'src/services/conversation/conversation-service.ts',
    mustNotContainAny: [
      'STATIC_GUIDED_REPLY_RULES',
      'buildGuidedConsultativeReply',
      'enhanceAssistantResponseText'
    ],
    description: 'Nao ha regra estatica de resposta guiada no servico.'
  }
];

function toStamp(date = new Date()) {
  return date.toISOString().replaceAll(/[:.]/g, '-');
}

function ensureArtifactsDir() {
  const outDir = path.resolve('artifacts/ai-smoke');
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function readFileText(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

function toArrayOfNonEmptyStrings(value) {
  if (!Array.isArray(value)) return null;
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (!trimmed) return null;
    normalized.push(trimmed);
  }
  return normalized;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidMinimumScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasConfirmationPolicy(scenario) {
  return SENSITIVE_EXECUTION_POLICIES.has(String(scenario.execution_policy || '').trim())
    || INTENT_TYPES_REQUIRING_CONFIRMATION.has(String(scenario.intent_type || '').trim())
    || String(scenario.risk_level || '').trim().toLowerCase() === 'high';
}

function requiresConfirmationSignals(scenario) {
  if (hasConfirmationPolicy(scenario)) return true;
  return false;
}

function expectedResponseContainsSensitiveGuardrails(scenario) {
  const text = String(scenario.expected_response || '').toLowerCase();
  return text.includes('confirm') || text.includes('previa') || text.includes('simul');
}

function isConsultiveScenario(scenario) {
  return String(scenario.execution_policy || '').trim() === 'consultative_safe';
}

function isSensitiveScenario(scenario) {
  return hasConfirmationPolicy(scenario);
}

function isDiagnosticScenario(scenario) {
  const combined = `${scenario.category || ''} ${scenario.prompt || ''} ${scenario.expected_response || ''}`.toLowerCase();
  return combined.includes('diagnostic') || combined.includes('diagnostico') || combined.includes('motivo') || combined.includes('causa');
}

function isReportScenario(scenario) {
  const combined = `${scenario.prompt || ''} ${scenario.expected_response || ''}`.toLowerCase();
  return combined.includes('relatorio') || combined.includes('resumo');
}

function isComposedScenario(scenario) {
  return String(scenario.intent_type || '').trim() === 'orchestration_mixed'
    || String(scenario.category || '').trim() === 'manifestos_composto';
}

function parseJsonlCatalog(filePath) {
  const resolvedPath = path.resolve(filePath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const issues = [];
  const scenarios = [];
  const blankLineNumbers = [];
  const parsedIds = new Map();

  let lastContentLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) lastContentLine = index + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      if (lineNumber < lastContentLine) {
        blankLineNumbers.push(lineNumber);
      }
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      issues.push({
        severity: 'error',
        filePath,
        line: lineNumber,
        code: 'INVALID_JSONL_LINE',
        message: `Linha nao contem JSON valido: ${error.message}`
      });
      continue;
    }

    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (id) {
      if (parsedIds.has(id)) {
        issues.push({
          severity: 'error',
          filePath,
          line: lineNumber,
          code: 'DUPLICATE_ID',
          message: `ID duplicado: ${id}`
        });
      } else {
        parsedIds.set(id, lineNumber);
      }
    }

    scenarios.push({ lineNumber, rawLine: trimmed, data: parsed });
  }

  if (blankLineNumbers.length > 0) {
    issues.push({
      severity: 'error',
      filePath,
      code: 'BLANK_LINE_INSIDE_FILE',
      message: `Linhas vazias invalidas encontradas: ${blankLineNumbers.join(', ')}`
    });
  }

  return { filePath, issues, scenarios, blankLineNumbers };
}

function validateScenarioShape(filePath, entry) {
  const { lineNumber, data } = entry;
  const issues = [];
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const category = typeof data.category === 'string' ? data.category.trim() : '';
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  const expectedResponse = typeof data.expected_response === 'string' ? data.expected_response.trim() : '';
  const executionPolicy = typeof data.execution_policy === 'string' ? data.execution_policy.trim() : '';
  const intentType = typeof data.intent_type === 'string' ? data.intent_type.trim() : '';
  const mustContainAny = toArrayOfNonEmptyStrings(data.must_contain_any);
  const mustNotContain = toArrayOfNonEmptyStrings(data.must_not_contain);

  if (!id) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'EMPTY_ID', message: 'ID ausente ou vazio.' });
  }
  if (id && !/^SICAT-CHAT-\d{4}-.+$/u.test(id)) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'UNSTABLE_ID_FORMAT', message: `ID fora do padrao estavel esperado: ${id}` });
  }
  if (!category) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'EMPTY_CATEGORY', message: 'category ausente ou vazio.' });
  }
  if (!prompt) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'EMPTY_PROMPT', message: 'prompt ausente ou vazio.' });
  }
  if (!expectedResponse) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'EMPTY_EXPECTED_RESPONSE', message: 'expected_response ausente ou vazio.' });
  }
  if (!isValidMinimumScore(data.minimum_score)) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'INVALID_MINIMUM_SCORE', message: 'minimum_score ausente ou invalido.' });
  }
  if (!executionPolicy) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'MISSING_EXECUTION_POLICY', message: 'execution_policy ausente.' });
  }
  if (!intentType) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'MISSING_INTENT_TYPE', message: 'intent_type ausente.' });
  }
  if (mustContainAny === null) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'INVALID_MUST_CONTAIN_ANY', message: 'must_contain_any deve ser array de strings nao vazias.' });
  }
  if (mustNotContain === null) {
    issues.push({ severity: 'error', filePath, line: lineNumber, code: 'INVALID_MUST_NOT_CONTAIN', message: 'must_not_contain deve ser array de strings nao vazias.' });
  }

  const combinedScenarioText = [prompt, expectedResponse, ...(mustContainAny || []), ...(mustNotContain || [])]
    .join(' ')
    .toLowerCase();

  for (const term of DISALLOWED_SCENARIO_TERMS) {
    if (combinedScenarioText.includes(term)) {
      issues.push({
        severity: 'error',
        filePath,
        line: lineNumber,
        code: 'DISALLOWED_PROVIDER_TERM_IN_SCENARIO',
        message: `Cenario menciona termo proibido para aceitacao heuristica: ${term}`
      });
    }
  }

  if (requiresConfirmationSignals(data) && !expectedResponseContainsSensitiveGuardrails(data)) {
    issues.push({
      severity: 'error',
      filePath,
      line: lineNumber,
      code: 'SENSITIVE_SCENARIO_WITHOUT_CONFIRMATION_GUARDRAIL',
      message: 'Cenario sensivel nao explicita previa/confirmacao/simulacao em expected_response.'
    });
  }

  if (String(data.execution_policy || '').trim() === 'consultative_safe' && String(data.risk_level || '').trim().toLowerCase() === 'high') {
    issues.push({
      severity: 'error',
      filePath,
      line: lineNumber,
      code: 'HIGH_RISK_WITH_CONSULTATIVE_POLICY',
      message: 'Cenario de alto risco esta marcado como consultative_safe.'
    });
  }

  return issues;
}

function buildCoverageRows(fullScenarios, sampleScenarios) {
  const fullByCategory = new Map();
  const sampleByCategory = new Map();

  for (const scenario of fullScenarios) {
    const category = String(scenario.category || '').trim() || 'sem_categoria';
    if (!fullByCategory.has(category)) fullByCategory.set(category, []);
    fullByCategory.get(category).push(scenario);
  }

  for (const scenario of sampleScenarios) {
    const category = String(scenario.category || '').trim() || 'sem_categoria';
    if (!sampleByCategory.has(category)) sampleByCategory.set(category, []);
    sampleByCategory.get(category).push(scenario);
  }

  const categories = Array.from(new Set([...fullByCategory.keys(), ...sampleByCategory.keys(), ...REQUIRED_CATEGORIES])).sort();
  return categories.map((category) => {
    const fullItems = fullByCategory.get(category) || [];
    const sampleItems = sampleByCategory.get(category) || [];
    const allItems = [...fullItems, ...sampleItems];
    return {
      category,
      totalFull: fullItems.length,
      totalSample: sampleItems.length,
      consultiveActions: allItems.filter(isConsultiveScenario).length,
      sensitiveActions: allItems.filter(isSensitiveScenario).length,
      diagnostics: allItems.filter(isDiagnosticScenario).length,
      reports: allItems.filter(isReportScenario).length,
      composed: allItems.filter(isComposedScenario).length,
      requiresConfirmation: allItems.filter(requiresConfirmationSignals).length
    };
  });
}

function validateCoverage(fullScenarios, sampleScenarios, coverageRows) {
  const issues = [];
  const fullIds = new Set(fullScenarios.map((item) => item.id));
  const sampleIds = new Set(sampleScenarios.map((item) => item.id));

  for (const sampleId of sampleIds) {
    if (!fullIds.has(sampleId)) {
      issues.push({
        severity: 'error',
        code: 'SAMPLE_ID_NOT_IN_FULL_CATALOG',
        message: `Cenario do sample ausente no catalogo completo: ${sampleId}`
      });
    }
  }

  const missingInFull = coverageRows.filter((row) => REQUIRED_CATEGORIES.includes(row.category) && row.totalFull === 0);
  const missingInSample = coverageRows.filter((row) => REQUIRED_CATEGORIES.includes(row.category) && row.totalSample === 0);

  for (const row of missingInFull) {
    issues.push({ severity: 'error', code: 'MISSING_REQUIRED_CATEGORY_IN_FULL', message: `Categoria obrigatoria ausente no catalogo completo: ${row.category}` });
  }
  for (const row of missingInSample) {
    issues.push({ severity: 'error', code: 'MISSING_REQUIRED_CATEGORY_IN_SAMPLE', message: `Categoria obrigatoria ausente no sample: ${row.category}` });
  }

  const sampleSensitiveCount = sampleScenarios.filter(isSensitiveScenario).length;
  const sampleComposedCount = sampleScenarios.filter(isComposedScenario).length;
  const sampleDiagnosticCount = sampleScenarios.filter(isDiagnosticScenario).length;

  if (new Set(sampleScenarios.map((item) => item.category)).size < 5) {
    issues.push({ severity: 'error', code: 'SAMPLE_CATEGORY_VARIETY_TOO_LOW', message: 'Sample cobre poucas categorias distintas.' });
  }
  if (sampleSensitiveCount === 0) {
    issues.push({ severity: 'error', code: 'SAMPLE_WITHOUT_SENSITIVE_SCENARIOS', message: 'Sample nao contem cenarios sensiveis.' });
  }
  if (sampleComposedCount === 0) {
    issues.push({ severity: 'error', code: 'SAMPLE_WITHOUT_COMPOSED_SCENARIOS', message: 'Sample nao contem cenarios compostos.' });
  }
  if (sampleDiagnosticCount === 0) {
    issues.push({ severity: 'warning', code: 'SAMPLE_WITHOUT_DIAGNOSTIC_SCENARIOS', message: 'Sample nao contem cenarios marcados como diagnostico.' });
  }

  return issues;
}

function validateRunnerCompatibility(allScenarios) {
  const issues = [];
  for (const scenario of allScenarios) {
    for (const field of RUNNER_REQUIRED_FIELDS) {
      if (!(field in scenario)) {
        issues.push({ severity: 'error', code: 'RUNNER_REQUIRED_FIELD_MISSING', message: `Cenario ${scenario.id || '(sem id)'} nao contem o campo requerido pelo runner: ${field}` });
      }
    }
  }
  return {
    compatible: issues.length === 0,
    requiredFields: RUNNER_REQUIRED_FIELDS,
    issues
  };
}

function runAntiHeuristicChecks() {
  const results = [];
  const issues = [];

  for (const check of ANTI_HEURISTIC_CHECKS) {
    const text = readFileText(check.filePath);
    const missingTokens = [];
    const forbiddenTokens = [];

    for (const token of check.mustContainAll || []) {
      if (!text.includes(token)) missingTokens.push(token);
    }

    for (const token of check.mustNotContainAny || []) {
      if (text.includes(token)) forbiddenTokens.push(token);
    }

    const passed = missingTokens.length === 0 && forbiddenTokens.length === 0;
    results.push({
      key: check.key,
      filePath: check.filePath,
      description: check.description,
      passed,
      missingTokens,
      forbiddenTokens
    });

    if (!passed) {
      issues.push({
        severity: 'error',
        code: 'ANTI_HEURISTIC_CHECK_FAILED',
        message: `${check.description} falhou em ${check.filePath}.`,
        details: { missingTokens, forbiddenTokens }
      });
    }
  }

  return { passed: issues.length === 0, checks: results, issues };
}

function summarizeCatalog(catalogScenarios) {
  return {
    total: catalogScenarios.length,
    categories: Array.from(new Set(catalogScenarios.map((item) => item.category))).sort(),
    consultiveActions: catalogScenarios.filter(isConsultiveScenario).length,
    sensitiveActions: catalogScenarios.filter(isSensitiveScenario).length,
    diagnostics: catalogScenarios.filter(isDiagnosticScenario).length,
    reports: catalogScenarios.filter(isReportScenario).length,
    composed: catalogScenarios.filter(isComposedScenario).length,
    requiresConfirmation: catalogScenarios.filter(requiresConfirmationSignals).length
  };
}

function buildMarkdownReport(report) {
  const lines = [
    '# Validacao do Catalogo AI Chat SICAT',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.ok ? 'PASS' : 'FAIL'}`,
    `- Catalogo completo: ${report.catalogs.full.summary.total} cenarios`,
    `- Sample: ${report.catalogs.sample.summary.total} cenarios`,
    '',
    '## Compatibilidade com runner',
    '',
    `- Compatibilidade: ${report.runnerCompatibility.compatible ? 'OK' : 'FAIL'}`,
    `- Campos requeridos: ${report.runnerCompatibility.requiredFields.join(', ')}`,
    '',
    '## Anti-heuristica',
    ''
  ];

  for (const check of report.antiHeuristic.checks) {
    lines.push(`- ${check.passed ? 'OK' : 'FAIL'} ${check.description} (${check.filePath})`);
  }

  lines.push('', '## Cobertura por categoria', '', '| categoria | total catalogo | total sample | consultivas | sensiveis | diagnosticos | relatorios | compostos | exigem confirmacao |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

  for (const row of report.coverage.rows) {
    lines.push(`| ${row.category} | ${row.totalFull} | ${row.totalSample} | ${row.consultiveActions} | ${row.sensitiveActions} | ${row.diagnostics} | ${row.reports} | ${row.composed} | ${row.requiresConfirmation} |`);
  }

  lines.push('', '## Resumo por arquivo', '');

  for (const [key, catalog] of Object.entries(report.catalogs)) {
    lines.push(`### ${key}`);
    lines.push('');
    lines.push(`- Arquivo: ${catalog.filePath}`);
    lines.push(`- Total: ${catalog.summary.total}`);
    lines.push(`- Categorias: ${catalog.summary.categories.join(', ')}`);
    lines.push(`- Consultivas: ${catalog.summary.consultiveActions}`);
    lines.push(`- Sensiveis: ${catalog.summary.sensitiveActions}`);
    lines.push(`- Diagnosticos: ${catalog.summary.diagnostics}`);
    lines.push(`- Relatorios: ${catalog.summary.reports}`);
    lines.push(`- Compostos: ${catalog.summary.composed}`);
    lines.push(`- Exigem confirmacao: ${catalog.summary.requiresConfirmation}`);
    lines.push('');
  }

  lines.push('## Pendencias reais', '');

  if (report.issues.length === 0) {
    lines.push('- Nenhuma pendencia estrutural, de cobertura, compatibilidade ou anti-heuristica encontrada nesta fase.');
  } else {
    for (const issue of report.issues) {
      const location = issue.filePath ? `${issue.filePath}${issue.line ? `:${issue.line}` : ''}` : 'catalog-validation';
      lines.push(`- [${issue.severity}] ${issue.code} @ ${location}: ${issue.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function writeArtifacts(report) {
  const outDir = ensureArtifactsDir();
  const stamp = toStamp();
  const jsonPath = path.join(outDir, `catalog-validation-${stamp}.json`);
  const mdPath = path.join(outDir, `catalog-validation-${stamp}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, buildMarkdownReport(report));

  return { jsonPath, mdPath };
}

function main() {
  const fullCatalog = parseJsonlCatalog(FILES.full);
  const sampleCatalog = parseJsonlCatalog(FILES.sample);

  const fullScenarioIssues = fullCatalog.scenarios.flatMap((entry) => validateScenarioShape(FILES.full, entry));
  const sampleScenarioIssues = sampleCatalog.scenarios.flatMap((entry) => validateScenarioShape(FILES.sample, entry));

  const fullScenarios = fullCatalog.scenarios.map((entry) => entry.data);
  const sampleScenarios = sampleCatalog.scenarios.map((entry) => entry.data);
  const coverageRows = buildCoverageRows(fullScenarios, sampleScenarios);
  const coverageIssues = validateCoverage(fullScenarios, sampleScenarios, coverageRows);
  const runnerCompatibility = validateRunnerCompatibility([...fullScenarios, ...sampleScenarios]);
  const antiHeuristic = runAntiHeuristicChecks();

  const issues = [
    ...fullCatalog.issues,
    ...sampleCatalog.issues,
    ...fullScenarioIssues,
    ...sampleScenarioIssues,
    ...coverageIssues,
    ...runnerCompatibility.issues,
    ...antiHeuristic.issues
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    ok: issues.length === 0,
    requiredCategories: REQUIRED_CATEGORIES,
    catalogs: {
      full: {
        filePath: FILES.full,
        summary: summarizeCatalog(fullScenarios)
      },
      sample: {
        filePath: FILES.sample,
        summary: summarizeCatalog(sampleScenarios)
      }
    },
    coverage: {
      rows: coverageRows,
      missingRequiredInFull: coverageRows.filter((row) => REQUIRED_CATEGORIES.includes(row.category) && row.totalFull === 0).map((row) => row.category),
      missingRequiredInSample: coverageRows.filter((row) => REQUIRED_CATEGORIES.includes(row.category) && row.totalSample === 0).map((row) => row.category)
    },
    runnerCompatibility,
    antiHeuristic,
    issues
  };

  const artifacts = writeArtifacts(report);

  console.log(`Catalog validation status: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`JSON report: ${artifacts.jsonPath}`);
  console.log(`Markdown report: ${artifacts.mdPath}`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();