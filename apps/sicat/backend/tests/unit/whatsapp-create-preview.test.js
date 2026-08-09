import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWhatsAppCreatePreview,
  buildCompleteCreatePreview,
  buildReplicateCreatePreview,
  computeReplicateChanges,
  isHumanName,
  setWhatsAppCreatePreviewResolversForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-create-preview.js';

/**
 * D3 — PRÉVIA DE CONFERÊNCIA PARA CRIAR MANIFESTO POR WHATSAPP.
 *
 * REGRAS DE ESCRITA (as mesmas que a cadeia WhatsApp pagou caro):
 *  1. Os DOUBLES são as LEITURAS (manifesto, parceiro, resíduo) — nunca a decisão sob teste. O double
 *     devolve o valor cru; quem decide "isso é rótulo humano?" é o módulo.
 *  2. VALORES DISTINTOS POR ENTIDADE: cada papel tem código, nome e — no replicar — número/gerador/data
 *     próprios. Com o mesmo valor para todos, uma troca de sujeito (nome do gerador no lugar do
 *     transportador) ficaria invisível.
 *  3. CONTROLE NEGATIVO obrigatório: para cada guarda, um caso que prova que o double CONSEGUE enxergar
 *     a diferença — senão o teste pode estar passando por construção.
 *  4. Cada caso diz, no texto, qual mutação ele mata.
 */

/* ============================================================================================== */
/* Harness — doubles das leituras, valores DISTINTOS por entidade                                  */
/* ============================================================================================== */

const SRC_A = `man_${'a'.repeat(26)}`;
const SRC_B = `man_${'b'.repeat(26)}`;
const SRC_NO_NUMBER = `man_${'c'.repeat(26)}`;

function sourceManifests() {
  return new Map([
    [SRC_A, {
      id: SRC_A,
      externalReference: { manNumero: '202600111111' },
      payload: {
        generator: { description: 'NOVA IT AMBIENTAL' },
        expeditionDate: '2026-03-12',
        residues: [{ residue: { code: '77', description: 'Oleo lubrificante usado' }, unit: { abbreviation: 't' }, quantity: 2 }]
      }
    }],
    [SRC_B, {
      id: SRC_B,
      externalReference: { manNumero: '202600222222' },
      payload: {
        generator: { description: 'RECICLA SP LTDA' },
        expeditionDate: '2026-05-01',
        residues: [{ residue: { code: '88', description: 'Borra oleosa' }, unit: { abbreviation: 'kg' }, quantity: 500 }]
      }
    }],
    // Origem sem número: gerador presente, mas `manNumero` ausente → não é conferível.
    [SRC_NO_NUMBER, {
      id: SRC_NO_NUMBER,
      externalReference: {},
      payload: { generator: { description: 'SEM NUMERO SA' }, expeditionDate: '2026-06-06', residues: [] }
    }]
  ]);
}

/**
 * Códigos → nomes DISTINTOS por papel. Um bug que lesse o record do papel errado mostraria o nome
 * errado sob o cabeçalho, e os asserts por linha ("Gerador: NOVA IT…") o pegam.
 */
const PARTNER_NAMES = new Map([
  ['111', 'NOVA IT AMBIENTAL'],
  ['222', 'TRANSLOG XYZ TRANSPORTES'],
  ['333', 'ATERRO CENTRAL SA']
]);
const RESIDUE_NAMES = new Map([
  ['77', 'Oleo lubrificante usado'],
  ['88', 'Borra oleosa'],
  ['99', 'Residuo de tinta']
]);

function makeResolvers(overrides = {}) {
  const manifests = overrides.manifests ?? sourceManifests();
  const calls = { manifests: [], partners: [], residues: [] };
  const resolvers = {
    findManifestById: overrides.findManifestById ?? (async (id) => {
      calls.manifests.push(id);
      return manifests.get(id) ?? null;
    }),
    resolvePartnerLabel: overrides.resolvePartnerLabel ?? (async ({ code, role }) => {
      calls.partners.push({ code, role });
      return PARTNER_NAMES.get(String(code)) ?? null;
    }),
    resolveResidueLabel: overrides.resolveResidueLabel ?? (async ({ code }) => {
      calls.residues.push({ code });
      return RESIDUE_NAMES.get(String(code)) ?? null;
    })
  };
  return { resolvers, calls };
}

function install(overrides = {}) {
  const built = makeResolvers(overrides);
  setWhatsAppCreatePreviewResolversForTests(built.resolvers);
  return built;
}

