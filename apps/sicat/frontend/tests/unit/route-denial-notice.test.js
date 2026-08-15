/**
 * ROTA NEGADA — o aviso precisa CHEGAR.
 *
 * Seis rotas medidas em produção (/mtr-provisorio, /manifestos/novo,
 * /admin/acessos, /sistema/jobs, /operacao/auditoria, /dev/components)
 * redirecionavam para /dashboard sem nenhuma explicação. O guard já criava o
 * toast — só que DENTRO do beforeEach, então ele nascia e morria enquanto a
 * tela de destino ainda carregava.
 *
 * Estes testes travam a fila: o aviso existe, sobrevive ao redirect e é
 * consumido no destino certo (e só lá).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PENDING_AGE_MS,
  ROUTE_DENIAL_REASONS,
  ROUTE_DENIAL_TIMEOUT_MS,
  buildRouteDenialNotice,
  clearRouteDenialNotice,
  peekRouteDenialNotice,
  queueRouteDenialNotice,
  takeRouteDenialNotice
} from '../../src/lib/route-denial-notice.js';

test.beforeEach(() => clearRouteDenialNotice());

test('aviso de área administrativa é genérico e não expõe a rota negada', () => {
  const notice = buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.ADMIN,
    redirectTo: '/dashboard'
  });

  assert.equal(notice.message, 'Você não tem permissão para acessar esta área.');
  assert.match(notice.detail, /administrador do SICAT/);
  assert.doesNotMatch(`${notice.message} ${notice.detail}`, /\/sistema|\/admin|\/operacao|\/dev/);
});

test('aviso de perfil nomeia o perfil exigido e o caminho de saída', () => {
  const notice = buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.PERSONA,
    requiredPersonas: 'Gerador',
    redirectTo: '/dashboard'
  });

  assert.equal(notice.message, 'Esta tela não faz parte do seu perfil nesta conta CETESB.');
  assert.match(notice.detail, /exclusiva do perfil Gerador/);
  assert.match(notice.detail, /Minha sessão/);
});

test('perfil não resolvido ainda dá saída (sem "undefined" na tela)', () => {
  const notice = buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.PERSONA,
    redirectTo: '/dashboard'
  });

  assert.doesNotMatch(notice.detail, /undefined|null/);
  assert.match(notice.detail, /Minha sessão/);
});

test('o aviso não expira sozinho — some quando o operador fecha', () => {
  // Auto-dismiss curto foi exatamente o que produziu o sintoma original.
  assert.equal(ROUTE_DENIAL_TIMEOUT_MS, 0);
  const notice = buildRouteDenialNotice({ reason: ROUTE_DENIAL_REASONS.ADMIN, redirectTo: '/dashboard' });
  assert.equal(notice.timeout, 0);
});

test('razão desconhecida não inventa aviso', () => {
  assert.equal(buildRouteDenialNotice({ reason: 'seja-la-o-que-for', redirectTo: '/dashboard' }), null);
  assert.equal(buildRouteDenialNotice(), null);
});

test('o aviso sobrevive ao redirect e é consumido UMA vez no destino', () => {
  const queuedAt = 1_000_000;
  queueRouteDenialNotice(buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.ADMIN,
    redirectTo: '/dashboard',
    queuedAt
  }));

  // A navegação negada ainda não pousou: a fila segue cheia.
  assert.equal(takeRouteDenialNotice('/sistema/jobs', queuedAt + 5), null);
  assert.notEqual(peekRouteDenialNotice(), null);

  const delivered = takeRouteDenialNotice('/dashboard', queuedAt + 40);
  assert.equal(delivered.reason, ROUTE_DENIAL_REASONS.ADMIN);

  // Consumido: a próxima navegação não repete o aviso.
  assert.equal(takeRouteDenialNotice('/dashboard', queuedAt + 60), null);
  assert.equal(peekRouteDenialNotice(), null);
});

test('aviso velho é descartado — nunca aparece fora de contexto', () => {
  const queuedAt = 2_000_000;
  queueRouteDenialNotice(buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.PERSONA,
    requiredPersonas: 'Destinador',
    redirectTo: '/dashboard',
    queuedAt
  }));

  assert.equal(takeRouteDenialNotice('/dashboard', queuedAt + MAX_PENDING_AGE_MS + 1), null);
  assert.equal(peekRouteDenialNotice(), null);
});

test('CONTROLE NEGATIVO: sem nada enfileirado, nada é entregue', () => {
  assert.equal(takeRouteDenialNotice('/dashboard', Date.now()), null);
});

// --- 2ª rodada: o aviso continuava sumindo em casos reais -------------------

test('aviso enfileirado ANTES da navegação continua disponível DEPOIS dela', () => {
  const queuedAt = 3_000_000;
  queueRouteDenialNotice(buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.PERSONA,
    deniedPath: '/manifestos/novo',
    requiredPersonas: 'Gerador',
    redirectTo: '/dashboard',
    queuedAt
  }));

  // Enquanto a navegação ainda está na rota negada, a fila SEGURA o aviso.
  assert.equal(takeRouteDenialNotice('/manifestos/novo', queuedAt + 1), null);
  assert.notEqual(peekRouteDenialNotice(), null);

  // Navegação concluída no destino: o aviso chega inteiro.
  const delivered = takeRouteDenialNotice('/dashboard', queuedAt + 900);
  assert.equal(delivered.message, 'Esta tela não faz parte do seu perfil nesta conta CETESB.');
  assert.equal(delivered.timeout, 0);
});

test('redirect em DOIS SALTOS ainda entrega o aviso', () => {
  // Exigir pouso exato em `redirectTo` engolia o aviso quando o destino também
  // redirecionava (operador sem conta CETESB ativa acaba em /login/cetesb).
  const queuedAt = 4_000_000;
  queueRouteDenialNotice(buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.ADMIN,
    deniedPath: '/sistema/jobs',
    redirectTo: '/dashboard',
    queuedAt
  }));

  const delivered = takeRouteDenialNotice('/login/cetesb', queuedAt + 50);
  assert.equal(delivered.reason, ROUTE_DENIAL_REASONS.ADMIN);
  assert.equal(peekRouteDenialNotice(), null);
});

test('admin/SRE mandado para a visão de Sistema também é avisado', () => {
  const notice = buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.AUDIENCE,
    deniedPath: '/manifestos/novo',
    redirectTo: '/operacao/dashboard'
  });

  assert.equal(notice.message, 'Esta tela é da área do operador.');
  assert.match(notice.detail, /visão de Sistema/);
  assert.equal(notice.timeout, 0);
});

test('aviso de feature flag é genérico e não menciona qual vertical está desligada', () => {
  const notice = buildRouteDenialNotice({
    reason: ROUTE_DENIAL_REASONS.FEATURE_FLAG,
    deniedPath: '/transporte/operacoes',
    redirectTo: '/dashboard'
  });

  assert.equal(notice.message, 'Esta área ainda não está disponível.');
  assert.match(notice.detail, /liberação controlada/);
  assert.doesNotMatch(`${notice.message} ${notice.detail}`, /transporte/i);
  assert.equal(notice.timeout, 0);
});

test('a rota negada NUNCA aparece na mensagem (só serve para a fila)', () => {
  for (const reason of Object.values(ROUTE_DENIAL_REASONS)) {
    const notice = buildRouteDenialNotice({
      reason,
      deniedPath: '/sistema/jobs',
      redirectTo: '/dashboard'
    });

    assert.equal(notice.deniedPath, '/sistema/jobs');
    assert.doesNotMatch(
      `${notice.message} ${notice.detail}`,
      /\/sistema|\/admin|\/operacao|\/dev|\/manifestos/,
      `o aviso de "${reason}" não pode expor o mapa de rotas internas`
    );
  }
});
