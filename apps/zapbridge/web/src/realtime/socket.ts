import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH, getToken } from '../api/client';

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
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
