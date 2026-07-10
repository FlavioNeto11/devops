// Configuracao da fundacao (Fase 0). Tudo por env; nada sensivel hardcoded.
// A fundacao (auth/RBAC/auditoria) so liga quando DATABASE_URL + SESSION_SECRET
// existem; sem eles o portal publico segue no ar e as rotas gated respondem 503
// (fail-closed p/ escrita, fail-soft p/ leitura publica).
export const config = {
  port: process.env.PORT || 8080,
  dataDir: process.env.DATA_DIR || null,
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  autoMigrate: (process.env.AUTO_MIGRATE || 'true') !== 'false',
  bootstrapEmail: process.env.BESC_BOOTSTRAP_EMAIL || '',
  bootstrapPassword: process.env.BESC_BOOTSTRAP_PASSWORD || '',
  // Keycloak realm dedicado `besc` (client publico PKCE, sem secret — padrao SICAT)
  keycloakIssuerPublic: process.env.KEYCLOAK_ISSUER_PUBLIC || '',   // ex.: https://dev.nvit.com.br/auth/realms/besc
  keycloakUserinfoUrl: process.env.KEYCLOAK_USERINFO_URL || '',     // URL interna (split-horizon)
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || 'besc-spa',
  corsOrigins: (process.env.CORS_ORIGINS || 'https://dev.nvit.com.br,http://nvit.localhost,http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  accessTokenTtlSeconds: parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '3600', 10),
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
};

export function foundationEnabled() {
  return !!(config.databaseUrl && config.sessionSecret);
}
