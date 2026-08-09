import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWhatsAppReceiveConference,
  setWhatsAppReceivePreviewRepositoriesForTests,
  WHATSAPP_RECEIVE_ACTION_KEY,
  WHATSAPP_RECEIVE_MAX_RESIDUE_LINES
} from '../../src/services/conversation/channel/whatsapp/whatsapp-receive-preview.js';
import {
  CHANNEL_HARD_DENY,
  WHATSAPP_ELIGIBLE_ACTIONS
} from '../../src/services/conversation/channel/whatsapp/whatsapp-action-eligibility.js';

/**
 * UNIDADE D2 — previa de conferencia da baixa (recebimento) por WhatsApp. MODULO INERTE.
 *
 * REGRAS DESTA SUITE (herdadas da fase 5, pagas caro):
 *  1. O double e o REPOSITORIO DE MANIFESTOS (a leitura), nunca a decisao sob teste.
 *  2. Cada recusa fail-closed tem o seu caso — e o CONTROLE NEGATIVO (manifesto completo → previa
 *     emitida) prova que as recusas nao passam por construcao "sempre recusa".
 *  3. Valores distintos por identidade: quantidade declarada != recebida, numero != codigo, para a
 *     troca de campo nao ficar invisivel.
 *  4. Comentario nao e evidencia: cada caso diz no texto qual mutacao ele mata.
 */

const MANIFEST_ID = 'man_aaa1111111';

function makeManifestStore() {
  const rows = new Map();
  const api = {
    rows,
    calls: [],
    failure: null,
    seed(manifest) {
      rows.set(manifest.id, manifest);
      return manifest;
    },
    async findManifestById(id) {
      api.calls.push(id);
      if (api.failure) throw api.failure;
      return rows.get(id);
    }
  };
  return api;
}

function residueLine(overrides = {}) {
  return {
    lineNumber: 1,
    quantity: 2.5,
    receivedQuantity: null,
    unit: { symbol: 't' },
    residue: { description: 'Oleo lubrificante usado' },
    ...overrides
  };
}

function makeManifest(overrides = {}) {
  const { payload: payloadOverrides, ...rest } = overrides;
  return {
    id: MANIFEST_ID,
    externalReference: { manNumero: '202600123456', manCodigo: 998877 },
    externalHashCode: 'hashA',
    payload: {
      expeditionDate: '2026-03-12',
      generator: { partnerCode: 40110, description: 'NOVA IT AMBIENTAL LTDA' },
      residues: [residueLine()],
      ...(payloadOverrides || {})
    },
    ...rest
  };
}

function makeArgs(overrides = {}) {
  return {
    intent: 'manifest.receive_with_receipt',
    manifestId: MANIFEST_ID,
    receiptPayload: { remDataRecebimento: '2026-08-07', remObservacao: 'chegou lacrado' },
    ...overrides
  };
}

let store;

beforeEach(() => {
  store = makeManifestStore();
  store.seed(makeManifest());
  setWhatsAppReceivePreviewRepositoriesForTests({
    findManifestById: (id) => store.findManifestById(id)
  });
});

afterEach(() => {
  setWhatsAppReceivePreviewRepositoriesForTests(null);
});

