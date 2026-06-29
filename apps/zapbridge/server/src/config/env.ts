import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required('JWT_SECRET', 'dev-secret-troque-em-producao'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  databaseUrl: required('DATABASE_URL', 'file:./dev.db'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  authDir: path.resolve(process.cwd(), process.env.AUTH_DIR ?? 'storage/auth'),
  mediaDir: path.resolve(process.cwd(), process.env.MEDIA_DIR ?? 'storage/media'),
  // Path do Socket.IO. Atrás do Traefik em subpath, use ex.: /zapbridge/socket.io.
  socketIoPath: process.env.SOCKET_IO_PATH ?? '/socket.io',
};
