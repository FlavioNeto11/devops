/** Normaliza payloads brutos do Langfuse para os DTOs do SICAT. */
import type {
  AiLangfuseObservation,
  AiLangfuseTraceSummary,
  AiLangfuseTraceTree,
  AiLangfuseTraceTreeNode
} from '../ai-control-types.js';
import { buildLangfuseTraceDeepLink } from './langfuse-deeplink.js';
import type { LangfuseRawObservation, LangfuseRawTrace, LangfuseUsage } from './langfuse-types.js';

export type LangfuseMapContext = {
  baseUrl: string | null;
  projectId: string | null;
};

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMeta(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return toStr(metadata[key]);
}

function durationFromTimes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

function usageInput(usage: LangfuseUsage | null | undefined): number | null {
  if (!usage) return null;
  return toNum(usage.input) ?? toNum(usage.promptTokens) ?? null;
}

function usageOutput(usage: LangfuseUsage | null | undefined): number | null {
  if (!usage) return null;
  return toNum(usage.output) ?? toNum(usage.completionTokens) ?? null;
}

export function mapTraceSummary(raw: LangfuseRawTrace, ctx: LangfuseMapContext): AiLangfuseTraceSummary {
  const metadata = raw.metadata || null;
  return {
    traceId: raw.id,
    name: toStr(raw.name),
    conversationSessionId: readMeta(metadata, 'conversationSessionId') || toStr(raw.sessionId),
    conversationTurnId: readMeta(metadata, 'conversationTurnId'),
    correlationId: readMeta(metadata, 'correlationId'),
    userId: toStr(raw.userId),
    status: readMeta(metadata, 'status'),
    startedAt: toStr(raw.timestamp),
    durationMs: toNum(raw.latency),
    inputTokens: toNum(raw.inputTokens) ?? usageInput(raw.usage),
    outputTokens: toNum(raw.outputTokens) ?? usageOutput(raw.usage),
    cost: toNum(raw.totalCost) ?? toNum(raw.cost),
    deepLink: buildLangfuseTraceDeepLink(ctx.baseUrl, ctx.projectId, raw.id)
  };
}

export function mapObservation(raw: LangfuseRawObservation): AiLangfuseObservation {
  return {
    id: raw.id,
    traceId: toStr(raw.traceId) || '',
    type: toStr(raw.type) || 'span',
    name: toStr(raw.name),
    status: toStr(raw.level) || toStr(raw.statusMessage),
    startedAt: toStr(raw.startTime),
    durationMs: durationFromTimes(raw.startTime, raw.endTime),
    model: toStr(raw.model),
    inputTokens: usageInput(raw.usage),
    outputTokens: usageOutput(raw.usage),
    cost: toNum(raw.calculatedTotalCost) ?? toNum(raw.totalCost)
  };
}

function observationToTreeNode(raw: LangfuseRawObservation, children: AiLangfuseTraceTreeNode[]): AiLangfuseTraceTreeNode {
  return {
    id: raw.id,
    type: toStr(raw.type) || 'span',
    name: toStr(raw.name) || toStr(raw.type) || 'observation',
    status: toStr(raw.level) || toStr(raw.statusMessage),
    durationMs: durationFromTimes(raw.startTime, raw.endTime),
    model: toStr(raw.model),
    inputTokens: usageInput(raw.usage),
    outputTokens: usageOutput(raw.usage),
    cost: toNum(raw.calculatedTotalCost) ?? toNum(raw.totalCost),
    children
  };
}

export function buildObservationTree(observations: LangfuseRawObservation[]): AiLangfuseTraceTreeNode[] {
  const childrenByParent = new Map<string, LangfuseRawObservation[]>();
  const known = new Set(observations.map((obs) => obs.id));
  const roots: LangfuseRawObservation[] = [];

  for (const obs of observations) {
    const parent = toStr(obs.parentObservationId);
    if (parent && known.has(parent)) {
      const list = childrenByParent.get(parent) || [];
      list.push(obs);
      childrenByParent.set(parent, list);
    } else {
      roots.push(obs);
    }
  }

  const sortByStart = (a: LangfuseRawObservation, b: LangfuseRawObservation) =>
    (Date.parse(a.startTime || '') || 0) - (Date.parse(b.startTime || '') || 0);

  const buildNode = (obs: LangfuseRawObservation, depth: number): AiLangfuseTraceTreeNode => {
    if (depth > 12) return observationToTreeNode(obs, []);
    const children = (childrenByParent.get(obs.id) || [])
      .sort(sortByStart)
      .map((child) => buildNode(child, depth + 1));
    return observationToTreeNode(obs, children);
  };

  return roots.sort(sortByStart).map((root) => buildNode(root, 0));
}

export function mapTraceTree(raw: LangfuseRawTrace, ctx: LangfuseMapContext): AiLangfuseTraceTree {
  const summary = mapTraceSummary(raw, ctx);
  const observations = Array.isArray(raw.observations) ? raw.observations : [];
  return {
    ...summary,
    nodes: buildObservationTree(observations)
  };
}
