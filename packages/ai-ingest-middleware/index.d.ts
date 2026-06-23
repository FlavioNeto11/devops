import type { RequestHandler } from 'express';
import type { IngestResult, IngestOpts } from '@flavioneto11/file-ingest-kit';
export interface AttachIngestOpts { field?: string; maxFiles?: number; maxBytes?: number; ingest?: IngestOpts; }
export interface ReqIngested extends IngestResult { text: string; error?: string | null; }
export function attachIngest(opts?: AttachIngestOpts): RequestHandler;
export function feedBlocks(messages: Array<Record<string, unknown>>, ingested: ReqIngested | null, o?: { provider?: 'anthropic' | 'openai'; model?: string }): Array<Record<string, unknown>>;
