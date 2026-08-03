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
