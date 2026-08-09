import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateConversationPolicy } from '../../src/services/conversation/conversation-policy-service.js';
import { setConversationPermissionCatalogSnapshotForTests } from '../../src/services/conversation/conversation-permission-catalog-state.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { listCatalogPermissionKeys } from '../../src/lib/conversation-permission-catalog.js';
import {
  readConversationPermissionDecisionsForTests,
  resetConversationPermissionDecisionsForTests
} from '../../src/lib/conversation-permission-metrics.js';

/**
 * GATE DE PERMISSÃO — fase 4.5.
 *
 * O fail-open que morreu aqui era `if (permissionContext.permissionKeys.size === 0) return true`:
 * usuário sem papel virava superusuário do chat. Cada teste abaixo tem uma MUTAÇÃO nomeada — a
 * alteração de produção que o faz quebrar. Teste que não quebra sob a sua mutação não é evidência.
 */

function buildContext(permissionKeys = []) {
  return {
    channel: 'inapp',
    userId: 'usr_gate_test',
    integrationAccountId: 'acc_gate_test',
    sessionContextId: 'scx_gate_test',
    channelSessionKey: 'inapp:usr_gate_test:acc_gate_test',
    permissionKeys,
    requestedBy: 'tester',
    correlationId: 'corr_gate_test',
    conversationSessionId: 'csn_gate_test',
    conversationTurnId: 'ctn_gate_test',
    manifestId: null,
    jobId: null,
    auditCorrelationId: null,
    idempotencyKey: null,
    metadata: {}
  };
}

/** Leitura pura: `list_manifests` exige `manifest.read` e não é ação. */
function readAttempt(permissionKeys) {
  return {
    toolName: 'list_manifests',
    channel: 'inapp',
    confirmed: false,
    allowActions: false,
    context: buildContext(permissionKeys)
  };
}

/** Ação R4 confirmada: `cancel_manifest` exige `manifest.cancel`. */
function cancelAttempt(permissionKeys) {
  return {
    toolName: 'cancel_manifest',
    channel: 'inapp',
    confirmed: true,
    allowActions: true,
    context: buildContext(permissionKeys)
  };
}

beforeEach(() => {
  setConfigOverride('conversationPermissionEnforcement', 'enforce');
  // Catálogo íntegro por padrão: o degradado é exercitado explicitamente onde importa.
  setConversationPermissionCatalogSnapshotForTests(listCatalogPermissionKeys());
  resetConversationPermissionDecisionsForTests();
});

describe('gate de permissao — usuario SEM papel', () => {
  it('em `enforce`, usuario sem nenhuma permissao e NEGADO ate para ler', () => {
    // MUTAÇÃO: repor `if (permissionKeys.size === 0) return true` -> este caso volta a `allowed: true`.
    const decision = evaluateConversationPolicy(readAttempt([]));

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
    assert.deepEqual(decision.permissionShortfall, {
      required: 'manifest.read',
      catalogSatisfiable: true
    });
  });

  it('em `observe`, o MESMO input e permitido e registra a lacuna', () => {
    setConfigOverride('conversationPermissionEnforcement', 'observe');

    const decision = evaluateConversationPolicy(readAttempt([]));

    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, null);
    // Permitir sem registrar seria observe silencioso, que não serve para nada.
    assert.deepEqual(decision.permissionShortfall, {
      required: 'manifest.read',
      catalogSatisfiable: true
    });
  });

  it('em `observe`, a ACAO tambem passa — e por isso a fase 5 fica bloqueada ate o flip', () => {
    setConfigOverride('conversationPermissionEnforcement', 'observe');

    const decision = evaluateConversationPolicy(cancelAttempt([]));

    assert.equal(decision.allowed, true);
    assert.equal(decision.permissionShortfall.required, 'manifest.cancel');
  });
});

