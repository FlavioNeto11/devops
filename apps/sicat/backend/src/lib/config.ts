import 'dotenv/config';

function toBool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
}

function toList(value: unknown, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Mutable overrides for testing
type ConfigKey =
  | 'port'
  | 'nodeEnv'
  | 'authRequired'
  | 'openApiFile'
  | 'databaseUrl'
  | 'databaseSsl'
  | 'autoMigrate'
  | 'autoSeed'
  | 'storageDir'
  | 'workerPollIntervalMs'
  | 'workerBatchSize'
  | 'workerClaimStaleTimeoutMs'
  | 'workerClaimHeartbeatMs'
  | 'jobMaxAttempts'
  | 'cetesbGatewayMode'
  | 'cetesbBaseUrl'
  | 'cetesbApiBaseUrl'
  | 'cetesbPortalOrigin'
  | 'cetesbPortalReferer'
  | 'cetesbUserAgent'
  | 'cetesbRequestTimeoutMs'
  | 'cetesbRetryAttempts'
  | 'cetesbRetryBackoffBaseMs'
  | 'cetesbRetryBackoffMaxMs'
  | 'cetesbTokenHeaderMode'
  | 'cetesbTokenRefreshSkewSeconds'
  | 'cetesbManifestSearchStatusFilter'
  | 'cetesbManifestSearchDaysBack'
  | 'cetesbManifestForceSyncDaysBack'
  | 'cetesbDefaultStateCode'
  | 'cetesbDefaultPackagingTieCodigo'
  | 'cetesbResidueSearchSeedTerms'
  | 'cetesbCatalogThrottleMs'
  | 'sicatAccessTokenSecret'
  | 'sicatAccessTokenTtlSeconds'
  | 'sicatRefreshTokenTtlSeconds'
  | 'sicatCetesbPasswordSecret'
  | 'sicatBootstrapEmail'
  | 'sicatBootstrapPassword'
  | 'sicatBootstrapName';

const configOverrides: Partial<Record<ConfigKey, unknown>> = {};

export function setConfigOverride(key: ConfigKey, value: unknown): void {
  configOverrides[key] = value;
}

function getConfigValue<T>(key: ConfigKey, defaultValue: T): T {
  if (configOverrides[key] !== undefined) return configOverrides[key] as T;
  return defaultValue;
}

function resolveCetesbGatewayMode(): 'real' {
  const raw = String(process.env.CETESB_GATEWAY_MODE || 'real').trim().toLowerCase();
  if (raw === 'real') return 'real';
  if (raw === 'mock') {
    throw new Error('CETESB_GATEWAY_MODE=mock foi descontinuado. Utilize somente CETESB_GATEWAY_MODE=real.');
  }
  throw new Error(`CETESB_GATEWAY_MODE invalido: ${raw}. Valor aceito: real.`);
}

export const config = {
  get port() { return getConfigValue('port', Number(process.env.PORT || 8080)); },
  get nodeEnv() { return getConfigValue('nodeEnv', process.env.NODE_ENV || 'development'); },
  get authRequired() { return getConfigValue('authRequired', toBool(process.env.AUTH_REQUIRED, false)); },
  get openApiFile() { return getConfigValue('openApiFile', process.env.OPENAPI_FILE || './openapi/mtr_automacao_openapi_interna.yaml'); },
  get databaseUrl() { return getConfigValue('databaseUrl', process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mtr_automation'); },
  get databaseSsl() { return getConfigValue('databaseSsl', toBool(process.env.DATABASE_SSL, false)); },
  get autoMigrate() { return getConfigValue('autoMigrate', toBool(process.env.AUTO_MIGRATE, true)); },
  get autoSeed() { return getConfigValue('autoSeed', toBool(process.env.AUTO_SEED, true)); },
  get storageDir() { return getConfigValue('storageDir', process.env.STORAGE_DIR || './storage'); },
  get workerPollIntervalMs() { return getConfigValue('workerPollIntervalMs', Number(process.env.WORKER_POLL_INTERVAL_MS || 2000)); },
  get workerBatchSize() { return getConfigValue('workerBatchSize', Number(process.env.WORKER_BATCH_SIZE || 10)); },
  get workerClaimStaleTimeoutMs() { return getConfigValue('workerClaimStaleTimeoutMs', Number(process.env.WORKER_CLAIM_STALE_TIMEOUT_MS || 300000)); },
  get workerClaimHeartbeatMs() { return getConfigValue('workerClaimHeartbeatMs', Number(process.env.WORKER_CLAIM_HEARTBEAT_MS || 15000)); },
  get jobMaxAttempts() { return getConfigValue('jobMaxAttempts', Number(process.env.JOB_MAX_ATTEMPTS || 5)); },
  get cetesbGatewayMode() { return getConfigValue('cetesbGatewayMode', resolveCetesbGatewayMode()); },
  get cetesbBaseUrl() { return getConfigValue('cetesbBaseUrl', process.env.CETESB_BASE_URL || 'https://mtrr.cetesb.sp.gov.br'); },
  get cetesbApiBaseUrl() { return getConfigValue('cetesbApiBaseUrl', process.env.CETESB_API_BASE_URL || 'https://mtrr.cetesb.sp.gov.br'); },
  get cetesbPortalOrigin() { return getConfigValue('cetesbPortalOrigin', process.env.CETESB_PORTAL_ORIGIN || 'https://mtr.cetesb.sp.gov.br'); },
  get cetesbPortalReferer() { return getConfigValue('cetesbPortalReferer', process.env.CETESB_PORTAL_REFERER || 'https://mtr.cetesb.sp.gov.br/'); },
  get cetesbUserAgent() { return getConfigValue('cetesbUserAgent', process.env.CETESB_USER_AGENT || 'mtr-automation-node/3.0'); },
  get cetesbRequestTimeoutMs() { return getConfigValue('cetesbRequestTimeoutMs', Number(process.env.CETESB_REQUEST_TIMEOUT_MS || 30000)); },
  get cetesbRetryAttempts() { return getConfigValue('cetesbRetryAttempts', Number(process.env.CETESB_RETRY_ATTEMPTS || 3)); },
  get cetesbRetryBackoffBaseMs() { return getConfigValue('cetesbRetryBackoffBaseMs', Number(process.env.CETESB_RETRY_BACKOFF_BASE_MS || 250)); },
  get cetesbRetryBackoffMaxMs() { return getConfigValue('cetesbRetryBackoffMaxMs', Number(process.env.CETESB_RETRY_BACKOFF_MAX_MS || 3000)); },
  get cetesbTokenHeaderMode() { return getConfigValue('cetesbTokenHeaderMode', process.env.CETESB_TOKEN_HEADER_MODE || 'both'); },
  get cetesbTokenRefreshSkewSeconds() { return getConfigValue('cetesbTokenRefreshSkewSeconds', Number(process.env.CETESB_TOKEN_REFRESH_SKEW_SECONDS || 120)); },
  get cetesbManifestSearchStatusFilter() { return getConfigValue('cetesbManifestSearchStatusFilter', Number(process.env.CETESB_MANIFEST_SEARCH_STATUS_FILTER || 0)); }, // 0 = todos os status
  get cetesbManifestSearchDaysBack() { return getConfigValue('cetesbManifestSearchDaysBack', Number(process.env.CETESB_MANIFEST_SEARCH_DAYS_BACK || 30)); },
  get cetesbManifestForceSyncDaysBack() { return getConfigValue('cetesbManifestForceSyncDaysBack', Number(process.env.CETESB_MANIFEST_FORCE_SYNC_DAYS_BACK || 1)); },
  get cetesbDefaultStateCode() { return getConfigValue('cetesbDefaultStateCode', Number(process.env.CETESB_DEFAULT_STATE_CODE || 26)); },
  get cetesbDefaultPackagingTieCodigo() { return getConfigValue('cetesbDefaultPackagingTieCodigo', Number(process.env.CETESB_DEFAULT_PACKAGING_TIE_CODIGO || 4)); },
  get cetesbResidueSearchSeedTerms() { return getConfigValue('cetesbResidueSearchSeedTerms', toList(process.env.CETESB_RESIDUE_SEARCH_SEED_TERMS, ['Classe A'])); },
  get cetesbCatalogThrottleMs() { return getConfigValue('cetesbCatalogThrottleMs', Number(process.env.CETESB_CATALOG_THROTTLE_MS || 150)); },
  get sicatAccessTokenSecret() { return getConfigValue('sicatAccessTokenSecret', process.env.SICAT_ACCESS_TOKEN_SECRET || 'dev-only-sicat-access-secret-change-me-2026'); },
  get sicatAccessTokenTtlSeconds() { return getConfigValue('sicatAccessTokenTtlSeconds', Number(process.env.SICAT_ACCESS_TOKEN_TTL_SECONDS || 3600)); },
  get sicatRefreshTokenTtlSeconds() { return getConfigValue('sicatRefreshTokenTtlSeconds', Number(process.env.SICAT_REFRESH_TOKEN_TTL_SECONDS || 1209600)); },
  get sicatCetesbPasswordSecret() { return getConfigValue('sicatCetesbPasswordSecret', process.env.SICAT_CETESB_PASSWORD_SECRET || 'dev-only-cetesb-password-secret-change-me-2026'); },
  get sicatBootstrapEmail() { return getConfigValue('sicatBootstrapEmail', process.env.SICAT_BOOTSTRAP_EMAIL || ''); },
  get sicatBootstrapPassword() { return getConfigValue('sicatBootstrapPassword', process.env.SICAT_BOOTSTRAP_PASSWORD || ''); },
  get sicatBootstrapName() { return getConfigValue('sicatBootstrapName', process.env.SICAT_BOOTSTRAP_NAME || ''); }
};
