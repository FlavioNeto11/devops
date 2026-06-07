/**
 * Administração de prompts (DB-backed + fallback local + visão Langfuse).
 *
 * Fonte de verdade: ai_prompts/ai_prompt_versions. Quando não há versão ativa no
 * banco para um prompt conhecido, o runtime continua usando o prompt embutido em
 * código (fallback — comportamento atual preservado). O wiring de cada prompt
 * inline ao resolver é incremental (ver handoff 05); aqui entregamos a superfície
 * administrável completa + resolver `getActivePromptText`.
 */
import { AppError } from '../../lib/problem.js';
import {
  listAiPrompts,
  findAiPrompt,
  upsertAiPrompt,
  setAiPromptActiveVersion,
  listAiPromptVersions,
  findAiPromptVersionById,
  insertAiPromptVersion,
  markAiPromptVersionActivated,
  findActivePromptVersionByName,
  type AiPromptVersionRecord
} from '../../repositories/ai-prompt-admin-repo.js';
import { getObservabilityProvider } from './ai-control-observability-service.js';
import { CONVERSATION_PROMPT_DEFAULTS } from '../conversation/prompts/conversation-prompt-defaults.js';
import type {
  AiPromptDetail,
  AiPromptProviderSource,
  AiPromptSummary,
  AiPromptVersion
} from './ai-control-types.js';

type KnownPrompt = { name: string; description: string; model: string };

const KNOWN_PROMPTS: KnownPrompt[] = [
  { name: 'conversation.system', description: 'System prompt do planner conversacional (buildSystemPrompt).', model: 'agent' },
  { name: 'conversation.classifier', description: 'Classificador de intenção operacional.', model: 'agent' },
  { name: 'conversation.planner', description: 'Instrução do planner (tool calling).', model: 'agent' },
  { name: 'conversation.synthesis', description: 'Síntese da resposta final em linguagem natural.', model: 'synthesis' },
  { name: 'conversation.escalation', description: 'Reclassificação/replanejamento em escalation.', model: 'escalation' },
  { name: 'conversation.judge', description: 'LLM juiz de avaliação (smoke/eval).', model: 'judge' }
];

function coerceProviderSource(value: string | null | undefined): AiPromptProviderSource {
  return value === 'local' || value === 'langfuse' || value === 'manual' ? value : 'local';
}

function toPromptVersionDto(record: AiPromptVersionRecord, activeVersionId: string | null): AiPromptVersion {
  return {
    id: record.id,
    version: record.version,
    label: record.label,
    model: record.model,
    promptText: record.promptText,
    promptConfig: record.promptConfig,
    langfusePromptId: record.langfusePromptId,
    langfuseVersion: record.langfuseVersion,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt,
    active: record.id === activeVersionId
  };
}

let defaultsSeedAttempted = false;

/**
 * Cadastra (uma vez) os prompts conversacionais padrão no banco, como versão 1
 * "baseline", para que apareçam registrados na tela de Prompts. Idempotente:
 * só cria versão para o prompt que ainda não tiver nenhuma. Best-effort.
 */
export async function ensureDefaultPromptsSeeded(): Promise<void> {
  if (defaultsSeedAttempted) return;
  defaultsSeedAttempted = true;
  try {
    for (const [name, def] of Object.entries(CONVERSATION_PROMPT_DEFAULTS)) {
      const existing = await findAiPrompt(name);
      if (existing) {
        const versions = await listAiPromptVersions(existing.id);
        if (versions.length > 0) continue; // já cadastrado
      }
      const prompt = await upsertAiPrompt({ promptName: name, description: def.description, providerSource: 'local' });
      if (!prompt) continue;
      const version = await insertAiPromptVersion({
        promptId: prompt.id,
        version: '1',
        label: 'baseline',
        model: def.model,
        promptText: def.text,
        promptConfig: { origin: 'code-default' },
        createdBy: 'system'
      });
      if (version) {
        await setAiPromptActiveVersion(prompt.id, version.id);
        await markAiPromptVersionActivated(version.id);
      }
    }
  } catch {
    // best-effort: não bloqueia a listagem se o seed falhar
    defaultsSeedAttempted = false;
  }
}

export async function listPrompts(): Promise<AiPromptSummary[]> {
  await ensureDefaultPromptsSeeded();
  const dbPrompts = await listAiPrompts();
  const dbByName = new Map(dbPrompts.map((prompt) => [prompt.promptName, prompt]));
  const names = new Set<string>([...KNOWN_PROMPTS.map((known) => known.name), ...dbByName.keys()]);

  const summaries: AiPromptSummary[] = [];
  for (const name of names) {
    const known = KNOWN_PROMPTS.find((entry) => entry.name === name) ?? null;
    const db = dbByName.get(name) ?? null;
    let versionsCount = 0;
    let activeVersion: string | null = null;
    if (db) {
      const versions = await listAiPromptVersions(db.id);
      versionsCount = versions.length;
      const active = versions.find((version) => version.id === db.activeVersionId) ?? null;
      activeVersion = active?.version ?? null;
    }
    summaries.push({
      promptName: name,
      description: db?.description || known?.description || null,
      providerSource: coerceProviderSource(db?.providerSource),
      activeVersion,
      versionsCount,
      source: db ? 'db' : 'code',
      updatedAt: db?.updatedAt ?? null
    });
  }
  return summaries.sort((a, b) => a.promptName.localeCompare(b.promptName));
}

