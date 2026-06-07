/** Constrói deep links para inspeção avançada no Langfuse externo. */

function normalizeBase(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed || null;
}

export function buildLangfuseTraceDeepLink(
  baseUrl: string | null | undefined,
  projectId: string | null | undefined,
  traceId: string | null | undefined
): string | null {
  const base = normalizeBase(baseUrl);
  if (!base || !traceId) return null;
  if (projectId) {
    return `${base}/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(traceId)}`;
  }
  return `${base}/traces/${encodeURIComponent(traceId)}`;
}

export function buildLangfuseProjectDeepLink(
  baseUrl: string | null | undefined,
  projectId: string | null | undefined
): string | null {
  const base = normalizeBase(baseUrl);
  if (!base) return null;
  if (projectId) {
    return `${base}/project/${encodeURIComponent(projectId)}`;
  }
  return base;
}
