/**
 * SESSÃO PRESA EM BUNDLE ANTIGO — a SPA precisa se recuperar sozinha.
 *
 * Sintoma medido: publicação nova apaga os assets com hash antigo; a aba que
 * ainda roda o bundle velho pede um chunk que não existe mais, toma 404 e fica
 * travada, sem saída. Esta classe de problema gerou 14 falsos alarmes numa
 * varredura de produção.
 *
 * Os testes cobrem os três desfechos: recarregar, avisar sem recarregar (para
 * não entrar em laço) e — CONTROLE NEGATIVO — não fazer nada quando o erro é
 * outro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_BUNDLE_RELOAD_COOLDOWN_MS,
  decideStaleBundleRecovery,
  isStaleBundleError
} from '../../src/lib/stale-bundle-recovery.js';

const CHUNK_ERRORS = [
  // Chrome / Edge
  new Error("Failed to fetch dynamically imported module: https://dev.nvit.com.br/sicat/assets/AiControlCenterView-8f21ab.js"),
  // Firefox
  new Error('error loading dynamically imported module'),
  // Safari
  new Error('Importing a module script failed.'),
  // Vite (preload de CSS de chunk)
  new Error('Unable to preload CSS for /sicat/assets/AiControlCenterView-8f21ab.css'),
  // Fallback de SPA devolvendo HTML no lugar do JS que sumiu
  new Error("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\"."),
  // Empacotadores antigos
  Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' })
];

test('reconhece a falha de chunk nos navegadores que o SICAT atende', () => {
  for (const error of CHUNK_ERRORS) {
    assert.equal(isStaleBundleError(error), true, `não reconheceu: ${error.message}`);
  }
});

test('CONTROLE NEGATIVO: erros que NÃO são bundle velho não disparam nada', () => {
  const outros = [
    new Error('Sessão expirada. Faça login novamente.'),
    new Error('Erro HTTP 500 ao acessar API'),
    new Error('Tempo esgotado ao acessar API.'),
    new Error('Manifesto não encontrado.'),
    'NavigationDuplicated',
    null,
    undefined,
    ''
  ];

  for (const error of outros) {
    assert.equal(isStaleBundleError(error), false, `falso positivo em: ${String(error)}`);
    assert.equal(decideStaleBundleRecovery({ error, now: 10_000 }).action, 'ignore');
  }
});

test('primeira falha: recarrega avisando que houve publicação nova', () => {
  const decision = decideStaleBundleRecovery({
    error: CHUNK_ERRORS[0],
    lastReloadAt: 0,
    now: 1_000_000
  });

  assert.equal(decision.action, 'reload');
  assert.match(decision.message, /nova versão foi publicada/i);
  assert.match(decision.message, /recarregando/i);
});

test('falha logo após um reload: avisa com ação manual, NÃO recarrega de novo', () => {
  const now = 1_000_000;
  const decision = decideStaleBundleRecovery({
    error: CHUNK_ERRORS[0],
    lastReloadAt: now - 1000,
    now
  });

  // Recarregar outra vez seria laço infinito: o chunk continuaria faltando.
  assert.equal(decision.action, 'prompt');
  assert.equal(decision.actionLabel, 'Recarregar agora');
  assert.match(decision.detail, /Recarregue a página/i);
});

test('passado o cooldown, volta a recarregar sozinho', () => {
  const now = 1_000_000;
  const decision = decideStaleBundleRecovery({
    error: CHUNK_ERRORS[3],
    lastReloadAt: now - STALE_BUNDLE_RELOAD_COOLDOWN_MS - 1,
    now
  });

  assert.equal(decision.action, 'reload');
});

test('relógio adiantado/sessionStorage corrompido não trava a recuperação', () => {
  const now = 1_000;
  // lastReloadAt no futuro (relógio mexeu) — não pode virar "prompt" eterno.
  assert.equal(decideStaleBundleRecovery({ error: CHUNK_ERRORS[0], lastReloadAt: now + 999_999, now }).action, 'reload');
  assert.equal(decideStaleBundleRecovery({ error: CHUNK_ERRORS[0], lastReloadAt: Number.NaN, now }).action, 'reload');
  assert.equal(decideStaleBundleRecovery({ error: CHUNK_ERRORS[0], lastReloadAt: 'lixo', now }).action, 'reload');
});
