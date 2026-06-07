/**
 * AI Control Center — leitura de configuração de ambiente.
 *
 * Segue o padrão de `ai-config.ts` (lê `process.env` diretamente). NUNCA expõe
 * segredos: os getters retornam apenas flags `*Configured` para o frontend.
 * Mantém compatibilidade com LangSmith legado e prioriza Langfuse quando
 * `LANGFUSE_ENABLED=true`.
 */

function readString(key: string): string | null {
  const value = process.env[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function readBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function readInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export type LangfuseConfig = {
  enabled: boolean;
  /** URL usada pelo BACKEND para chamar a API Langfuse (DNS interno em Docker). */
  baseUrl: string;
  /** URL voltada ao BROWSER (deep links / status). Default = baseUrl. */
  publicBaseUrl: string;
  /** Presente apenas no backend; nunca serializar para o frontend. */
  publicKey: string | null;
  /** Presente apenas no backend; nunca serializar para o frontend. */
  secretKey: string | null;
  projectId: string | null;
  flushIntervalMs: number;
  syncTimeoutMs: number;
  publicKeyConfigured: boolean;
  secretKeyConfigured: boolean;
};

const DEFAULT_LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';

export function getLangfuseConfig(): LangfuseConfig {
  const publicKey = readString('LANGFUSE_PUBLIC_KEY');
  const secretKey = readString('LANGFUSE_SECRET_KEY');
  const baseUrl = readString('LANGFUSE_BASE_URL') || DEFAULT_LANGFUSE_BASE_URL;
  return {
    enabled: readBool('LANGFUSE_ENABLED', false),
    baseUrl,
    publicBaseUrl: readString('LANGFUSE_PUBLIC_BASE_URL') || baseUrl,
    publicKey,
    secretKey,
    projectId: readString('LANGFUSE_PROJECT_ID'),
    flushIntervalMs: readInt('LANGFUSE_FLUSH_INTERVAL_MS', 5000),
    syncTimeoutMs: readInt('LANGFUSE_SYNC_TIMEOUT_MS', 8000),
    publicKeyConfigured: Boolean(publicKey),
    secretKeyConfigured: Boolean(secretKey)
  };
}

/**
 * Langfuse está pronto para uso somente quando habilitado E com as duas chaves
 * configuradas. Sem isso, fica `disabled` (nunca quebra o fluxo conversacional).
 */
export function isLangfuseReady(config: LangfuseConfig = getLangfuseConfig()): boolean {
  return config.enabled && config.publicKeyConfigured && config.secretKeyConfigured;
}

export type AiControlConfig = {
  enabled: boolean;
  readOnly: boolean;
  allowFullSmoke: boolean;
  traceRetentionDays: number;
  enableSse: boolean;
  debug: boolean;
};

export function getAiControlConfig(): AiControlConfig {
  return {
    enabled: readBool('AI_CONTROL_ENABLED', true),
    readOnly: readBool('AI_CONTROL_READONLY', false),
    allowFullSmoke: readBool('AI_CONTROL_ALLOW_FULL_SMOKE', false),
    traceRetentionDays: readInt('AI_CONTROL_TRACE_RETENTION_DAYS', 30),
    enableSse: readBool('AI_CONTROL_ENABLE_SSE', true),
    debug: readBool('AI_CONTROL_DEBUG', false)
  };
}

export function isAiControlReadOnly(): boolean {
  return getAiControlConfig().readOnly;
}
