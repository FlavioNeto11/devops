import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateConversationPolicy,
  findActionsWithoutConfirmation,
  findActionDefaultsAllowingExternalChannel,
  listCodeDefaultPolicies,
  listRequiredPermissionKeys
} from '../../src/services/conversation/conversation-policy-service.js';

/**
 * A ARMADILHA QUE ESTE ARQUIVO PRENDE.
 *
 * `manifest.create_draft` era a única ação das duas tabelas de default de código com
 * `requiresConfirmation: false`. Estava contida por estar em `CHANNEL_HARD_DENY` — segunda tranca
 * numa porta cuja fechadura estava errada: no dia em que a chave saísse da recusa, ela seria a única
 * ação capaz de executar sem NENHUM código de confirmação, porque o ticket do WhatsApp só nasce de um
 * turno `blocked / CONFIRMATION_REQUIRED`.
 *
 * O teste não é sobre `create_draft`. É sobre a FORMA da tabela: toda chave `isAction:true` tem de
 * nascer `requiresConfirmation:true`. Quem reintroduzir a armadilha amanhã, em qualquer chave, morre
 * aqui — e, antes disso, no import do próprio serviço.
 */

function buildContext() {
  return {
    channel: 'inapp',
    userId: 'usr_test',
    integrationAccountId: 'acc_test',
    sessionContextId: 'scx_test',
    channelSessionKey: 'inapp:usr_test:acc_test',
    // Operador COMPLETO: sem isto o turno pararia em PERMISSION_DENIED antes do portão de
    // confirmação, e o teste passaria pelo motivo errado.
    permissionKeys: listRequiredPermissionKeys(),
    requestedBy: 'tester',
    correlationId: 'corr_test_action_confirmation',
    conversationSessionId: 'csn_test',
    conversationTurnId: 'ctn_test',
    manifestId: 'man_test',
    jobId: null,
    auditCorrelationId: null,
    idempotencyKey: null,
    metadata: {}
  };
}

function evaluateIntent(intent, { confirmed }) {
  return evaluateConversationPolicy({
    toolName: 'orchestrate_manifest_operation',
    toolArgs: { intent },
    channel: 'inapp',
    confirmed,
    allowActions: true,
    context: buildContext()
  });
}

/** Ações DIRETAS (sem intent) — a outra tabela de default, `tools/tool-registry.ts`. */
const DIRECT_ACTION_TOOLS = [
  'print_manifest',
  'submit_manifest',
  'replicate_manifest',
  'cancel_manifest',
  'enqueue_cdf_download'
];

/** Ações ORQUESTRADAS — a tabela `ORCHESTRATED_INTENT_POLICY`. */
const ORCHESTRATED_ACTION_INTENTS = [
  'manifest.cancel_recent_excluding_first',
  'manifest.batch_cancel_selected',
  'manifest.batch_submit_selected',
  'manifest.batch_print_selected',
  'manifest.create_draft',
  'manifest.create_from_payload',
  'manifest.receive_with_receipt',
  'manifest.replicate_with_patch',
  'manifest.replicate_segmented',
  'cdf.generate_from_manifest_selection',
  'cdf.download_batch_selected'
];

