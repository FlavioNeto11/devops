/**
 * Cliente HTTP mínimo da API pública do Langfuse (Basic auth com public:secret).
 * Nunca lança: todo método retorna `{ ok, data | error }`. Timeout por AbortSignal.
 * As chaves NUNCA saem deste backend.
 */
import type { LangfuseConfig } from '../ai-control-config.js';
import type {
  LangfuseDailyMetricsResponse,
  LangfuseListResponse,
  LangfuseRawObservation,
  LangfuseRawPrompt,
  LangfuseRawTrace
} from './langfuse-types.js';

export type LangfuseRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type QueryParams = Record<string, string | number | null | undefined>;

export class LangfuseClient {
  private readonly base: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(config: LangfuseConfig) {
    this.base = (config.baseUrl || '').trim().replace(/\/+$/, '');
    const token = Buffer.from(`${config.publicKey ?? ''}:${config.secretKey ?? ''}`).toString('base64');
    this.authHeader = `Basic ${token}`;
    this.timeoutMs = Number.isFinite(config.syncTimeoutMs) && config.syncTimeoutMs > 0 ? config.syncTimeoutMs : 8000;
  }

  private async get<T>(path: string, query?: QueryParams): Promise<LangfuseRequestResult<T>> {
    if (!this.base) {
      return { ok: false, error: 'LANGFUSE_BASE_URL ausente' };
    }
    try {
      const url = new URL(`${this.base}${path}`);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
          }
        }
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) {
        return { ok: false, error: `Langfuse HTTP ${response.status}`, status: response.status };
      }
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'falha na requisicao ao Langfuse';
      return { ok: false, error: message };
    }
  }

  private async post<T>(path: string, body: unknown): Promise<LangfuseRequestResult<T>> {
    if (!this.base) {
      return { ok: false, error: 'LANGFUSE_BASE_URL ausente' };
    }
    try {
      const response = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { Authorization: this.authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) {
        return { ok: false, error: `Langfuse HTTP ${response.status}`, status: response.status };
      }
      const data = (await response.json().catch(() => ({}))) as T;
      return { ok: true, data };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'falha na requisicao ao Langfuse';
      return { ok: false, error: message };
    }
  }

  async health(): Promise<LangfuseRequestResult<unknown>> {
    // /api/public/projects é leve e exige apenas auth válida.
    return this.get('/api/public/projects');
  }

  /** Envia um batch de eventos de ingestão (trace-create, observation-create, …). */
  async ingest(batch: unknown[]): Promise<LangfuseRequestResult<unknown>> {
    return this.post('/api/public/ingestion', { batch });
  }

  async listTraces(query?: QueryParams): Promise<LangfuseRequestResult<LangfuseListResponse<LangfuseRawTrace>>> {
    return this.get<LangfuseListResponse<LangfuseRawTrace>>('/api/public/traces', query);
  }

  async getTrace(traceId: string): Promise<LangfuseRequestResult<LangfuseRawTrace>> {
    return this.get<LangfuseRawTrace>(`/api/public/traces/${encodeURIComponent(traceId)}`);
  }

  async listObservations(query?: QueryParams): Promise<LangfuseRequestResult<LangfuseListResponse<LangfuseRawObservation>>> {
    return this.get<LangfuseListResponse<LangfuseRawObservation>>('/api/public/observations', query);
  }

  async listPrompts(query?: QueryParams): Promise<LangfuseRequestResult<LangfuseListResponse<LangfuseRawPrompt>>> {
    return this.get<LangfuseListResponse<LangfuseRawPrompt>>('/api/public/v2/prompts', query);
  }

  async dailyMetrics(query?: QueryParams): Promise<LangfuseRequestResult<LangfuseDailyMetricsResponse>> {
    return this.get<LangfuseDailyMetricsResponse>('/api/public/metrics/daily', query);
  }
}
