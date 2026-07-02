// =============================================================================
// Consentimento + preferências de IA (RN11). A IA é opt-in: sem ai_settings.consented,
// nenhuma rota /ai/* processa e nada é enviado a LLM/embeddings. Tudo no Postgres da IA
// (ai_settings / ai_chat_settings / ai_consent), sem migrar o SQLite do app.
// =============================================================================
import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from '../../types';
import { aiDbEnabled, query } from './pg';

export const CONSENT_VERSION = '1';

export interface AiSettings {
  consented: boolean;
  consentVersion: string | null;
  tone: string;
  language: string;
  includeGroups: boolean;
  suggestionsEnabled: boolean;
  autoreply: Record<string, unknown>;
}

const DEFAULTS: AiSettings = {
  consented: false,
  consentVersion: null,
  tone: 'neutro',
  language: 'pt-BR',
  includeGroups: false,
  suggestionsEnabled: true,
  autoreply: {},
};

interface SettingsRow {
  consented: boolean;
  consent_version: string | null;
  tone: string;
  language: string;
  include_groups: boolean;
  suggestions_enabled: boolean;
  autoreply: Record<string, unknown> | string;
}

export async function getSettings(userId: string): Promise<AiSettings> {
  if (!aiDbEnabled()) return DEFAULTS;
  try {
    const r = await query<SettingsRow>(
      `select consented, consent_version, tone, language, include_groups, suggestions_enabled, autoreply
         from ai_settings where user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return DEFAULTS;
    const autoreply = typeof row.autoreply === 'string' ? JSON.parse(row.autoreply || '{}') : row.autoreply || {};
    return {
      consented: Boolean(row.consented),
      consentVersion: row.consent_version,
      tone: row.tone ?? 'neutro',
      language: row.language ?? 'pt-BR',
      includeGroups: Boolean(row.include_groups),
      suggestionsEnabled: Boolean(row.suggestions_enabled),
      autoreply,
    };
  } catch {
    return DEFAULTS; // fail-soft: sem banco → IA off
  }
}

export async function isConsented(userId: string): Promise<boolean> {
  const s = await getSettings(userId);
  return s.consented && s.consentVersion === CONSENT_VERSION;
}

/** Registra o aceite (ai_consent = trilha; ai_settings = estado vivo). */
export async function acceptConsent(
  userId: string,
  scope: Partial<Pick<AiSettings, 'tone' | 'language' | 'includeGroups' | 'suggestionsEnabled'>> = {},
): Promise<AiSettings> {
  if (!aiDbEnabled()) throw Object.assign(new Error('IA indisponível (sem banco)'), { status: 503 });
  await query(
    `insert into ai_consent (user_id, version, scope) values ($1, $2, $3::jsonb)
       on conflict (user_id) do update set version = excluded.version, scope = excluded.scope, accepted_at = now()`,
    [userId, CONSENT_VERSION, JSON.stringify(scope)],
  );
  await query(
    `insert into ai_settings (user_id, consented, consent_version, tone, language, include_groups, suggestions_enabled, updated_at)
       values ($1, true, $2, $3, $4, $5, $6, now())
       on conflict (user_id) do update
         set consented = true, consent_version = excluded.consent_version, tone = excluded.tone,
             language = excluded.language, include_groups = excluded.include_groups,
             suggestions_enabled = excluded.suggestions_enabled, updated_at = now()`,
    [
      userId,
      CONSENT_VERSION,
      scope.tone ?? DEFAULTS.tone,
      scope.language ?? DEFAULTS.language,
      Boolean(scope.includeGroups ?? DEFAULTS.includeGroups),
      Boolean(scope.suggestionsEnabled ?? DEFAULTS.suggestionsEnabled),
    ],
  );
  return getSettings(userId);
}

/** Revoga consentimento (desliga a IA; mantém a trilha de aceite). */
export async function revokeConsent(userId: string): Promise<void> {
  if (!aiDbEnabled()) return;
  await query(`update ai_settings set consented = false, updated_at = now() where user_id = $1`, [userId]).catch(
    () => undefined,
  );
}

export async function updateSettings(
  userId: string,
  patch: Partial<Pick<AiSettings, 'tone' | 'language' | 'includeGroups' | 'suggestionsEnabled' | 'autoreply'>>,
): Promise<AiSettings> {
  if (!aiDbEnabled()) return DEFAULTS;
  const cur = await getSettings(userId);
  const next = { ...cur, ...patch };
  await query(
    `insert into ai_settings (user_id, consented, consent_version, tone, language, include_groups, suggestions_enabled, autoreply, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
       on conflict (user_id) do update
         set tone = excluded.tone, language = excluded.language, include_groups = excluded.include_groups,
             suggestions_enabled = excluded.suggestions_enabled, autoreply = excluded.autoreply, updated_at = now()`,
    [
      userId,
      cur.consented,
      cur.consentVersion,
      next.tone,
      next.language,
      Boolean(next.includeGroups),
      Boolean(next.suggestionsEnabled),
      JSON.stringify(next.autoreply ?? {}),
    ],
  );
  return next;
}

// ---------------------------------------------------------------- por-chat
export interface ChatAiSettings {
  excluded: boolean;
  autoreplyEnabled: boolean;
}

export async function getChatSettings(userId: string, chatJid: string): Promise<ChatAiSettings> {
  if (!aiDbEnabled()) return { excluded: false, autoreplyEnabled: false };
  try {
    const r = await query<{ excluded: boolean; autoreply_enabled: boolean }>(
      `select excluded, autoreply_enabled from ai_chat_settings where user_id = $1 and chat_jid = $2`,
      [userId, chatJid],
    );
    const row = r.rows[0];
    return { excluded: Boolean(row?.excluded), autoreplyEnabled: Boolean(row?.autoreply_enabled) };
  } catch {
    return { excluded: false, autoreplyEnabled: false };
  }
}

export async function setChatSettings(
  userId: string,
  chatJid: string,
  patch: Partial<ChatAiSettings>,
): Promise<ChatAiSettings> {
  if (!aiDbEnabled()) return { excluded: false, autoreplyEnabled: false };
  const cur = await getChatSettings(userId, chatJid);
  const next = { ...cur, ...patch };
  await query(
    `insert into ai_chat_settings (user_id, chat_jid, excluded, autoreply_enabled, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, chat_jid) do update
         set excluded = excluded.excluded, autoreply_enabled = excluded.autoreply_enabled, updated_at = now()`,
    [userId, chatJid, next.excluded, next.autoreplyEnabled],
  );
  return next;
}

/** Lista os chat_jids com auto-resposta ligada (para o hook de recebimento). */
export async function listAutoreplyChats(userId: string): Promise<Set<string>> {
  if (!aiDbEnabled()) return new Set();
  try {
    const r = await query<{ chat_jid: string }>(
      `select chat_jid from ai_chat_settings where user_id = $1 and autoreply_enabled = true`,
      [userId],
    );
    return new Set(r.rows.map((x) => x.chat_jid));
  } catch {
    return new Set();
  }
}

/** Middleware: bloqueia /ai/* sem consentimento válido (RN11). */
export function requireConsent() {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!(await isConsented(userId))) {
      res.status(403).json({ error: 'consent_required', consentVersion: CONSENT_VERSION });
      return;
    }
    next();
  };
}
