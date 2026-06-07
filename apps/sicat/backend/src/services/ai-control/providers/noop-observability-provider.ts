/** Provider de observabilidade no-op (Langfuse desabilitado). Nunca quebra nada. */
import type { AiControlLangfuseStatus, AiLangfuseMetrics } from '../ai-control-types.js';
import type { LangfuseConfig } from '../ai-control-config.js';
import type {
  AiObservabilityProvider,
  ObservabilityPromptSummary
} from './ai-observability-provider.js';

export class NoopObservabilityProvider implements AiObservabilityProvider {
  readonly name = 'noop';

  constructor(private readonly config: LangfuseConfig) {}

  async getStatus(): Promise<AiControlLangfuseStatus> {
    return {
      enabled: this.config.enabled,
      status: 'disabled',
      baseUrl: this.config.publicBaseUrl,
      projectId: this.config.projectId,
      publicKeyConfigured: this.config.publicKeyConfigured,
      secretKeyConfigured: this.config.secretKeyConfigured,
      lastSyncAt: null,
      error: null
    };
  }

  async listTraces(): Promise<[]> {
    return [];
  }

  async getTraceTree(): Promise<null> {
    return null;
  }

  async listObservations(): Promise<[]> {
    return [];
  }

  async listPrompts(): Promise<ObservabilityPromptSummary[]> {
    return [];
  }

  async getMetrics(): Promise<AiLangfuseMetrics> {
    return {
      available: false,
      window: null,
      totalTraces: null,
      totalCost: null,
      inputTokens: null,
      outputTokens: null,
      avgLatencyMs: null
    };
  }

  buildDeepLink(): string | null {
    return null;
  }
}