afterEach(() => {
  setWhatsAppCreatePreviewResolversForTests(null);
});

/** Payload completo com as 6 entidades preenchidas por CÓDIGO (resolvido contra o cadastro). */
function completePayloadByCode(overrides = {}) {
  return {
    generator: { partnerCode: '111' },
    carrier: { partnerCode: '222' },
    receiver: { partnerCode: '333' },
    residues: [{ residue: { code: '77' }, unit: { abbreviation: 't' }, quantity: 3 }],
    expeditionDate: '2026-03-15',
    ...overrides
  };
}

/* ============================================================================================== */
/* isHumanName — a peça central do fail-closed                                                     */
/* ============================================================================================== */

describe('isHumanName', () => {
  it('reprova código cru, id interno e eco do código; aprova razão social', () => {
    // Mata: aceitar "12345" ou "man_a1b2c3" como rótulo conferível.
    assert.equal(isHumanName('12345'), false, 'só dígitos é código, não nome');
    assert.equal(isHumanName('man_a1b2c3d4'), false, 'id interno não é nome');
    assert.equal(isHumanName('11', '11'), false, 'muito curto');
    assert.equal(isHumanName('NOVA IT', 'NOVA IT'), false, 'eco literal do código não é resolução');
    assert.equal(isHumanName('NOVA IT AMBIENTAL', '111'), true);
  });
});

/* ============================================================================================== */
/* COMPLETO — caminho feliz e a ordem/rótulo das 6 entidades                                        */
/* ============================================================================================== */

describe('buildCompleteCreatePreview — caminho feliz', () => {
  it('resolve as 6 entidades e cada nome cai sob o cabeçalho CERTO', async () => {
    // Mata: trocar o record de um papel pelo de outro (nome do gerador sob "Transportador").
    install();
    const result = await buildCompleteCreatePreview({
      mode: 'complete',
      payload: completePayloadByCode(),
      accountLabel: 'NOVA IT AMBIENTAL LTDA (12.345.678/0001-90)'
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'complete');
    assert.equal(result.itemLabels.length, 6, 'as 6 entidades viram itemLabels');

    // Cada nome DISTINTO sob seu cabeçalho — a prova anti-"concorda consigo mesmo".
    assert.match(result.text, /Gerador: NOVA IT AMBIENTAL/);
    assert.match(result.text, /Transportador: TRANSLOG XYZ TRANSPORTES/);
    assert.match(result.text, /Destinador: ATERRO CENTRAL SA/);
    assert.match(result.text, /Residuo: Oleo lubrificante usado/);
    assert.match(result.text, /Quantidade: 3 t/);
    assert.match(result.text, /Data de expedicao: 15\/03\/2026/);
    assert.match(result.text, /Conta CETESB: NOVA IT AMBIENTAL LTDA/);
  });

  it('aceita descrição INLINE sem tocar no resolvedor de parceiro', async () => {
    // Mata: ignorar a descrição já montada e sempre bater no cadastro (ou o contrário).
    const built = install();
    const payload = completePayloadByCode({
      generator: { partnerCode: '111', description: 'GERADOR INLINE SA' }
    });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });

    assert.equal(result.ok, true);
    assert.match(result.text, /Gerador: GERADOR INLINE SA/);
    assert.ok(!built.calls.partners.some((c) => c.role === 'generator'), 'inline não deve chamar o cadastro para o gerador');
    assert.ok(built.calls.partners.some((c) => c.role === 'carrier'), 'transportador (só código) ainda resolve pelo cadastro');
  });

  it('resolve parceiro passando o PAPEL correto para cada código', async () => {
    // Mata: resolver todos os parceiros com o mesmo papel (perde o alias por papel).
    const built = install();
    await buildCompleteCreatePreview({ mode: 'complete', payload: completePayloadByCode() });
    assert.deepEqual(
      built.calls.partners.sort((a, b) => a.code.localeCompare(b.code)),
      [{ code: '111', role: 'generator' }, { code: '222', role: 'carrier' }, { code: '333', role: 'receiver' }]
    );
  });
});

/* ============================================================================================== */
/* COMPLETO — FAIL-CLOSED: uma entidade crua/faltando recusa o ticket                               */
/* ============================================================================================== */

