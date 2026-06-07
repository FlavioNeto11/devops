import fs from 'node:fs';
import path from 'node:path';

export const OPERATIONAL_FRONT_SLUG = 'frente-operacional-coordenada';
export const MANIFEST_FILE = 'manifest.json';
export const STATUS_BOARD_FILE = 'status-board.md';
export const EXECUTION_README_FILE = 'README.md';
export const EVENTS_FILE = 'events.ndjson';
export const BRIEFINGS_DIR = 'briefings';

const VALID_STATUSES = new Set(['pending', 'ready', 'in-progress', 'blocked', 'completed', 'skipped']);

const FRONT_LANES = [
  { agent: 'integrador-cetesb-mtr', phase: 'front', summary: 'Integração CETESB, sessão, token e payloads' },
  { agent: 'postgres-queue-mtr', phase: 'front', summary: 'Banco, fila, locking e consistência operacional' },
  { agent: 'dashboard-observability-mtr', phase: 'front', summary: 'Dashboard, métricas e observabilidade operacional' },
  { agent: 'jobs-monitoramento-logs-mtr', phase: 'front', summary: 'Operação admin global, jobs e logs' },
  { agent: 'sessao-conta-mtr', phase: 'front', summary: 'Sessão e conta CETESB do usuário atual' },
  { agent: 'manifestos-operacional-mtr', phase: 'front', summary: 'Fluxos de manifestos e ações operacionais' },
  { agent: 'perfis-acessos-admin-mtr', phase: 'front', summary: 'Perfis, acessos e governança administrativa' },
  { agent: 'tester-qa-mtr', phase: 'qa', summary: 'Validação final e regressão', dependsOn: 'front-complete' },
  { agent: 'documentador-mtr', phase: 'docs', summary: 'Decision-log, estrutura e docs finais', dependsOn: 'tester-qa-mtr' }
];

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'demanda';
}

function nowIso() {
  return new Date().toISOString();
}

function formatStatus(status) {
  const labels = {
    pending: 'pendente',
    ready: 'pronto',
    'in-progress': 'em progresso',
    blocked: 'bloqueado',
    completed: 'concluído',
    skipped: 'não aplicável'
  };

  return labels[status] ?? status;
}

function statusEmoji(status) {
  const labels = {
    pending: '⏳',
    ready: '🟦',
    'in-progress': '▶️',
    blocked: '⛔',
    completed: '✅',
    skipped: '⏭️'
  };

  return labels[status] ?? '•';
}

function defaultNoteForPhase(phase) {
  if (phase === 'front') return 'Aguardando disparo coordenado';
  if (phase === 'qa') return 'Aguardando conclusão da frente operacional';
  return 'Aguardando QA';
}

export function resolveExecutionDir(rootDir, dlId, slug = OPERATIONAL_FRONT_SLUG) {
  ensure(rootDir, 'rootDir é obrigatório.');
  ensure(dlId, 'dlId é obrigatório.');
  return path.resolve(rootDir, 'docs', 'copilot', 'handoffs', dlId, 'execution', slug);
}

export function parseCliArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

export function buildOperationalFrontManifest({ dlId, title, request, slug = OPERATIONAL_FRONT_SLUG, rootDir }) {
  ensure(dlId, 'dlId é obrigatório.');
  ensure(title, 'title é obrigatório.');

  const createdAt = nowIso();
  const executionDir = resolveExecutionDir(rootDir, dlId, slug);

  return {
    kind: 'copilot-operational-front/v1',
    dlId,
    slug,
    title,
    request: request || '',
    executionDir,
    createdAt,
    updatedAt: createdAt,
    phases: ['front', 'qa', 'docs'],
    lanes: FRONT_LANES.map((lane, index) => ({
      id: `${index + 1}-${lane.agent}`,
      agent: lane.agent,
      phase: lane.phase,
      summary: lane.summary,
      status: lane.phase === 'front' ? 'ready' : 'pending',
      note: defaultNoteForPhase(lane.phase),
      dependsOn: lane.dependsOn ?? null,
      updatedAt: createdAt,
      completedAt: null
    }))
  };
}

