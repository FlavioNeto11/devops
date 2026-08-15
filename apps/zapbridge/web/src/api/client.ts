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

// Tratamento central de sessão expirada (401). O app registra um handler (via
// setUnauthorizedHandler) que limpa o usuário, leva ao /login e avisa. Evita o
// acoplamento circular entre este módulo (importado pelos stores) e os stores.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// Aciona o fluxo de sessão expirada: descarta o token e notifica o app. Usado
// tanto pelo interceptor HTTP quanto pelo erro de auth do socket (realtime).
export function handleUnauthorized(): void {
  clearToken();
  unauthorizedHandler?.();
}

// Em 401, distingue sessão expirada de falha de credenciais no login/registro
// (essas telas mostram o próprio erro). Só dispara o fluxo global quando havia
// token — ou seja, uma sessão que valia e deixou de valer.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');
      if (!isAuthCall && getToken()) handleUnauthorized();
    }
    return Promise.reject(error);
  },
);

// Mensagem de erro amigável.
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as any)?.error ?? e.message ?? 'Erro de rede';
  }
  return e instanceof Error ? e.message : 'Erro desconhecido';
}
