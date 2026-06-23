// @flavioneto11/file-ingest-kit — tipos públicos.
export interface InputFile { filename: string; mime?: string; bytes: Buffer | Uint8Array | string; }
export interface IngestOpts {
  maxFileBytes?: number; maxFiles?: number; maxTotalChars?: number; perFileChars?: number;
  csvMaxRows?: number; xlsxMaxRowsPerSheet?: number; xlsxMaxSheets?: number;
  zipMaxDepth?: number; zipMaxEntries?: number; zipMaxTotalUncompressedBytes?: number;
  dropImagesIfNoVision?: boolean;
}
export interface TextPart { name: string; text: string; source: string; truncated: boolean; }
export interface MediaBlock { type: 'image' | 'document'; name: string; mediaType: string; dataBase64: string; }
export interface ManifestRow { path: string; type: string; bytes: number; chars: number; status: 'ok' | 'truncated' | 'skipped' | 'unsupported' | 'name-only' | 'image' | 'error'; }
export interface IngestResult { textParts: TextPart[]; blocks: MediaBlock[]; manifest: ManifestRow[]; notes: string[]; totalChars: number; truncated: boolean; warnings: string[]; }
export const DEFAULTS: Required<IngestOpts>;
export function ingest(files: InputFile[], opts?: IngestOpts): Promise<IngestResult>;
export function toMessageContent(result: IngestResult, o?: { provider?: 'anthropic' | 'openai'; supportsVision?: boolean; supportsPdf?: boolean; userText?: string; }): string | Array<Record<string, unknown>>;
export function estimateTokens(result: IngestResult): number;
export function supportsVision(model: string): boolean;
export function supportsPdf(model: string): boolean;