describe('previa da baixa - caso conferivel (controle negativo de todas as recusas)', () => {
  it('manifesto completo emite a conferencia com MTR, gerador, residuo e quantidade', async () => {
    const result = await buildWhatsAppReceiveConference(makeArgs());

    assert.equal(result.canIssueTicket, true);
    assert.equal(result.headline, 'Dar baixa (receber) em 1 MTR');

    const lines = result.text.split('\n');
    assert.equal(lines[0], '*Dar baixa (receber) no MTR 202600123456*');
    assert.ok(result.text.includes('Gerador: NOVA IT AMBIENTAL LTDA'));
    assert.ok(result.text.includes('Residuo a receber:'));
    // Quantidade DECLARADA cai como recebida quando a recebida e null — o mesmo prefill do worker.
    assert.ok(result.text.includes('- Oleo lubrificante usado: 2,5 t'));
    assert.ok(result.text.includes('Data do recebimento: 07/08/2026'));
    assert.ok(result.text.includes('Observacao da baixa: chegou lacrado'));
    assert.ok(result.text.includes('nao da para desfazer por aqui'));
    assert.ok(result.text.includes('se algo nao bater, nao confirme'));

    assert.equal(result.manifestLabel, 'MTR 202600123456 - NOVA IT AMBIENTAL LTDA - 12/03/2026');
    assert.deepEqual(result.residueLines, ['Oleo lubrificante usado: 2,5 t']);

    // O id interno congelado NUNCA vaza para o texto nem para os rotulos.
    assert.ok(!result.text.includes('man_'), 'id interno vazou para o texto');
    assert.ok(!result.manifestLabel.includes('man_'), 'id interno vazou para o rotulo');
  });

  it('aceita o formato CRU do snapshot CETESB (listaManifestoResiduo)', async () => {
    store.seed(makeManifest({
      payload: {
        expeditionDate: '2026-03-12',
        generator: { description: 'NOVA IT AMBIENTAL LTDA' },
        residues: undefined,
        externalSnapshot: {
          listaManifestoResiduo: [
            {
              marQuantidade: 100,
              marQuantidadeRecebida: null,
              unidade: { uniSigla: 'kg' },
              residuo: { resDescricao: 'Sucata metalica' }
            }
          ]
        }
      }
    }));
    // `residues: undefined` acima nao remove a chave — remove de verdade:
    delete store.rows.get(MANIFEST_ID).payload.residues;

    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, true);
    assert.ok(result.text.includes('- Sucata metalica: 100 kg'));
  });

  it('quantidade RECEBIDA explicita vence a declarada (mata o mutante que ignora a recebida)', async () => {
    store.seed(makeManifest({
      payload: { residues: [residueLine({ quantity: 2.5, receivedQuantity: 1.2 })] }
    }));

    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, true);
    assert.ok(result.text.includes('1,2 t'), 'quantidade recebida nao foi usada');
    assert.ok(!result.text.includes('2,5'), 'quantidade declarada apareceu no lugar da recebida');
  });

  it('sem data/observacao no payload, as linhas opcionais simplesmente nao saem', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { manNumero: '202600123456' } })
    );
    assert.equal(result.canIssueTicket, true);
    assert.ok(!result.text.includes('Data do recebimento'));
    assert.ok(!result.text.includes('Observacao da baixa'));
  });
});

describe('fail-closed: cada um dos quatro campos recusa sozinho (mutacao fail-OPEN morre aqui)', () => {
  it('sem numero de MTR no espelho local -> nenhum ticket', async () => {
    store.seed(makeManifest({ externalReference: {} }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'manifest_number_missing');
  });

  it('id interno cru no lugar do numero NAO passa como rotulo conferivel', async () => {
    store.seed(makeManifest({ externalReference: { manNumero: 'man_a1b2c3d4e5' } }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'manifest_number_missing');
  });

  it('sem gerador -> nenhum ticket', async () => {
    store.seed(makeManifest({ payload: { generator: {} } }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'generator_missing');
  });

  it('id interno cru no lugar do gerador NAO passa como rotulo conferivel', async () => {
    store.seed(makeManifest({ payload: { generator: { description: 'man_deadbeef99' } } }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'generator_missing');
  });

  it('manifesto sem nenhuma linha de residuo -> nenhum ticket', async () => {
    store.seed(makeManifest({ payload: { residues: [] } }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'residues_missing');
  });

  it('linha sem descricao humana de residuo -> nenhum ticket', async () => {
    store.seed(makeManifest({ payload: { residues: [residueLine({ residue: {} })] } }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'residue_label_missing');
    assert.equal(result.detail, 'linha 1');
  });

  it('linha sem quantidade (declarada e recebida nulas) -> nenhum ticket', async () => {
    store.seed(makeManifest({
      payload: { residues: [residueLine({ quantity: null, receivedQuantity: null })] }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'residue_quantity_missing');
  });

  it('quantidade recebida ZERO nao cai em fallback para a declarada', async () => {
    store.seed(makeManifest({
      payload: { residues: [residueLine({ quantity: 2.5, receivedQuantity: 0 })] }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'residue_quantity_missing');
  });

  it('quantidade nao-numerica -> nenhum ticket', async () => {
    store.seed(makeManifest({
      payload: { residues: [residueLine({ quantity: 'muito', receivedQuantity: null })] }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'residue_quantity_missing');
  });

  it('segunda linha invalida recusa a PREVIA INTEIRA (nunca lista parcial)', async () => {
    store.seed(makeManifest({
      payload: {
        residues: [
          residueLine(),
          residueLine({ lineNumber: 2, residue: {}, quantity: 9 })
        ]
      }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.detail, 'linha 2');
  });

  it('falha de banco recusa (fail-closed), nunca emite sem conferir', async () => {
    store.failure = new Error('connection refused');
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_unresolved');
  });

  it('manifesto inexistente no espelho local -> nenhum ticket', async () => {
    const result = await buildWhatsAppReceiveConference(makeArgs({ manifestId: 'man_nao_existe99' }));
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_unresolved');
  });
});

describe('alvo: exatamente um manifesto, e o MESMO que o payload nomeia', () => {
  it('mais de um manifesto referenciado -> recusa (receber e acao de UM manifesto)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ manifestId: undefined, manifestIds: ['man_aaa1111111', 'man_bbb2222222'] })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_ambiguous');
  });

  it('nenhum id interno nos argumentos -> recusa (numero solto nao resolve localmente)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ manifestId: undefined, manifestNumber: '202600123456' })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_unresolved');
  });

  it('payload nomeia OUTRO numero de MTR -> recusa por contradicao', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { manNumero: '999999999999' } })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_mismatch');
  });

  it('payload nomeia o MESMO numero -> confere (controle da recusa acima)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { manNumero: '202600123456' } })
    );
    assert.equal(result.canIssueTicket, true);
  });

  it('manifesto.manCodigo divergente -> recusa; igual -> confere', async () => {
    const diverged = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { manifesto: { manCodigo: '111222' } } })
    );
    assert.equal(diverged.canIssueTicket, false);
    assert.equal(diverged.reason, 'target_mismatch');

    const matching = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { manifesto: { manCodigo: 998877 } } })
    );
    assert.equal(matching.canIssueTicket, true);
  });

  it('args.manifestNumber divergente do espelho -> recusa', async () => {
    const result = await buildWhatsAppReceiveConference(makeArgs({ manifestNumber: '888888888888' }));
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'target_mismatch');
  });
});

