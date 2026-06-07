import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

import { getOperationSuccessExample } from './openapi.js';

type GeneratedOperation = {
  key: string;
  summary: string;
  method: string;
  specPath: string;
  successStatus: number;
};

function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applyRecursively(target: unknown, visitor: (value: unknown) => unknown): unknown {
  if (Array.isArray(target)) {
    return target.map((item) => applyRecursively(item, visitor));
  }

  if (target && typeof target === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(target)) {
      output[key] = applyRecursively(value, visitor);
    }
    return visitor(output);
  }

  return visitor(target);
}

function nowIso(): string {
  return new Date().toISOString();
}

function patchDates(object: Record<string, unknown>): Record<string, unknown> {
  const dateKeys = new Set([
    'createdAt',
    'updatedAt',
    'submittedAt',
    'requestedAt',
    'startedAt',
    'finishedAt',
    'lastValidatedAt'
  ]);

  return applyRecursively(object, (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const mutable = value as Record<string, unknown>;
    for (const key of Object.keys(mutable)) {
      if (dateKeys.has(key) && typeof mutable[key] === 'string') {
        mutable[key] = nowIso();
      }
    }

    return mutable;
  }) as Record<string, unknown>;
}

function patchTopLevel(payload: unknown, req: Request, correlationId: string): Record<string, unknown> {
  const cloned = (deepClone(payload) as Record<string, unknown> | null) || {};
  const { params = {}, query = {} } = req;

  if (cloned.id && params.id) cloned.id = params.id;
  if (cloned.jobId && params.jobId) cloned.jobId = params.jobId;
  if (cloned.correlationId) cloned.correlationId = (params.correlationId as string | undefined) || correlationId;
  if (cloned.catalogName && params.catalogName) cloned.catalogName = params.catalogName;
  if (cloned.entityId && params.id) cloned.entityId = params.id;
  if (cloned.page && query.page) cloned.page = Number(String(query.page));
  if (cloned.pageSize && query.pageSize) cloned.pageSize = Number(String(query.pageSize));

  if (cloned.links && typeof cloned.links === 'object') {
    const links = cloned.links as Record<string, unknown>;
    if (cloned.jobId) links.job = `/v1/jobs/${String(cloned.jobId)}`;
    if (cloned.correlationId) links.audit = `/v1/audit/${String(cloned.correlationId)}`;
    if (cloned.entityType === 'manifesto' && cloned.entityId) {
      links.entity = `/v1/manifestos/${String(cloned.entityId)}`;
    }
    if (cloned.entityType === 'cadastro' && cloned.entityId) {
      links.entity = `/v1/cadastros/${String(cloned.entityId)}`;
    }
  }

  if (Array.isArray(cloned.items) && req.originalUrl.includes('/v1/partners/search') && query.q) {
    cloned.items = cloned.items.map((item: unknown) => ({
      ...(item as Record<string, unknown>),
      matchedBy: (item as { matchedBy?: unknown[] }).matchedBy || ['q']
    }));
  }

  return patchDates(cloned);
}

function buildFallbackResponse(operation: GeneratedOperation, req: Request, correlationId: string): Record<string, unknown> {
  return patchDates({
    operation: operation.key,
    summary: operation.summary,
    method: operation.method.toUpperCase(),
    path: operation.specPath,
    correlationId,
    request: {
      params: req.params,
      query: req.query
    }
  });
}

export function buildStubResponse(operation: GeneratedOperation, req: Request, correlationId: string): Record<string, unknown> {
  const example = getOperationSuccessExample(
    operation.specPath,
    operation.method,
    operation.successStatus
  );

  const response = example
    ? patchTopLevel(example, req, correlationId)
    : buildFallbackResponse(operation, req, correlationId);

  if (typeof response.commandId === 'string') {
    response.commandId = `cmd_${randomUUID().replace(/-/g, '').slice(0, 26)}`;
  }

  if (typeof response.jobId === 'string') {
    response.jobId = `job_${randomUUID().replace(/-/g, '').slice(0, 26)}`;
  }

  if (response.correlationId) {
    response.correlationId = (req.params.correlationId as string | undefined) || correlationId;
  }

  return response;
}