describe('invariante estrutural — toda ação exige confirmação no default de código', () => {
  it('a invariante VALE hoje, nas duas tabelas reais', () => {
    assert.deepEqual(findActionsWithoutConfirmation(listCodeDefaultPolicies()), []);
  });

  it('a enumeração enxerga AS DUAS tabelas — senão o caso acima passaria a vazio', () => {
    // Um verificador que percorre lista vazia também devolve `[]`. Esta é a testemunha de que ele
    // percorreu alguma coisa: apagar `tool-registry` ou `ORCHESTRATED_INTENT_POLICY` de
    // `listCodeDefaultPolicies` mata este caso, não o de cima.
    const labels = new Set(listCodeDefaultPolicies().map((entry) => entry.label));

    for (const toolName of DIRECT_ACTION_TOOLS) {
      assert.ok(labels.has(`tool ${toolName}`), `a enumeração perdeu a tool ${toolName}`);
    }
    for (const intent of ORCHESTRATED_ACTION_INTENTS) {
      assert.ok(labels.has(`intent ${intent}`), `a enumeração perdeu o intent ${intent}`);
    }

    // E que essas chaves são de fato AÇÕES — um verificador sobre um conjunto de leituras não
    // provaria nada sobre ações.
    const actions = listCodeDefaultPolicies().filter((entry) => entry.policy.isAction);
    assert.equal(
      actions.length,
      DIRECT_ACTION_TOOLS.length + ORCHESTRATED_ACTION_INTENTS.length,
      'o conjunto de ações do código divergiu da lista deste teste — classifique a chave nova'
    );
  });

  it('CONTROLE NEGATIVO: o verificador ACUSA uma política violadora construída em memória', () => {
    // Sem este caso, "nenhum infrator" seria indistinguível de "o medidor não enxerga".
    const violadora = [
      { label: 'intent fixture.acao_sem_confirmacao', policy: {
        riskLevel: 'R1', allowChannels: ['native_chat', 'inapp'], requiresConfirmation: false, isAction: true
      } },
      { label: 'tool fixture_acao_confirmada', policy: {
        riskLevel: 'R3', allowChannels: ['native_chat', 'inapp'], requiresConfirmation: true, isAction: true
      } },
      // Leitura sem confirmação é o estado NORMAL: não pode ser acusada, ou o verificador acusaria
      // metade do catálogo e o caso "vale hoje" nunca ficaria verde.
      { label: 'intent fixture.leitura', policy: {
        riskLevel: 'R1', allowChannels: ['whatsapp', 'native_chat', 'inapp'], requiresConfirmation: false, isAction: false
      } }
    ];

    assert.deepEqual(findActionsWithoutConfirmation(violadora), ['intent fixture.acao_sem_confirmacao']);
  });

  it('CONTROLE NEGATIVO: a invariante irmã (canal externo) acusa pelo mesmo caminho', () => {
    // As duas invariantes passaram a compartilhar `listCodeDefaultPolicies`. Se alguém quebrar a
    // enumeração, as duas somem juntas — então as duas precisam de testemunha própria.
    assert.deepEqual(findActionDefaultsAllowingExternalChannel(listCodeDefaultPolicies()), []);
    assert.deepEqual(
      findActionDefaultsAllowingExternalChannel([
        { label: 'intent fixture.acao_no_whatsapp', policy: {
          riskLevel: 'R3', allowChannels: ['whatsapp', 'inapp'], requiresConfirmation: true, isAction: true
        } }
      ]),
      ['intent fixture.acao_no_whatsapp']
    );
  });
});

describe('manifest.create_draft — a chave que estava fora da invariante', () => {
  it('sem confirmação, o rascunho é BLOQUEADO com CONFIRMATION_REQUIRED', () => {
    // MUTAÇÃO: devolver `requiresConfirmation: false` ao default de `manifest.create_draft` faz este
    // caso morrer (allowed: true, reasonCode: null) — e mata o import junto.
    const decision = evaluateIntent('manifest.create_draft', { confirmed: false });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(decision.requiresConfirmation, true);
    assert.equal(decision.isAction, true);
  });

  it('com confirmação explícita, executa — a confirmação é portão, não parede', () => {
    const decision = evaluateIntent('manifest.create_draft', { confirmed: true });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, null);
  });

  it('riskLevel R2: grava manifesto (não é R1) e não alcança a CETESB (não é R3)', () => {
    assert.equal(evaluateIntent('manifest.create_draft', { confirmed: true }).riskLevel, 'R2');
  });
});

describe('o portão de confirmação vale para TODAS as ações, diretas e orquestradas', () => {
  for (const toolName of DIRECT_ACTION_TOOLS) {
    it(`tool direta ${toolName} sem confirmação -> CONFIRMATION_REQUIRED`, () => {
      const decision = evaluateConversationPolicy({
        toolName,
        toolArgs: {},
        channel: 'inapp',
        confirmed: false,
        allowActions: true,
        context: buildContext()
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    });
  }

  for (const intent of ORCHESTRATED_ACTION_INTENTS) {
    it(`intent ${intent} sem confirmação -> CONFIRMATION_REQUIRED`, () => {
      const decision = evaluateIntent(intent, { confirmed: false });

      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'CONFIRMATION_REQUIRED');
    });
  }
});
