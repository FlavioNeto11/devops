import axios from 'axios';

// Config por ORIGEM: o backend fica sob /zapbridge/api (Traefik strip) na mesma origem.
// Em dev (vite :5173), o proxy encaminha /zapbridge/api e /zapbridge/socket.io → :3000.
export const API_URL = `${window.location.origin}/zapbridge/api`;
export const SOCKET_URL = window.location.origin;
export const SOCKET_PATH = '/zapbridge/socket.io';

const TOKEN_KEY = 'zapbridge.token';

// Token em localStorage (síncrono). Mantém assinaturas simples; os stores podem
// dar `await` normalmente (await de valor não-promise devolve o valor).
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// URL de mídia com token na query (para <img>/<video>/<audio>, que não mandam header).
export function mediaUrl(mediaId: string): string {
  const token = getToken();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/media/${mediaId}${q}`;
}

export const api = axios.create({ baseURL: API_URL, timeout: 20000 });

// Injeta o JWT em toda requisição.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mensagem de erro amigável.
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as any)?.error ?? e.message ?? 'Erro de rede';
  }
  return e instanceof Error ? e.message : 'Erro desconhecido';
}
