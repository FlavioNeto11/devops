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
  | 'sicatBootstrapName'
  | 'keycloakRealmUrl'
  | 'keycloakUserinfoUrl'
  | 'keycloakClientId'
  | 'whatsappProvider'
  | 'whatsappWebhookUrl'
  | 'whatsappTwilioAccountSid'
  | 'whatsappTwilioAuthToken'
  | 'whatsappTwilioFrom'
  | 'whatsappMetaPhoneNumberId'
  | 'whatsappMetaAccessToken'
  | 'whatsappMetaAppSecret'
  | 'whatsappMetaVerifyToken'
  | 'whatsappMetaGraphVersion'
  | 'channelLinkOtpTtlSeconds'
  | 'channelLinkOtpMaxAttempts'
  | 'channelLinkOtpMaxSends'
  | 'channelLinkOtpResendCooldownSeconds'
  | 'channelLinkMaxPerUser'
  | 'channelLinkVictimShieldDistinctUsers'
  | 'channelLinkVictimShieldWindowHours'
  | 'channelLinkAllowTransfer'
  | 'channelLinkDefaultCountryCode'
  | 'whatsappLinkOtpTemplate'
  | 'whatsappLinkOtpTemplateLanguage'
  | 'whatsappBusinessNumber'
  | 'whatsappInboundMaxMessagesPerPost'
  | 'whatsappInboundMaxAgeSeconds'
  | 'whatsappAnswerMaxAgeSeconds'
  | 'whatsappInboundGlobalPerMinute'
  | 'whatsappInboundPerLink'
  | 'whatsappInboundPerLinkWindowMs'
  | 'whatsappInboundMaxTextChars'
  | 'whatsappReplyMaxChars'
  | 'whatsappTurnTimeoutMs'
  | 'whatsappMaxSendAttempts'
  | 'whatsappProviderTimeoutMs'
  | 'whatsappProviderUploadTimeoutMs'
  | 'whatsappExpiredNoticeWindowMs'
  | 'whatsappUnlinkedNoticeEnabled';

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
  get sicatBootstrapName() { return getConfigValue('sicatBootstrapName', process.env.SICAT_BOOTSTRAP_NAME || ''); },
  // Keycloak SSO (login PROPRIO do SICAT via OIDC). NAO afeta a auth SIGOR/CETESB.
  get keycloakRealmUrl() { return getConfigValue('keycloakRealmUrl', process.env.KEYCLOAK_REALM_URL || 'https://dev.nvit.com.br/auth/realms/nvit'); },
  get keycloakUserinfoUrl() { return getConfigValue('keycloakUserinfoUrl', process.env.KEYCLOAK_USERINFO_URL || `${process.env.KEYCLOAK_REALM_URL || 'https://dev.nvit.com.br/auth/realms/nvit'}/protocol/openid-connect/userinfo`); },
  get keycloakClientId() { return getConfigValue('keycloakClientId', process.env.KEYCLOAK_CLIENT_ID || 'sicat'); },
  // Canal WhatsApp (cadeia `whatsapp-channel-sicat`). Default DESLIGADO: o canal só existe onde foi
  // explicitamente configurado. `twilio` = dev/homolog (sandbox), `meta` = produção (Cloud API).
  get whatsappProvider() { return getConfigValue('whatsappProvider', process.env.WHATSAPP_PROVIDER || 'disabled'); },
  /** URL pública do webhook, como o provedor a enxerga. Entra no HMAC do Twilio — se divergir, a assinatura não bate. */
  get whatsappWebhookUrl() { return getConfigValue('whatsappWebhookUrl', process.env.WHATSAPP_WEBHOOK_URL || 'https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook'); },
  get whatsappTwilioAccountSid() { return getConfigValue('whatsappTwilioAccountSid', process.env.WHATSAPP_TWILIO_ACCOUNT_SID || ''); },
  get whatsappTwilioAuthToken() { return getConfigValue('whatsappTwilioAuthToken', process.env.WHATSAPP_TWILIO_AUTH_TOKEN || ''); },
  get whatsappTwilioFrom() { return getConfigValue('whatsappTwilioFrom', process.env.WHATSAPP_TWILIO_FROM || ''); },
  get whatsappMetaPhoneNumberId() { return getConfigValue('whatsappMetaPhoneNumberId', process.env.WHATSAPP_META_PHONE_NUMBER_ID || ''); },
  get whatsappMetaAccessToken() { return getConfigValue('whatsappMetaAccessToken', process.env.WHATSAPP_META_ACCESS_TOKEN || ''); },
  /** Segredo do app Meta — assina o webhook (X-Hub-Signature-256). Sem ele a verificação é fail-closed. */
  get whatsappMetaAppSecret() { return getConfigValue('whatsappMetaAppSecret', process.env.WHATSAPP_META_APP_SECRET || ''); },
  /** Token do desafio de verificação do webhook (GET hub.verify_token). */
  get whatsappMetaVerifyToken() { return getConfigValue('whatsappMetaVerifyToken', process.env.WHATSAPP_META_VERIFY_TOKEN || ''); },
  get whatsappMetaGraphVersion() { return getConfigValue('whatsappMetaGraphVersion', process.env.WHATSAPP_META_GRAPH_VERSION || 'v21.0'); },
  // Vínculo telefone <-> usuário por OTP (fase 2 da cadeia `whatsapp-channel-sicat`).
  // O TTL aparece LITERAL no texto do template: mudar um obriga a mudar o outro.
  get channelLinkOtpTtlSeconds() { return getConfigValue('channelLinkOtpTtlSeconds', Number(process.env.CHANNEL_LINK_OTP_TTL_SECONDS || 600)); },
  get channelLinkOtpMaxAttempts() { return getConfigValue('channelLinkOtpMaxAttempts', Number(process.env.CHANNEL_LINK_OTP_MAX_ATTEMPTS || 5)); },
  get channelLinkOtpMaxSends() { return getConfigValue('channelLinkOtpMaxSends', Number(process.env.CHANNEL_LINK_OTP_MAX_SENDS || 3)); },
  get channelLinkOtpResendCooldownSeconds() { return getConfigValue('channelLinkOtpResendCooldownSeconds', Number(process.env.CHANNEL_LINK_OTP_RESEND_COOLDOWN_SECONDS || 60)); },
  get channelLinkMaxPerUser() { return getConfigValue('channelLinkMaxPerUser', Number(process.env.CHANNEL_LINK_MAX_PER_USER || 3)); },
  /** Contas DISTINTAS que podem pedir código para o MESMO número na janela — escudo anti-bombing da vítima. */
  get channelLinkVictimShieldDistinctUsers() { return getConfigValue('channelLinkVictimShieldDistinctUsers', Number(process.env.CHANNEL_LINK_VICTIM_SHIELD_DISTINCT_USERS || 3)); },
  get channelLinkVictimShieldWindowHours() { return getConfigValue('channelLinkVictimShieldWindowHours', Number(process.env.CHANNEL_LINK_VICTIM_SHIELD_WINDOW_HOURS || 24)); },
  /**
   * Posse comprovada TRANSFERE o vínculo. Desligar é a opção INSEGURA no longo prazo: operadoras
   * reciclam números e, a partir da fase 3, um `from` verificado vira identidade — o novo dono do
   * chip entraria como o usuário antigo. Default ligado; `false` só como trava de emergência.
   */
  get channelLinkAllowTransfer() { return getConfigValue('channelLinkAllowTransfer', String(process.env.CHANNEL_LINK_ALLOW_TRANSFER ?? 'true').trim().toLowerCase() !== 'false'); },
  get channelLinkDefaultCountryCode() { return getConfigValue('channelLinkDefaultCountryCode', process.env.CHANNEL_LINK_DEFAULT_COUNTRY_CODE || '55'); },
  /**
   * Nome do template AUTHENTICATION aprovado (Meta) ou Content SID `HX…` (Twilio). Quando não é um
   * SID, o adapter Twilio renderiza `{{1}}` no próprio corpo — por isso o default é o texto pt-BR,
   * que mantém dev/homolog funcionando sem aprovação de conteúdo.
   */
  get whatsappLinkOtpTemplate() {
    return getConfigValue(
      'whatsappLinkOtpTemplate',
      process.env.WHATSAPP_LINK_OTP_TEMPLATE
        || 'SICAT: seu código de verificação é {{1}}. Vale por 10 minutos, é de uso único. Se não foi você, ignore esta mensagem e nunca compartilhe este código.'
    );
  },
  get whatsappLinkOtpTemplateLanguage() { return getConfigValue('whatsappLinkOtpTemplateLanguage', process.env.WHATSAPP_LINK_OTP_TEMPLATE_LANGUAGE || 'pt_BR'); },
  // ── Webhook de entrada do canal (fase 3 da cadeia `whatsapp-channel-sicat`) ──────────────────────
  /**
   * Número de negócio que este SICAT atende, em E.164 sem `+`. Numa WABA/subconta COMPARTILHADA, uma
   * mensagem endereçada a OUTRO número da mesma app chega validamente assinada — o `to` é a única
   * coisa que distingue. Vazio = guarda pulada (com WARN no boot), porque exigir a variável quebraria
   * qualquer ambiente de sandbox que ainda não conhece o próprio número.
   */
  get whatsappBusinessNumber() { return getConfigValue('whatsappBusinessNumber', process.env.WHATSAPP_BUSINESS_NUMBER || ''); },
  /** Teto de mensagens processadas por POST. Um corpo assinado de 2 MB pode conter milhares. */
  get whatsappInboundMaxMessagesPerPost() { return getConfigValue('whatsappInboundMaxMessagesPerPost', Number(process.env.WHATSAPP_INBOUND_MAX_MESSAGES_PER_POST || 20)); },
  /** Frescor da mensagem na RECEPÇÃO. 24 h = a própria janela de atendimento do WhatsApp. */
  get whatsappInboundMaxAgeSeconds() { return getConfigValue('whatsappInboundMaxAgeSeconds', Number(process.env.WHATSAPP_INBOUND_MAX_AGE_SECONDS || 86400)); },
  /** Frescor na EXECUÇÃO. Responder 10 minutos depois é pior que não responder. */
  get whatsappAnswerMaxAgeSeconds() { return getConfigValue('whatsappAnswerMaxAgeSeconds', Number(process.env.WHATSAPP_ANSWER_MAX_AGE_SECONDS || 300)); },
  get whatsappInboundGlobalPerMinute() { return getConfigValue('whatsappInboundGlobalPerMinute', Number(process.env.WHATSAPP_INBOUND_GLOBAL_PER_MINUTE || 600)); },
  get whatsappInboundPerLink() { return getConfigValue('whatsappInboundPerLink', Number(process.env.WHATSAPP_INBOUND_PER_LINK || 12)); },
  get whatsappInboundPerLinkWindowMs() { return getConfigValue('whatsappInboundPerLinkWindowMs', Number(process.env.WHATSAPP_INBOUND_PER_LINK_WINDOW_MS || 300000)); },
  get whatsappInboundMaxTextChars() { return getConfigValue('whatsappInboundMaxTextChars', Number(process.env.WHATSAPP_INBOUND_MAX_TEXT_CHARS || 2000)); },
  /** Acima de ~4096 o provedor REJEITA a mensagem e o usuário fica MUDO. Truncar é correção, não estética. */
  get whatsappReplyMaxChars() { return getConfigValue('whatsappReplyMaxChars', Number(process.env.WHATSAPP_REPLY_MAX_CHARS || 3500)); },
  /** Teto do turno no worker. Folgadamente abaixo de `workerClaimStaleTimeoutMs` (300 s), senão o claim fica stale e o turno roda DUAS vezes. */
  get whatsappTurnTimeoutMs() { return getConfigValue('whatsappTurnTimeoutMs', Number(process.env.WHATSAPP_TURN_TIMEOUT_MS || 120000)); },
  get whatsappMaxSendAttempts() { return getConfigValue('whatsappMaxSendAttempts', Number(process.env.WHATSAPP_MAX_SEND_ATTEMPTS || 2)); },
  /**
   * Teto de UMA chamada HTTP ao provedor (envio de texto/template). Sem ele, um `fetch` que abre a
   * conexão e nunca responde prende o worker INTEIRO: o teto de turno (`whatsappTurnTimeoutMs`) só
   * envolve `processTurn`, e o heartbeat de claim mantém o job vivo. Enquanto `WORKER_LANE` não
   * estiver aplicado, esse worker é o mesmo que processa `manifest.submit` — um travamento da Meta
   * pararia a emissão de MTR. Conservador de propósito: a Graph API responde em < 2 s no normal.
   */
  get whatsappProviderTimeoutMs() { return getConfigValue('whatsappProviderTimeoutMs', Number(process.env.WHATSAPP_PROVIDER_TIMEOUT_MS || 15000)); },
  /** Teto do upload de mídia (bytes na rede). Maior que o de texto, ainda MUITO abaixo do claim stale (300 s). */
  get whatsappProviderUploadTimeoutMs() { return getConfigValue('whatsappProviderUploadTimeoutMs', Number(process.env.WHATSAPP_PROVIDER_UPLOAD_TIMEOUT_MS || 30000)); },
  /**
   * Janela de supressão do aviso "sua mensagem expirou" POR VÍNCULO. Um worker que volta depois de 6
   * minutos drena o backlog inteiro de uma vez; sem esta janela a pessoa receberia um aviso por
   * mensagem enfileirada. Um aviso por janela diz a mesma coisa sem virar flood.
   */
  get whatsappExpiredNoticeWindowMs() { return getConfigValue('whatsappExpiredNoticeWindowMs', Number(process.env.WHATSAPP_EXPIRED_NOTICE_WINDOW_MS || 600000)); },
  /**
   * Cortesia para número NÃO vinculado. Default **desligado**: responder é custo por mensagem contra
   * tráfego arbitrário e amplificação de spam. Quando ligado, o texto é IDÊNTICO para número
   * desconhecido, vínculo `pending` e telefone inválido — não vira oráculo de enumeração.
   */
  get whatsappUnlinkedNoticeEnabled() { return getConfigValue('whatsappUnlinkedNoticeEnabled', toBool(process.env.WHATSAPP_UNLINKED_NOTICE_ENABLED, false)); }
};
