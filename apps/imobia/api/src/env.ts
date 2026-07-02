// Configuracao central do imobia (Zod). DB e' obrigatorio em F1+; IA, Keycloak, Redis e
// integracoes externas sao OPCIONAIS e fail-soft (o app sobe e degrada sem elas).
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(8080),
  WORKER_PORT: z.coerce.number().default(8081),

  // Persistencia
  DATABASE_URL: z.string().default(''),
  REDIS_URL: z.string().default(''),

  // Sessao / auth
  JWT_SECRET: z.string().default('dev-insecure-imobia-secret-change-me'),
  ACCESS_TTL_SECONDS: z.coerce.number().default(60 * 60 * 12), // 12h

  // Keycloak SSO (realm nvit) — opcional/fail-soft
  KEYCLOAK_USERINFO_URL: z.string().default(''),
  KEYCLOAK_ISSUER: z.string().default(''),

  // IA — opcional/fail-soft (acende por provider)
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  GOOGLE_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),

  // Armazenamento de arquivos (PVC)
  STORAGE_DIR: z.string().default('/data/files'),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  isProd: parsed.NODE_ENV === 'production',
  googleApiKey: parsed.GOOGLE_API_KEY || parsed.GEMINI_API_KEY,
  hasDb: Boolean(parsed.DATABASE_URL),
  hasRedis: Boolean(parsed.REDIS_URL),
  hasKeycloak: Boolean(parsed.KEYCLOAK_USERINFO_URL),
};

/** Estado dos provedores de IA — exposto por /health e /meta. */
export function aiProviders() {
  return {
    cortex: Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY),
    gpt: Boolean(env.OPENAI_API_KEY),
    claude: Boolean(env.ANTHROPIC_API_KEY),
    gemini: Boolean(env.googleApiKey),
  };
}
