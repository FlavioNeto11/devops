import axios from 'axios';
import Constants from 'expo-constants';
import { storageGet, storageSet, storageDelete } from '../storage/tokenStore';

const extra = (Constants.expoConfig?.extra as any) ?? {};

export const API_URL: string = extra.apiUrl ?? 'http://192.168.0.10:3000';

// Origem do WebSocket (sem o subpath /api). Default: origem da API.
export const SOCKET_URL: string =
  extra.socketUrl ?? API_URL.replace(/\/zapbridge\/api$/, '').replace(/\/api$/, '');

// Path do Socket.IO. Default /socket.io (dev local).
export const SOCKET_PATH: string = extra.socketPath ?? '/socket.io';

// URL de mídia com token na query (para <img>/<video>/<audio>, que não enviam header).
export async function mediaUrl(mediaId: string): Promise<string> {
  const token = await getToken();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/media/${mediaId}${q}`;
}

const TOKEN_KEY = 'zapbridge.token';

export async function getToken(): Promise<string | null> {
  return storageGet(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await storageSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storageDelete(TOKEN_KEY);
}

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// Injeta o JWT em toda requisição.
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Extrai mensagem de erro amigável.
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as any)?.error ?? e.message ?? 'Erro de rede';
  }
  return e instanceof Error ? e.message : 'Erro desconhecido';
}