export async function getPrompt(name: string): Promise<AiPromptDetail> {
  await ensureDefaultPromptsSeeded();
  const known = KNOWN_PROMPTS.find((entry) => entry.name === name) ?? null;
  const db = await findAiPrompt(name);
  let versions: AiPromptVersion[] = [];
  let activeVersion: string | null = null;
  if (db) {
    const records = await listAiPromptVersions(db.id);
    versions = records.map((record) => toPromptVersionDto(record, db.activeVersionId));
    activeVersion = versions.find((version) => version.active)?.version ?? null;
  }
  if (!db && !known) {
    throw new AppError(404, 'Not Found', `Prompt ${name} nao encontrado.`, { code: 'PROMPT_NOT_FOUND' });
  }
  return {
    promptName: name,
    description: db?.description || known?.description || null,
    providerSource: coerceProviderSource(db?.providerSource),
    activeVersion,
    versionsCount: versions.length,
    source: db ? 'db' : 'code',
    updatedAt: db?.updatedAt ?? null,
    versions,
    localFallbackAvailable: Boolean(known)
  };
}

export type CreatePromptVersionPayload = {
  promptText?: unknown;
  version?: unknown;
  label?: unknown;
  model?: unknown;
  description?: unknown;
  promptConfig?: unknown;
  activate?: unknown;
};

export async function createPromptVersion(
  name: string,
  payload: CreatePromptVersionPayload,
  actorUserId: string
): Promise<AiPromptDetail> {
  const text = typeof payload.promptText === 'string' ? payload.promptText.trim() : '';
  if (!text) {
    throw new AppError(400, 'Bad Request', 'Campo promptText e obrigatorio.', { code: 'PROMPT_TEXT_REQUIRED' });
  }

  const prompt = await upsertAiPrompt({
    promptName: name,
    description: typeof payload.description === 'string' ? payload.description : null,
    providerSource: 'manual'
  });
  if (!prompt) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao registrar prompt.', { code: 'PROMPT_UPSERT_FAILED' });
  }

  const versionLabel = typeof payload.version === 'string' && payload.version.trim() ? payload.version.trim() : new Date().toISOString();
  const created = await insertAiPromptVersion({
    promptId: prompt.id,
    version: versionLabel,
    label: typeof payload.label === 'string' ? payload.label : null,
    model: typeof payload.model === 'string' ? payload.model : null,
    promptText: text,
    promptConfig: payload.promptConfig && typeof payload.promptConfig === 'object' ? (payload.promptConfig as Record<string, unknown>) : {},
    createdBy: actorUserId
  });
  if (!created) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao criar versao de prompt.', { code: 'PROMPT_VERSION_FAILED' });
  }

  if (payload.activate === true || !prompt.activeVersionId) {
    await setAiPromptActiveVersion(prompt.id, created.id);
    await markAiPromptVersionActivated(created.id);
  }

  return getPrompt(name);
}

export async function activatePromptVersion(name: string, versionId: string, _actorUserId: string): Promise<AiPromptDetail> {
  const db = await findAiPrompt(name);
  if (!db) {
    throw new AppError(404, 'Not Found', `Prompt ${name} nao encontrado no banco.`, { code: 'PROMPT_NOT_FOUND' });
  }
  const version = await findAiPromptVersionById(versionId);
  if (!version || version.promptId !== db.id) {
    throw new AppError(404, 'Not Found', 'Versao nao encontrada para este prompt.', { code: 'PROMPT_VERSION_NOT_FOUND' });
  }
  await setAiPromptActiveVersion(db.id, versionId);
  await markAiPromptVersionActivated(versionId);
  return getPrompt(name);
}

export async function syncPromptFromLangfuse(name: string, actorUserId: string): Promise<AiPromptDetail> {
  const provider = getObservabilityProvider();
  const prompts = await provider.listPrompts();
  const match = prompts.find((prompt) => prompt.name === name) ?? null;
  if (!match) {
    throw new AppError(
      404,
      'Not Found',
      `Prompt ${name} nao encontrado no Langfuse (ou Langfuse indisponivel).`,
      { code: 'LANGFUSE_PROMPT_NOT_FOUND' }
    );
  }

  const prompt = await upsertAiPrompt({ promptName: name, providerSource: 'langfuse' });
  if (!prompt) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao registrar prompt sincronizado.', { code: 'PROMPT_UPSERT_FAILED' });
  }

  await insertAiPromptVersion({
    promptId: prompt.id,
    version: `langfuse-v${match.version ?? '0'}`,
    label: match.labels[0] ?? null,
    model: null,
    promptText: `[Referência Langfuse] prompt "${name}" versão ${match.version ?? '?'} (labels: ${match.labels.join(', ') || '—'}).`,
    promptConfig: { langfuse: { labels: match.labels, type: match.type, updatedAt: match.updatedAt } },
    langfusePromptId: name,
    langfuseVersion: match.version,
    createdBy: actorUserId
  });

  return getPrompt(name);
}

/** Resolver de runtime: texto da versão ativa de um prompt (null = usar fallback de código). */
export async function getActivePromptText(name: string): Promise<string | null> {
  try {
    const version = await findActivePromptVersionByName(name);
    return version?.promptText ?? null;
  } catch {
    return null;
  }
}