describe('gate de permissao — papel-piso x operador x admin', () => {
  it('um `sicat.reader` (so manifest.read) LE', () => {
    const decision = evaluateConversationPolicy(readAttempt(['manifest.read']));
    assert.equal(decision.allowed, true);
    assert.equal(decision.permissionShortfall, null);
  });

  it('um `sicat.reader` NAO cancela', () => {
    const decision = evaluateConversationPolicy(cancelAttempt(['manifest.read']));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
    assert.equal(decision.permissionShortfall.required, 'manifest.cancel');
  });

  it('um `sicat.reader` NAO le a trilha de auditoria (audit.read e chave propria)', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'get_audit_trail',
      channel: 'inapp',
      confirmed: false,
      allowActions: false,
      context: buildContext(['manifest.read'])
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.permissionShortfall.required, 'audit.read');
  });

  it('um `sicat.operator` / admin (as 8 chaves) executa acao normalmente', () => {
    const decision = evaluateConversationPolicy(cancelAttempt(listCatalogPermissionKeys()));
    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, null);
    assert.equal(decision.permissionShortfall, null);
  });

  it('papel EXPIRADO / usuario INATIVO chegam aqui como conjunto VAZIO e sao negados', () => {
    // `listPermissionKeysByUserId` filtra `expires_at` e `sicat_users.is_active` no SQL, então o
    // efeito de um grant expirado ou de um funcionário desligado é exatamente `[]` na policy.
    const decision = evaluateConversationPolicy(cancelAttempt([]));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
  });
});

describe('gate de permissao — comparacao e igualdade EXATA', () => {
  it('curinga NAO concede: `manifest.*` nao satisfaz `manifest.read`', () => {
    const decision = evaluateConversationPolicy(readAttempt(['manifest.*']));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
  });

  it('chave mais especifica NAO concede: `manifest.read.all` nao satisfaz `manifest.read`', () => {
    const decision = evaluateConversationPolicy(readAttempt(['manifest.read.all']));
    assert.equal(decision.allowed, false);
  });

  it('caixa alta e espaco nao atrapalham (normalizacao do principal)', () => {
    const decision = evaluateConversationPolicy(readAttempt(['  MANIFEST.READ  ']));
    assert.equal(decision.allowed, true);
  });
});

describe('gate de permissao — catalogo DEGRADADO, avaliado POR CHAVE', () => {
  it('chave de ACAO ausente do catalogo NEGA (ninguem no mundo pode te-la)', () => {
    // MUTAÇÃO: forçar `catalogSatisfiable = true` -> este caso volta a `allowed: true`.
    setConversationPermissionCatalogSnapshotForTests(
      listCatalogPermissionKeys().filter((key) => key !== 'manifest.cancel')
    );

    const decision = evaluateConversationPolicy(cancelAttempt(['manifest.read']));

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
    assert.deepEqual(decision.permissionShortfall, {
      required: 'manifest.cancel',
      catalogSatisfiable: false
    });
  });

  it('chave de LEITURA ausente do catalogo PASSA (catalogo vazio nao pode trancar o chat)', () => {
    setConversationPermissionCatalogSnapshotForTests([]);

    const decision = evaluateConversationPolicy(readAttempt([]));

    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.permissionShortfall, {
      required: 'manifest.read',
      catalogSatisfiable: false
    });
  });

  it('catalogo VAZIO ainda assim NEGA acao — degradado nao e fail-open universal', () => {
    setConversationPermissionCatalogSnapshotForTests([]);

    const decision = evaluateConversationPolicy(cancelAttempt([]));
    assert.equal(decision.allowed, false);
  });

  it('degradacao e POR CHAVE: desativar manifest.cancel nao afrouxa as outras', () => {
    // O operador que desativa `manifest.cancel` de propósito desarma AQUELA ação (para todos,
    // inclusive admins) sem jogar o gate inteiro em degradado.
    setConversationPermissionCatalogSnapshotForTests(
      listCatalogPermissionKeys().filter((key) => key !== 'manifest.cancel')
    );

    const submitDenied = evaluateConversationPolicy({
      toolName: 'submit_manifest',
      channel: 'inapp',
      confirmed: true,
      allowActions: true,
      context: buildContext(['manifest.read'])
    });

    assert.equal(submitDenied.allowed, false);
    assert.equal(submitDenied.permissionShortfall.catalogSatisfiable, true, 'manifest.submit continua integro');

    const cancelByAdmin = evaluateConversationPolicy(cancelAttempt(listCatalogPermissionKeys()));
    assert.equal(cancelByAdmin.allowed, true, 'quem TEM a chave nao e afetado pela integridade dela');
  });

  it('com catalogo integro e usuario sem a chave, a negacao NAO e por degradacao', () => {
    const decision = evaluateConversationPolicy(cancelAttempt(['manifest.read']));
    assert.equal(decision.allowed, false);
    assert.equal(decision.permissionShortfall.catalogSatisfiable, true);
  });
});

