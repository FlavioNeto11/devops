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
 * tem uma posição só, sabe de onde o usuário foi barrado (`deniedPath`), para
 * onde o redirect aponta (`redirectTo`) e expira (`MAX_PENDING_AGE_MS`) — assim
 * o aviso nunca "vaza" numa navegação futura que o usuário fez por conta própria.
 *
 * Segunda rodada: exigir pouso EXATO em `redirectTo` engolia o aviso sempre que
 * o destino também redirecionava (redirect em dois saltos — admin/SRE indo parar
 * em `/operacao/dashboard`, operador sem conta CETESB ativa indo para
 * `/login/cetesb`). Hoje basta a navegação ter pousado FORA da rota negada.
 *
 * O texto continua GENÉRICO de propósito: o caminho negado não vai para a URL
 * nem para a tela, para não expor o mapa de rotas internas a quem não tem
 * acesso.
 */

export const ROUTE_DENIAL_REASONS = Object.freeze({
  ADMIN: 'admin',
  PERSONA: 'persona',
  // Admin/SRE pedindo tela de OPERADOR: o guard mandava para a visão de Sistema
  // sem enfileirar nada — era um redirect 100% mudo, e ele nem passava pelas
  // duas razões acima (o `return` acontece antes). Ver `router.js`.
  AUDIENCE: 'audience',
  // Vertical atrás de feature flag desligada (ex.: Transporte — DL-103/PR-F1).
  // Mesmo tratamento das outras razões: sem isso, digitar a URL direto com a
  // flag off caía num redirect mudo — o operador não entende por que sumiu.
  FEATURE_FLAG: 'feature_flag'
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

const AUDIENCE_NOTICE = Object.freeze({
  message: 'Esta tela é da área do operador.',
  detail: 'Sua conta é de administração (SRE) e trabalha sem conta CETESB ativa — levamos você para a visão de Sistema.'
});

const FEATURE_FLAG_NOTICE = Object.freeze({
  message: 'Esta área ainda não está disponível.',
  detail: 'Ela está em liberação controlada — fale com o administrador do SICAT se precisar de acesso antecipado.'
});

function personaDetail(requiredPersonas) {
  const required = String(requiredPersonas || '').trim();
  return required
    ? `Ela é exclusiva do perfil ${required}. Se você também opera com esse perfil, troque a conta CETESB ativa em "Minha sessão".`
    : 'Se você também opera com outro perfil, troque a conta CETESB ativa em "Minha sessão".';
}

const NOTICE_TEXT_BY_REASON = Object.freeze({
  [ROUTE_DENIAL_REASONS.ADMIN]: () => ADMIN_NOTICE,
  [ROUTE_DENIAL_REASONS.PERSONA]: (requiredPersonas) => ({
    message: PERSONA_NOTICE_MESSAGE,
    detail: personaDetail(requiredPersonas)
  }),
  [ROUTE_DENIAL_REASONS.AUDIENCE]: () => AUDIENCE_NOTICE,
  [ROUTE_DENIAL_REASONS.FEATURE_FLAG]: () => FEATURE_FLAG_NOTICE
});

/**
 * Monta o aviso de uma rota negada.
 *
 * `deniedPath` NUNCA vai para a mensagem nem para a URL — serve só para a fila
 * saber que a navegação ainda está na rota negada (ver `takeRouteDenialNotice`).
 *
 * @param {{ reason: string, redirectTo: string, deniedPath?: string, requiredPersonas?: string, queuedAt?: number }} input
 * @returns {{ reason: string, redirectTo: string, deniedPath: string, message: string, detail: string, timeout: number, queuedAt: number }|null}
 */
export function buildRouteDenialNotice({
  reason,
  redirectTo,
  deniedPath = '',
  requiredPersonas = '',
  queuedAt = Date.now()
} = {}) {
  const buildText = NOTICE_TEXT_BY_REASON[reason];
  if (!buildText) {
    return null;
  }

  const { message, detail } = buildText(requiredPersonas);

  return {
    reason,
    redirectTo: String(redirectTo || ''),
    deniedPath: String(deniedPath || ''),
    message,
    detail,
    timeout: ROUTE_DENIAL_TIMEOUT_MS,
    queuedAt
  };
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
 * Consome o aviso quando a navegação POUSA fora da rota negada.
 *
 * Duas condições de entrega, nesta ordem:
 *  1. pousou exatamente no `redirectTo` — o caso normal;
 *  2. pousou em QUALQUER outro lugar que não seja a rota negada — o caso do
 *     redirect em DOIS SALTOS. Exigir só a condição (1) engolia o aviso sempre
 *     que o destino também redirecionava (admin/SRE caindo de `/dashboard` para
 *     `/operacao/dashboard`, ou operador sem conta CETESB ativa caindo em
 *     `/login/cetesb`): a fila expirava calada e o redirect voltava a ser mudo.
 *
 * Ainda na rota negada (a navegação não pousou): mantém na fila.
 * Aviso velho (> MAX_PENDING_AGE_MS): descarta — não anuncia fora de contexto.
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

  const landed = String(landedPath || '');
  const expected = String(pendingNotice.redirectTo || '');
  const denied = String(pendingNotice.deniedPath || '');

  const landedOnRedirectTarget = Boolean(expected) && landed === expected;
  const landedAwayFromDeniedRoute = Boolean(denied) && landed !== denied;

  if (expected && !landedOnRedirectTarget && !landedAwayFromDeniedRoute) {
    return null;
  }

  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}
