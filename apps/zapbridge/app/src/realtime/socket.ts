import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH, getToken } from '../api/client';

let socket: Socket | null = null;

// Conecta (uma única instância) com o JWT no handshake.
// Usa a ORIGEM (SOCKET_URL) + path (SOCKET_PATH) — atrás do Traefik em subpath,
// path = /zapbridge/socket.io; em dev local, /socket.io.
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const token = await getToken();
  socket = io(SOCKET_URL, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
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