describe('buildCompleteCreatePreview — fail-closed', () => {
  it('gerador que fica só no código (cadastro não resolve) → ok:false, sem prévia', async () => {
    // Mata: emitir prévia com entidade crua. Afrouxar o `if (unresolved.length > 0)` reprova aqui.
    install({ resolvePartnerLabel: async ({ code, role }) => (role === 'generator' ? null : PARTNER_NAMES.get(String(code)) ?? null) });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload: completePayloadByCode() });

    assert.equal(result.ok, false);
    assert.equal(result.blocker, 'unresolved_entities');
    assert.deepEqual(result.unresolved, ['Gerador']);
    assert.equal(result.text, undefined, 'bloqueado não carrega prévia (não há ticket)');
  });

  it('CONTROLE NEGATIVO: o mesmo payload, com o gerador resolvido, passa', async () => {
    // Prova que o double CONSEGUE resolver o gerador — o ok:false acima é da guarda, não do harness.
    install();
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload: completePayloadByCode() });
    assert.equal(result.ok, true);
    assert.match(result.text, /Gerador: NOVA IT AMBIENTAL/);
  });

  it('partnerCode cru como descrição (eco do código) NÃO conta como rótulo humano', async () => {
    // Mata: aceitar `description === partnerCode` como resolução.
    install({ resolvePartnerLabel: async () => null });
    const payload = completePayloadByCode({ receiver: { partnerCode: '333', description: '333' } });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });
    assert.equal(result.ok, false);
    assert.ok(result.unresolved.includes('Destinador'));
  });

  it('data de expedição inválida → ok:false com "Data de expedicao"', async () => {
    install();
    const payload = completePayloadByCode({ expeditionDate: 'ontem' });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });
    assert.equal(result.ok, false);
    assert.deepEqual(result.unresolved, ['Data de expedicao']);
  });

  it('quantidade ausente/zero → ok:false com "Quantidade"', async () => {
    install();
    const payload = completePayloadByCode({ residues: [{ residue: { code: '77' }, unit: { abbreviation: 't' }, quantity: 0 }] });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });
    assert.equal(result.ok, false);
    assert.deepEqual(result.unresolved, ['Quantidade']);
  });

  it('MAIS DE UM resíduo é recusado (conferir "o primeiro" e criar N esconde resíduos)', async () => {
    // Mata: relaxar o `residues.length !== 1` para `>= 1` e conferir só o primeiro.
    install();
    const payload = completePayloadByCode({
      residues: [
        { residue: { code: '77' }, unit: { abbreviation: 't' }, quantity: 3 },
        { residue: { code: '88' }, unit: { abbreviation: 't' }, quantity: 1 }
      ]
    });
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });
    assert.equal(result.ok, false);
    assert.ok(result.unresolved.includes('Residuo'));
    assert.ok(result.unresolved.includes('Quantidade'));
  });

  it('payload vazio → blocker empty_payload', async () => {
    install();
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload: {} });
    assert.equal(result.ok, false);
    assert.equal(result.blocker, 'empty_payload');
  });

  it('várias faltando: reporta TODAS, dedup, sem prévia', async () => {
    install({ resolvePartnerLabel: async () => null, resolveResidueLabel: async () => null });
    const payload = {
      generator: { partnerCode: '111' },
      carrier: { partnerCode: '222' },
      receiver: { partnerCode: '333' },
      residues: [{ residue: { code: '77' }, unit: {}, quantity: 3 }],
      expeditionDate: '2026-03-15'
    };
    const result = await buildCompleteCreatePreview({ mode: 'complete', payload });
    assert.equal(result.ok, false);
    // gerador, transportador, destinador e resíduo não resolvem; quantidade e data sim.
    assert.deepEqual(result.unresolved.sort(), ['Destinador', 'Gerador', 'Residuo', 'Transportador']);
  });
});

/* ============================================================================================== */
/* REPLICAR — origem + diferença                                                                    */
/* ============================================================================================== */

