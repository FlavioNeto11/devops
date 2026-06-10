/**
 * video.ts — semântica ÚNICA de campo de vídeo do CMS (retrocompatível).
 *
 * O campo `youtubeId`/`videoId` (string) aceita:
 *   - ID do YouTube (11 chars)                      → { kind: 'youtube', id }
 *   - URL do YouTube (watch?v=, youtu.be, shorts,
 *     embed, live)                                  → { kind: 'youtube', id }
 *   - URL de arquivo enviado pelo CMS (/devops/...)
 *     ou URL http de vídeo                          → { kind: 'file', url }
 *   - vazio/indefinido                              → null ("vídeo em breve")
 *
 * Espelhado em console/frontend/src/components/cms/VideoPicker.jsx (JS) —
 * manter as duas cópias em sincronia.
 */
export type ResolvedVideo = { kind: 'youtube'; id: string } | { kind: 'file'; url: string } | null;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_URL = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export function resolveVideo(v: unknown): ResolvedVideo {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (YT_ID.test(s)) return { kind: 'youtube', id: s };
  const m = s.match(YT_URL);
  if (m) return { kind: 'youtube', id: m[1] };
  if (s.startsWith('/') || /^https?:\/\//i.test(s)) return { kind: 'file', url: s };
  return null;
}