describe('gate de permissao — instrumentacao', () => {
  it('`enforce` + sem a chave registra `denied`', async () => {
    evaluateConversationPolicy(cancelAttempt(['manifest.read']));

    const samples = await readConversationPermissionDecisionsForTests();
    const denied = samples.find((entry) => entry.outcome === 'denied');

    assert.ok(denied, 'nenhuma amostra `denied` registrada');
    assert.equal(denied.mode, 'enforce');
    assert.equal(denied.permission, 'manifest.cancel');
    assert.equal(denied.channel, 'inapp');
    assert.equal(denied.value, 1);
  });

  it('`observe` registra `would_deny` — a fila de concessoes antes do flip', async () => {
    setConfigOverride('conversationPermissionEnforcement', 'observe');
    evaluateConversationPolicy(cancelAttempt([]));

    const samples = await readConversationPermissionDecisionsForTests();
    const wouldDeny = samples.find((entry) => entry.outcome === 'would_deny');

    assert.ok(wouldDeny, 'observe silencioso nao serve para nada');
    assert.equal(wouldDeny.mode, 'observe');
    assert.equal(wouldDeny.permission, 'manifest.cancel');
  });

  it('catalogo degradado registra o desfecho certo em cada lado', async () => {
    setConversationPermissionCatalogSnapshotForTests([]);

    evaluateConversationPolicy(readAttempt([]));
    evaluateConversationPolicy(cancelAttempt([]));

    const outcomes = (await readConversationPermissionDecisionsForTests())
      .filter((entry) => entry.value > 0)
      .map((entry) => entry.outcome)
      .sort();

    assert.deepEqual(outcomes, ['catalog_degraded_allowed', 'catalog_degraded_denied']);
  });

  it('quem TEM a permissao nao gera amostra alguma (metrica e de excecao, nao de trafego)', async () => {
    evaluateConversationPolicy(readAttempt(['manifest.read']));

    const samples = (await readConversationPermissionDecisionsForTests()).filter((entry) => entry.value > 0);
    assert.deepEqual(samples, []);
  });
});

describe('gate de permissao — nomes herdados do prototipo nao viram politica', () => {
  for (const poisoned of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    it(`intent '${poisoned}' e INTENT_NOT_SUPPORTED, nao 500`, () => {
      // Com a política por intent em TABELA, `map['constructor']` devolveria a função herdada de
      // `Object.prototype` — verdadeira o bastante para passar por um `|| null` e explodir adiante em
      // `allowChannels.includes`. A cadeia de `if` que a tabela substituiu não tinha essa aresta.
      const decision = evaluateConversationPolicy({
        toolName: 'orchestrate_manifest_operation',
        toolArgs: { intent: poisoned },
        channel: 'inapp',
        confirmed: false,
        allowActions: false,
        context: buildContext(listCatalogPermissionKeys())
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'INTENT_NOT_SUPPORTED');
    });
  }
});

describe('gate de permissao — a ordem das guardas nao muda', () => {
  it('canal bloqueado ainda vence a permissao', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'submit_manifest',
      channel: 'whatsapp',
      confirmed: true,
      allowActions: true,
      context: buildContext(listCatalogPermissionKeys())
    });

    assert.equal(decision.reasonCode, 'CHANNEL_BLOCKED');
  });

  it('permissao vence a confirmacao: sem a chave, nem chega a pedir confirmacao', () => {
    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext(['manifest.read'])
    });

    assert.equal(decision.reasonCode, 'PERMISSION_DENIED');
  });

  it('em `observe`, a lacuna e carimbada tambem num desfecho posterior (ex.: CONFIRMATION_REQUIRED)', () => {
    setConfigOverride('conversationPermissionEnforcement', 'observe');

    const decision = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'inapp',
      confirmed: false,
      allowActions: true,
      context: buildContext([])
    });

    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.permissionShortfall.required, 'manifest.cancel');
  });
});