export function readManifest(executionDir) {
  const manifestPath = path.resolve(executionDir, MANIFEST_FILE);
  ensure(fs.existsSync(manifestPath), `Manifesto não encontrado em ${manifestPath}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function writeJson(filePath, content) {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function appendEvent(executionDir, event) {
  const eventPath = path.resolve(executionDir, EVENTS_FILE);
  fs.appendFileSync(eventPath, `${JSON.stringify(event)}\n`, 'utf8');
}

function renderCommands(manifest) {
  return [
    '```powershell',
    `npm run handoff:front:show -- --dl ${manifest.dlId}`,
    `npm run handoff:front:update -- --dl ${manifest.dlId} --agent integrador-cetesb-mtr --status in-progress --note "Iniciado"`,
    `npm run handoff:front:update -- --dl ${manifest.dlId} --agent tester-qa-mtr --status completed --note "Validações concluídas"`,
    '```'
  ].join('\n');
}

export function renderStatusBoard(manifest) {
  const rows = manifest.lanes
    .map((lane) => `| \`${lane.agent}\` | ${lane.phase} | ${statusEmoji(lane.status)} ${formatStatus(lane.status)} | ${lane.dependsOn ? `\`${lane.dependsOn}\`` : '-'} | ${lane.note || '-'} |`)
    .join('\n');

  return [
    `# Status Board — ${manifest.dlId}`,
    '',
    `- **Título:** ${manifest.title}`,
    `- **Slug:** \`${manifest.slug}\``,
    `- **Atualizado em:** \`${manifest.updatedAt}\``,
    `- **Request:** ${manifest.request || 'n/a'}`,
    '',
    '## Lanes',
    '| Agente | Fase | Status | Dependência | Nota |',
    '|---|---|---|---|---|',
    rows,
    '',
    '## Regras operacionais',
    '- A frente `front` pode ser distribuída por independência de arquivos, mas o runtime atual continua observável por atualização de artefatos, não por subagentes simultâneos no UI.',
    '- `tester-qa-mtr` só inicia após o fechamento da frente operacional.',
    '- `documentador-mtr` só inicia após QA concluído.',
    '',
    '## Comandos úteis',
    renderCommands(manifest),
    ''
  ].join('\n');
}

export function renderExecutionReadme(manifest) {
  return [
    `# Execução observável — ${manifest.dlId}`,
    '',
    `Esta pasta foi gerada para tornar a frente operacional coordenada **observável fora do chat**.`,
    '',
    '## Artefatos',
    `- \`${MANIFEST_FILE}\`: estado canônico das lanes`,
    `- \`${STATUS_BOARD_FILE}\`: visão resumida em Markdown`,
    `- \`${EVENTS_FILE}\`: trilha append-only de eventos`,
    `- \`${BRIEFINGS_DIR}/\`: briefings individuais por especialista`,
    '',
    '## Como usar',
    '1. Gere o pacote com `npm run handoff:front:prepare ...`.',
    '2. Abra o board com `npm run handoff:front:show -- --dl <DL>`.',
    '3. Atualize cada lane conforme avanço usando `npm run handoff:front:update`.',
    '4. Preserve QA e docs em sequência no final.',
    '',
    '## Limite conhecido',
    '- O Copilot/VS Code atual não expõe execução simultânea visível de subagentes; este kit fornece coordenação observável por artefatos e status.',
    ''
  ].join('\n');
}

export function renderBriefing(manifest, lane) {
  return [
    `# Briefing — ${lane.agent}`,
    '',
    `- **DL:** \`${manifest.dlId}\``,
    `- **Título:** ${manifest.title}`,
    `- **Fase:** ${lane.phase}`,
    `- **Status inicial:** ${statusEmoji(lane.status)} ${formatStatus(lane.status)}`,
    `- **Dependência:** ${lane.dependsOn ? `\`${lane.dependsOn}\`` : 'nenhuma'}`,
    '',
    '## Escopo desta lane',
    `- ${lane.summary}`,
    `- Request base: ${manifest.request || 'n/a'}`,
    '',
    '## Ao concluir',
    `- Atualize o board com \`npm run handoff:front:update -- --dl ${manifest.dlId} --agent ${lane.agent} --status completed --note "resumo"\``,
    ''
  ].join('\n');
}

