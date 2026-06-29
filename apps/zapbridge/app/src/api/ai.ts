// Cliente das rotas de IA do ZapBridge (reusa o axios `api` com o JWT injetado).
import { api } from './client';

export interface AiSettings {
  consented: boolean;
  consentVersion: string | null;
  tone: string;
  language: string;
  includeGroups: boolean;
  suggestionsEnabled: boolean;
  autoreply: Record<string, unknown>;
}

export interface AssistantResult {
  text: string;
  route: string;
  proposed: boolean;
  citations: Array<{ tool: string; output: unknown }>;
  proposals: Array<{ token: string; name: string; arguments: Record<string, unknown> }>;
}

export interface SearchHit {
  messageId: string;
  chatId: string | null;
  chatName: string | null;
  fromMe: boolean;
  text: string;
  ts: string;
  score: number;
}

export interface KbSource {
  sourceId: string;
  name: string;
  chunks: number;
  ingestedAt: string;
}

export const aiApi = {
  getConsent: () => api.get('/ai/consent').then((r) => r.data as { version: string; settings: AiSettings }),
  accept: (scope: Partial<AiSettings>) => api.post('/ai/consent', scope).then((r) => r.data.settings as AiSettings),
  revoke: () => api.post('/ai/consent/revoke').then((r) => r.data),
  updateSettings: (patch: Partial<AiSettings>) => api.put('/ai/settings', patch).then((r) => r.data.settings as AiSettings),
  purge: () => api.post('/ai/data/purge').then((r) => r.data),

  suggest: (chatId: string) =>
    api.post(`/chats/${chatId}/ai/suggest`).then((r) => r.data as { suggestions: string[]; styleApplied: boolean }),
  rewrite: (text: string, mode: string) => api.post('/ai/rewrite', { text, mode }).then((r) => r.data.variants as string[]),
  summary: (chatId: string) => api.get(`/chats/${chatId}/ai/summary`).then((r) => r.data as { bullets: string[]; count: number }),
  triage: (chatId: string) => api.get(`/chats/${chatId}/ai/triage`).then((r) => r.data as { priority: string; reason: string }),
  learnStyle: (chatId: string) => api.post(`/chats/${chatId}/ai/learn-style`).then((r) => r.data),

  chatSettings: (chatId: string) =>
    api.get(`/chats/${chatId}/ai/settings`).then((r) => r.data as { excluded: boolean; autoreplyEnabled: boolean }),
  setChatSettings: (chatId: string, patch: { excluded?: boolean; autoreplyEnabled?: boolean }) =>
    api.put(`/chats/${chatId}/ai/settings`, patch).then((r) => r.data as { excluded: boolean; autoreplyEnabled: boolean }),

  search: (q: string) => api.get('/ai/search', { params: { q } }).then((r) => r.data as { query: string; hits: SearchHit[] }),
  assistant: (message: string) => api.post('/ai/assistant', { message }).then((r) => r.data as AssistantResult),
  confirm: (token: string) => api.post('/ai/confirm', { token }).then((r) => r.data),
  understandMedia: (messageId: string) =>
    api.post(`/ai/media/${messageId}/understand`).then((r) => r.data as { understanding: string }),

  kbList: () => api.get('/ai/kb').then((r) => r.data.sources as KbSource[]),
  kbAddText: (name: string, text: string) => api.post('/ai/kb', { name, text }).then((r) => r.data),
  kbRemove: (sid: string) => api.delete(`/ai/kb/${encodeURIComponent(sid)}`).then((r) => r.data),
};
