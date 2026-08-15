import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH, getToken, handleUnauthorized } from '../api/client';

let socket: Socket | null = null;

// Conecta (instância única) com o JWT no handshake. ORIGEM + path — atrás do Traefik
// em subpath o path é /zapbridge/socket.io.
export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  if (socket) return socket;
  const token = getToken();
  socket = io(SOCKET_URL, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });
  // Sessão expirada também derruba o socket: se o handshake é recusado por auth
  // (token inválido/expirado), aciona o mesmo fluxo do 401 HTTP em vez de tentar
  // reconectar em silêncio para sempre. Heurística conservadora pela mensagem —
  // blips de rede (sem menção a auth) seguem no reconnect normal.
  socket.on('connect_error', (err: Error) => {
    const msg = String(err?.message ?? '').toLowerCase();
    if (getToken() && /auth|token|unauthor|jwt|forbidden/.test(msg)) {
      disconnectSocket();
      handleUnauthorized();
    }
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