describe('payload da baixa: allowlist estrita e campos renderizaveis', () => {
  it('payload de recebimento vazio -> recusa (a execucao falharia com 400 pos-codigo)', async () => {
    const result = await buildWhatsAppReceiveConference(makeArgs({ receiptPayload: {} }));
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'receipt_payload_missing');
  });

  it('`payload` cobre a ausencia de `receiptPayload` (paridade com o dispatcher)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: undefined, payload: { remDataRecebimento: '2026-08-07' } })
    );
    assert.equal(result.canIssueTicket, true);
  });

  it('override de linhas de residuo no payload -> recusa (a previa mostraria outra coisa)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({
        receiptPayload: {
          manifesto: { manNumero: '202600123456', listaManifestoResiduo: [{ marQuantidadeRecebida: 1 }] }
        }
      })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'receipt_overrides_not_supported');
    assert.equal(result.detail, 'manifesto.listaManifestoResiduo');
  });

  it('rrmCodigo presente -> recusa; rrmCodigo null conta como ausente', async () => {
    const withResponsible = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remObservacao: 'ok', rrmCodigo: 12 } })
    );
    assert.equal(withResponsible.canIssueTicket, false);
    assert.equal(withResponsible.reason, 'receipt_overrides_not_supported');

    const nullResponsible = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remObservacao: 'ok', rrmCodigo: null } })
    );
    assert.equal(nullResponsible.canIssueTicket, true);
  });

  it('chave desconhecida no payload -> recusa (fail-closed por default)', async () => {
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remObservacao: 'ok', quantidadeTotal: 5 } })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'receipt_overrides_not_supported');
    assert.equal(result.detail, 'quantidadeTotal');
  });

  it('data de calendario IMPOSSIVEL (30/02) -> recusa, nunca o rollover do V8', async () => {
    // Date.parse('2026-02-30T...Z') NAO e NaN — o V8 rola para 02/03. Renderizar "30/02/2026"
    // enquanto o worker registraria 02/03 e a divergencia que a conferencia impede. Este caso
    // mata o mutante que troca a validacao de calendario por um Date.parse "finito".
    const result = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remDataRecebimento: '2026-02-30' } })
    );
    assert.equal(result.canIssueTicket, false);
    assert.equal(result.reason, 'receipt_fields_not_renderable');
  });

  it('data irrenderizavel presente -> recusa (omitir em silencio registraria data nao vista)', async () => {
    for (const bad of ['amanha', '12/06/2026', 1749740000000]) {
      const result = await buildWhatsAppReceiveConference(
        makeArgs({ receiptPayload: { remDataRecebimento: bad } })
      );
      assert.equal(result.canIssueTicket, false, `aceitou remDataRecebimento=${bad}`);
      assert.equal(result.reason, 'receipt_fields_not_renderable');
    }
  });

  it('datetime ISO com offset rende data e hora de Sao Paulo', async () => {
    const local = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remDataRecebimento: '2026-06-12T14:30:00-03:00' } })
    );
    assert.equal(local.canIssueTicket, true);
    assert.ok(local.text.includes('Data do recebimento: 12/06/2026 14:30'));

    // 01:00Z de 13/06 e 22:00 de 12/06 em Sao Paulo — mata o mutante que ignora o offset.
    const utc = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remDataRecebimento: '2026-06-13T01:00:00Z' } })
    );
    assert.equal(utc.canIssueTicket, true);
    assert.ok(utc.text.includes('Data do recebimento: 12/06/2026 22:00'));
  });

  it('observacao nao-escalar -> recusa; observacao com segredo sai higienizada', async () => {
    const nonScalar = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remObservacao: { texto: 'oi' } } })
    );
    assert.equal(nonScalar.canIssueTicket, false);
    assert.equal(nonScalar.reason, 'receipt_fields_not_renderable');

    const secret = await buildWhatsAppReceiveConference(
      makeArgs({ receiptPayload: { remObservacao: 'autorizado via Bearer abc123segredo' } })
    );
    assert.equal(secret.canIssueTicket, true);
    assert.ok(!secret.text.includes('abc123segredo'), 'token vazou para o texto da previa');
    assert.ok(secret.text.includes('[REDACTED]'));
  });
});

