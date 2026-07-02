import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthTokenPayload } from '../types';

let io: IOServer | null = null;

// Nome da room por usuário — isola os eventos de cada sessão.
const userRoom = (userId: string) => `user:${userId}`;

export function initIO(server: HttpServer): IOServer {
  io = new IOServer(server, {
    path: env.socketIoPath,
    cors: { origin: env.corsOrigin },
    // Pings a cada 20s mantêm a conexão viva através do Traefik/Cloudflare (timeout ~100s).
    pingInterval: 20000,
    pingTimeout: 10000,
  });

  // Autenticação do handshake via JWT (auth.token).
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    socket.on('disconnect', () => {
      // Sem estado a limpar no MVP.
    });
  });

  return io;
}

// Emite um evento para todas as conexões de um usuário.
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.IO não inicializado');
  return io;
}
