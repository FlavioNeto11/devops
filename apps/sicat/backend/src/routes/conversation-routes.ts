import express from 'express';
import fs from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { asyncHandler } from '../lib/http.js';
import {
  getConversationArtifactContent,
  getConversationArtifactStatus
} from '../services/conversation/conversation-persistence-service.js';
import { createConversationService, listConversationTools } from '../services/conversation/conversation-service.js';
import { aiMetrics } from '../lib/ai-metrics.js';

type RequestWithContext = express.Request & {
  correlationId?: string | null;
};

function toSingleString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function toHeaderMap(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const entries = Object.entries(headers).map(([key, value]) => {
    if (typeof value === 'string') return [key, value] as const;
    if (Array.isArray(value)) return [key, value.join(', ')] as const;
    return [key, undefined] as const;
  });

  return Object.fromEntries(entries);
}

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

function toOptionalQueryString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }
  return null;
}

const conversationService = createConversationService();

export function createConversationRouter() {
  const router = express.Router();

  router.get('/v1/conversations/tools', asyncHandler(async (_req, res) => {
    res.json({
      items: listConversationTools(),
      count: listConversationTools().length
    });
  }));

  router.get('/v1/conversations/artifacts/:artifactId', asyncHandler(async (req, res) => {
    const response = await getConversationArtifactStatus({
      artifactId: String(req.params.artifactId),
      integrationAccountId: toOptionalQueryString(req.query?.integrationAccountId),
      sessionContextId: toOptionalQueryString(req.query?.sessionContextId)
    });

    res.json(response);
  }));

  router.get('/v1/conversations/artifacts/:artifactId/content', asyncHandler(async (req, res) => {
    const artifact = await getConversationArtifactContent({
      artifactId: String(req.params.artifactId),
      integrationAccountId: toOptionalQueryString(req.query?.integrationAccountId),
      sessionContextId: toOptionalQueryString(req.query?.sessionContextId)
    });

    res.setHeader('Content-Type', artifact.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    fs.createReadStream(artifact.storagePath).pipe(res);
  }));

  router.post('/v1/conversations/turns', asyncHandler(async (req, res) => {
    // Instrumentação F0 (latência/outcome do turno) — só telemetria.
    const startedAt = Date.now();
    try {
      const response = await conversationService.processTurn({
        body: req.body || {},
        correlationId: getCorrelationId(req),
        headers: toHeaderMap(req.headers || {}),
        idempotencyKey: toSingleString(req.headers['idempotency-key'])
      });

      aiMetrics.observeTurn('turn', response?.status === 'failed' ? 'error' : 'ok', (Date.now() - startedAt) / 1000);
      res.json(response);
    } catch (error) {
      aiMetrics.observeTurn('turn', 'error', (Date.now() - startedAt) / 1000);
      throw error;
    }
  }));

  return router;
}