describe('buildReplicateCreatePreview', () => {
  it('mostra a ORIGEM (MTR + gerador + resíduo) e a DIFERENÇA de quantidade', async () => {
    // Mata: prévia que não reflete o override (a "diferença de fato").
    install();
    const result = await buildReplicateCreatePreview({
      mode: 'replicate',
      sourceManifestId: SRC_A,
      overrides: { quantity: 3 }
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'replicate');
    assert.match(result.text, /Origem: MTR 202600111111 - NOVA IT AMBIENTAL/);
    assert.match(result.text, /Residuo: Oleo lubrificante usado/);
    assert.match(result.text, /O que muda:/);
    assert.match(result.text, /Quantidade: de 2 t para 3 t/);
    assert.equal(result.itemLabels[0], 'MTR 202600111111 - NOVA IT AMBIENTAL');
  });

  it('MUTAÇÃO da quantidade: overrides distintos produzem prévias distintas', async () => {
    // Mata: `computeReplicateChanges` que ignora `overrides` (constante). 3 t e 5 t têm de divergir.
    install();
    const three = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 3 } });
    install();
    const five = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 5 } });

    assert.match(three.text, /para 3 t/);
    assert.match(five.text, /para 5 t/);
    assert.notEqual(three.text, five.text, 'a prévia REFLETE o override — não é constante');
  });

  it('override IGUAL à origem não vira diferença (copia idêntica)', async () => {
    // Mata: listar "de 2 t para 2 t" como se fosse mudança.
    install();
    const result = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 2 } });
    assert.equal(result.ok, true);
    assert.match(result.text, /nada - seria uma copia identica/);
    assert.doesNotMatch(result.text, /Quantidade: de/);
  });

  it('diferença de DATA de expedição é refletida', async () => {
    install();
    const result = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { expeditionDate: '2026-04-20' } });
    assert.equal(result.ok, true);
    assert.match(result.text, /Data de expedicao: de 12\/03\/2026 para 20\/04\/2026/);
  });

  it('origens DISTINTAS produzem rótulos distintos (double não é constante)', async () => {
    // Mata: harness que devolve sempre o mesmo manifesto.
    install();
    const a = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 3 } });
    install();
    const b = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_B, overrides: { quantity: 600 } });
    assert.match(a.text, /Origem: MTR 202600111111 - NOVA IT AMBIENTAL/);
    assert.match(b.text, /Origem: MTR 202600222222 - RECICLA SP LTDA/);
    assert.match(b.text, /Quantidade: de 500 kg para 600 kg/);
  });

  it('origem inexistente → ok:false source_unconferible', async () => {
    install();
    const result = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: `man_${'e'.repeat(26)}`, overrides: { quantity: 3 } });
    assert.equal(result.ok, false);
    assert.equal(result.blocker, 'source_unconferible');
  });

  it('origem SEM número não é conferível → ok:false; CONTROLE: com número passa', async () => {
    // Mata: aceitar origem que não dá para conferir (degradar para "MTR man_...").
    install();
    const noNumber = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_NO_NUMBER, overrides: { quantity: 3 } });
    assert.equal(noNumber.ok, false);
    assert.equal(noNumber.blocker, 'source_unconferible');

    install();
    const withNumber = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 3 } });
    assert.equal(withNumber.ok, true);
  });

  it('sourceManifestId vazio → ok:false sem tocar no banco', async () => {
    const built = install();
    const result = await buildReplicateCreatePreview({ mode: 'replicate', sourceManifestId: '   ', overrides: { quantity: 3 } });
    assert.equal(result.ok, false);
    assert.equal(built.calls.manifests.length, 0);
  });
});

/* ============================================================================================== */
/* computeReplicateChanges — unidade pura                                                           */
/* ============================================================================================== */

describe('computeReplicateChanges', () => {
  it('sem overrides → nenhuma mudança', () => {
    assert.deepEqual(computeReplicateChanges({ quantity: 2, unitLabel: 't', expeditionDate: '2026-03-12' }, null), []);
  });

  it('só reporta o que MUDA de fato', () => {
    const changes = computeReplicateChanges(
      { quantity: 2, unitLabel: 't', expeditionDate: '2026-03-12' },
      { quantity: 2, expeditionDate: '2026-04-01' }
    );
    // quantidade igual (2==2) não entra; data muda.
    assert.equal(changes.length, 1);
    assert.equal(changes[0].heading, 'Data de expedicao');
  });
});

/* ============================================================================================== */
/* buildWhatsAppCreatePreview — despacho por modo                                                   */
/* ============================================================================================== */

describe('buildWhatsAppCreatePreview', () => {
  it('despacha replicate e complete para o caminho certo', async () => {
    install();
    const rep = await buildWhatsAppCreatePreview({ mode: 'replicate', sourceManifestId: SRC_A, overrides: { quantity: 3 } });
    assert.equal(rep.mode, 'replicate');
    install();
    const com = await buildWhatsAppCreatePreview({ mode: 'complete', payload: completePayloadByCode() });
    assert.equal(com.mode, 'complete');
  });
});
