import { resolveApiUrl } from '@/lib/api-url';

const API_URL = resolveApiUrl();

// Handler global de sessão expirada (UX-GYMOPS-007). Registrado pelo AuthBootstrap
// para levar o usuário ao /login com aviso quando o refresh token morre — em vez
// de deixar cada tela presa no genérico "Verifique sua conexão".
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;
let sessionExpiredNotified = false;

export function setSessionExpiredHandler(fn: SessionExpiredHandler | null) {
  sessionExpiredHandler = fn;
}

class ApiClient {
  private token: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  setToken(token: string | null) {
    this.token = token;
    // Novo token válido = sessão viva de novo; rearma o aviso de expiração.
    if (token) sessionExpiredNotified = false;
  }

  // Dispara o handler de sessão expirada uma única vez por sessão morta.
  private notifySessionExpired() {
    if (sessionExpiredNotified) return;
    sessionExpiredNotified = true;
    sessionExpiredHandler?.();
  }

  async refreshSession(): Promise<string | null> {
    return this.silentRefresh();
  }

  private async silentRefresh(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json() as { data?: { accessToken?: string } };
        const newToken = json.data?.accessToken ?? null;
        this.token = newToken;
        return newToken;
      })
      .catch(() => null)
      .finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const hadToken = this.token !== null;
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (res.status === 401 && retry) {
      const newToken = await this.silentRefresh();
      if (newToken) return this.request<T>(path, options, false);
      // Refresh falhou numa requisição autenticada → sessão expirada.
      if (hadToken) this.notifySessionExpired();
    }

    if (res.status === 204) return undefined as T;

    const json = await res.json() as T | { error: { code: string; message: string } };

    if (!res.ok) {
      const errBody = json as { error: { code: string; message: string } };
      throw new ApiError(res.status, errBody.error?.code ?? 'UNKNOWN', errBody.error?.message ?? 'Unknown error');
    }

    return json as T;
  }

  private async requestBlob(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<Blob> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    const hadToken = this.token !== null;
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (res.status === 401 && retry) {
      const newToken = await this.silentRefresh();
      if (newToken) return this.requestBlob(path, options, false);
      if (hadToken) this.notifySessionExpired();
    }

    if (!res.ok) {
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const json = await res.json() as { error?: { code?: string; message?: string } };
        throw new ApiError(
          res.status,
          json.error?.code ?? 'UNKNOWN',
          json.error?.message ?? 'Unknown error',
        );
      }

      const text = await res.text();
      throw new ApiError(res.status, 'DOWNLOAD_FAILED', text || 'Download failed');
    }

    return res.blob();
  }

  get<T>(path: string) { return this.request<T>(path); }
  getBlob(path: string) { return this.requestBlob(path); }
  post<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  patch<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }

  async postRaw<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const hadToken = this.token !== null;
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });

    if (res.status === 401) {
      const newToken = await this.silentRefresh();
      if (newToken) return this.postRaw<T>(path, body);
      if (hadToken) this.notifySessionExpired();
    }

    if (res.status === 204) return undefined as T;
    const json = await res.json() as T | { error: { code: string; message: string } };
    if (!res.ok) {
      const errBody = json as { error: { code: string; message: string } };
      throw new ApiError(res.status, errBody.error?.code ?? 'UNKNOWN', errBody.error?.message ?? 'Unknown error');
    }
    return json as T;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
