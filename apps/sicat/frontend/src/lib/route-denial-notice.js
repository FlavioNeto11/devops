/**
 * AVISO DE ROTA NEGADA — módulo PURO (sem Vue, sem router, sem DOM).
 *
 * Por que existe: o guard do router já chamava `useNotification().warning(...)`
 * ANTES de `next('/dashboard')`. O toast era criado durante a navegação e
 * começava a contar o próprio tempo de vida NAQUELE instante — enquanto a tela
 * de destino ainda estava buscando dados na CETESB (segundos). Quando o
 * operador (ou o avaliador) finalmente enxergava o painel, o aviso já tinha
 * expirado: o redirect parecia SILENCIOSO (6 rotas medidas: /mtr-provisorio,
 * /manifestos/novo, /admin/acessos, /sistema/jobs, /operacao/auditoria e
 * /dev/components).
 *
 * A correção é enfileirar aqui o aviso e só emiti-lo DEPOIS que a navegação
 * concluir (`router.afterEach`), quando o usuário já está no destino. A fila
 * tem uma posição só, sabe para onde o redirect aponta (`redirectTo`) e expira
 * (`MAX_PENDING_AGE_MS`) — assim o aviso nunca "vaza" numa navegação futura que
 * o usuário fez por conta própria.
 *
 * O texto continua GENÉRICO de propósito: o caminho negado não vai para a URL
 * nem para a tela, para não expor o mapa de rotas internas a quem não tem
 * acesso.
 */

export const ROUTE_DENIAL_REASONS = Object.freeze({
  ADMIN: 'admin',
  PERSONA: 'persona'
});

/** Tempo máximo que um aviso enfileirado continua válido (ms). */
export const MAX_PENDING_AGE_MS = 15000;

/**
 * `timeout: 0` = o aviso fica até o operador fechar.
 *
 * É deliberado: este toast é a ÚNICA explicação de por que a tela pedida virou
 * outra. Um auto-dismiss curto é exatamente o que produziu o sintoma original
 * (aviso some antes de a tela de destino terminar de carregar). O
 * `SicatSnackbar` já dá botão de fechar e limita a pilha a 3.
 */
export const ROUTE_DENIAL_TIMEOUT_MS = 0;

const ADMIN_NOTICE = Object.freeze({
  message: 'Você não tem permissão para acessar esta área.',
  detail: 'Fale com o administrador do SICAT da sua organização se precisar deste acesso.'
});

const PERSONA_NOTICE_MESSAGE = 'Esta tela não faz parte do seu perfil nesta conta CETESB.';

function personaDetail(requiredPersonas) {
  const required = String(requiredPersonas || '').trim();
  return required
    ? `Ela é exclusiva do perfil ${required}. Se você também opera com esse perfil, troque a conta CETESB ativa em "Minha sessão".`
    : 'Se você também opera com outro perfil, troque a conta CETESB ativa em "Minha sessão".';
}

/**
 * Monta o aviso de uma rota negada.
 *
 * @param {{ reason: string, redirectTo: string, requiredPersonas?: string, queuedAt?: number }} input
 * @returns {{ reason: string, redirectTo: string, message: string, detail: string, timeout: number, queuedAt: number }|null}
 */
export function buildRouteDenialNotice({ reason, redirectTo, requiredPersonas = '', queuedAt = Date.now() } = {}) {
  if (reason === ROUTE_DENIAL_REASONS.ADMIN) {
    return {
      reason,
      redirectTo: String(redirectTo || ''),
      message: ADMIN_NOTICE.message,
      detail: ADMIN_NOTICE.detail,
      timeout: ROUTE_DENIAL_TIMEOUT_MS,
      queuedAt
    };
  }

  if (reason === ROUTE_DENIAL_REASONS.PERSONA) {
    return {
      reason,
      redirectTo: String(redirectTo || ''),
      message: PERSONA_NOTICE_MESSAGE,
      detail: personaDetail(requiredPersonas),
      timeout: ROUTE_DENIAL_TIMEOUT_MS,
      queuedAt
    };
  }

  return null;
}

let pendingNotice = null;

/** Enfileira o aviso (uma posição — o mais recente vence). */
export function queueRouteDenialNotice(notice) {
  pendingNotice = notice || null;
  return pendingNotice;
}

/** Só para teste/diagnóstico: espia sem consumir. */
export function peekRouteDenialNotice() {
  return pendingNotice;
}

export function clearRouteDenialNotice() {
  pendingNotice = null;
}

/**
 * Consome o aviso quando a navegação POUSA no destino do redirect.
 *
 * - Rota diferente do `redirectTo`: mantém na fila (o redirect ainda não pousou).
 * - Aviso velho (> MAX_PENDING_AGE_MS): descarta — não anuncia fora de contexto.
 *
 * @param {string} landedPath caminho onde a navegação terminou
 * @param {number} now
 */
export function takeRouteDenialNotice(landedPath, now = Date.now()) {
  if (!pendingNotice) {
    return null;
  }

  const age = now - Number(pendingNotice.queuedAt || 0);
  if (!Number.isFinite(age) || age > MAX_PENDING_AGE_MS) {
    pendingNotice = null;
    return null;
  }

  const expected = String(pendingNotice.redirectTo || '');
  if (expected && String(landedPath || '') !== expected) {
    return null;
  }

  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}
