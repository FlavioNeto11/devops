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

  // ---------------------------------------------------------------- IA (opt-in)
  // Tudo opcional: sem chaves/banco, a camada de IA fica desligada e o app sobe normal.
  ai: {
    // Postgres dedicado (pgvector). Sem isto, threads/memória/embeddings/RAG ficam off.
    databaseUrl: process.env.AI_DATABASE_URL,
    // Provider de reasoning. Default Claude (padrão da plataforma).
    provider: (process.env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',
    // Embeddings SEMPRE OpenAI (Anthropic não expõe /embeddings).
    openaiApiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.AI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small',
    // Grafo de agente (router→ReAct→judge). 'on' liga o assistente com tools.
    graph: (process.env.AI_GRAPH ?? 'off').trim().toLowerCase() === 'on',
    // Sugestões de resposta ao receber mensagem. 'off' desliga só essa feature.
    suggest: (process.env.AI_SUGGEST ?? 'on').trim().toLowerCase() !== 'off',
    metricsPort: Number(process.env.METRICS_PORT ?? 9464),
    // Governança de prompts (ai-control-plane) — opcional.
    controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL,
    controlPlaneToken: process.env.AI_CONTROL_PLANE_TOKEN,
  },
};