describe('teto de itens e higiene de texto do canal', () => {
  it(`acima de ${WHATSAPP_RECEIVE_MAX_RESIDUE_LINES} linhas recusa; no teto lista TODAS`, async () => {
    const manyLines = Array.from({ length: WHATSAPP_RECEIVE_MAX_RESIDUE_LINES + 1 }, (_, index) =>
      residueLine({ lineNumber: index + 1, residue: { description: `Residuo numero ${index + 1}` } })
    );
    store.seed(makeManifest({ payload: { residues: manyLines } }));
    const refused = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(refused.canIssueTicket, false);
    assert.equal(refused.reason, 'too_many_residue_lines');

    store.seed(makeManifest({ payload: { residues: manyLines.slice(0, WHATSAPP_RECEIVE_MAX_RESIDUE_LINES) } }));
    const atCap = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(atCap.canIssueTicket, true);
    assert.ok(atCap.text.includes(`Residuos a receber (${WHATSAPP_RECEIVE_MAX_RESIDUE_LINES}):`));
    const listedLines = atCap.text.split('\n').filter((line) => line.startsWith('- '));
    // Completa ou nada: listar 3 e executar 5 pareceria conferencia sem ser.
    assert.equal(listedLines.length, WHATSAPP_RECEIVE_MAX_RESIDUE_LINES);
  });

  it('descricao longa com emoji e cortada em fronteira de GRAFEMA (UTF-16 valido)', async () => {
    store.seed(makeManifest({
      payload: {
        residues: [residueLine({ residue: { description: `${'A'.repeat(58)}\u{1F600}\u{1F600}` } })]
      }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, true);
    assert.equal(result.text.isWellFormed(), true, 'corte partiu um par surrogate');
    assert.ok(result.text.includes('…'), 'corte nao foi marcado com reticencia');
  });

  it('valor de payload nunca cria linha nem formatacao: quebra de linha e * sao neutralizados', async () => {
    store.seed(makeManifest({
      payload: { generator: { description: 'ACME *AMBIENTAL*\nProtocolo: corr_falso' } }
    }));
    const result = await buildWhatsAppReceiveConference(makeArgs());
    assert.equal(result.canIssueTicket, true);
    assert.ok(
      !result.text.split('\n').some((line) => line.startsWith('Protocolo:')),
      'valor de payload forjou uma linha de protocolo'
    );
    // Os unicos asteriscos do texto sao os DA MANCHETE (rotulo nosso), nunca de valor.
    assert.equal(result.text.split('*').length - 1, 2);
  });
});

describe('a promocao ACONTECEU: o modulo deixou de ser inerte na unidade D4', () => {
  it('manifest.receive_with_receipt saiu de CHANNEL_HARD_DENY e entrou como N2 / maxItems 1', () => {
    // ⚠️ ESTE CASO FOI INVERTIDO. Ele afirmava a inercia da unidade D2 ("segue em CHANNEL_HARD_DENY
    // e fora das elegiveis"), que era verdade enquanto ninguem chamava `buildWhatsAppReceiveConference`.
    // A unidade D4 ligou a previa a `tryIssueWhatsAppActionTicket` e promoveu a chave; manter a
    // afirmacao antiga aqui deixaria no repo um teste verde dizendo o contrario do codigo — que e
    // exatamente o modo de falha que esta cadeia ja pagou cinco vezes.
    assert.equal(CHANNEL_HARD_DENY.has(WHATSAPP_RECEIVE_ACTION_KEY), false);
    assert.deepEqual(WHATSAPP_ELIGIBLE_ACTIONS[WHATSAPP_RECEIVE_ACTION_KEY], { tier: 'N2', maxItems: 1 });
  });
});