function writeDerivedFiles(executionDir, manifest) {
  const briefingsDir = path.resolve(executionDir, BRIEFINGS_DIR);
  fs.mkdirSync(briefingsDir, { recursive: true });

  fs.writeFileSync(path.resolve(executionDir, STATUS_BOARD_FILE), `${renderStatusBoard(manifest)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(executionDir, EXECUTION_README_FILE), `${renderExecutionReadme(manifest)}\n`, 'utf8');

  for (const lane of manifest.lanes) {
    fs.writeFileSync(path.resolve(briefingsDir, `${lane.agent}.md`), `${renderBriefing(manifest, lane)}\n`, 'utf8');
  }
}

export function prepareOperationalFront({ rootDir, dlId, title, request, slug = OPERATIONAL_FRONT_SLUG }) {
  const manifest = buildOperationalFrontManifest({ rootDir, dlId, title, request, slug });
  fs.mkdirSync(manifest.executionDir, { recursive: true });
  writeJson(path.resolve(manifest.executionDir, MANIFEST_FILE), manifest);
  fs.writeFileSync(path.resolve(manifest.executionDir, EVENTS_FILE), '', 'utf8');
  appendEvent(manifest.executionDir, {
    at: manifest.createdAt,
    actor: 'prepare-script',
    action: 'created',
    dlId,
    title
  });
  writeDerivedFiles(manifest.executionDir, manifest);
  return manifest;
}

export function updateOperationalFront({ rootDir, dlId, executionDir, agent, status, note = '', actor = 'manual-update' }) {
  ensure(agent, 'agent é obrigatório.');
  ensure(status, 'status é obrigatório.');
  ensure(VALID_STATUSES.has(status), `status inválido: ${status}`);

  const resolvedExecutionDir = executionDir || resolveExecutionDir(rootDir, dlId);
  const manifest = readManifest(resolvedExecutionDir);
  const lane = manifest.lanes.find((item) => item.agent === agent);

  ensure(lane, `Lane não encontrada para agente ${agent}`);

  const timestamp = nowIso();
  lane.status = status;
  lane.note = note || lane.note;
  lane.updatedAt = timestamp;
  lane.completedAt = status === 'completed' ? timestamp : null;
  manifest.updatedAt = timestamp;

  writeJson(path.resolve(resolvedExecutionDir, MANIFEST_FILE), manifest);
  appendEvent(resolvedExecutionDir, {
    at: timestamp,
    actor,
    action: 'status-update',
    agent,
    status,
    note
  });
  writeDerivedFiles(resolvedExecutionDir, manifest);

  return manifest;
}

export function summarizeOperationalFront(manifest) {
  const counts = manifest.lanes.reduce((accumulator, lane) => {
    accumulator[lane.status] = (accumulator[lane.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    ready: counts.ready ?? 0,
    pending: counts.pending ?? 0,
    inProgress: counts['in-progress'] ?? 0,
    blocked: counts.blocked ?? 0,
    completed: counts.completed ?? 0,
    skipped: counts.skipped ?? 0
  };
}

export function renderConsoleSummary(manifest) {
  const summary = summarizeOperationalFront(manifest);
  const lines = [
    `${manifest.dlId} :: ${manifest.title}`,
    `Atualizado: ${manifest.updatedAt}`,
    `ready=${summary.ready} pending=${summary.pending} in-progress=${summary.inProgress} blocked=${summary.blocked} completed=${summary.completed} skipped=${summary.skipped}`,
    ''
  ];

  for (const lane of manifest.lanes) {
    lines.push(`${statusEmoji(lane.status)} ${lane.agent.padEnd(30)} [${lane.phase}] ${lane.note || ''}`);
  }

  return lines.join('\n');
}
