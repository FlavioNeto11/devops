/**
 * A TELA DE EMISSÃO DE CDF NÃO PODE OFERECER O QUE A LISTAGEM BLOQUEIA.
 *
 * `/cdf/novo` decidia elegibilidade com uma cópia LOCAL dos helpers de
 * manifesto. A cópia não conhecia `submit_unconfirmed` ("envio despachado para
 * a CETESB, desfecho DESCONHECIDO"), então um manifesto ainda sem confirmação
 * cujo espelho já trouxe 'Recebido' casava `status.includes('receb')` e a linha
 * vinha ELEGÍVEL — enquanto `canUseManifestForCdf` a bloqueia de propósito, para
 * o certificado não sair antes de a reconciliação fechar a dúvida.
 *
 * Este arquivo trava a tela no MESMO veredito da listagem, nos dois sentidos:
 * cada bloqueio vem em par com um CONTROLE NEGATIVO que precisa continuar
 * elegível — um teste que só sabe dizer `false` provaria apenas que a tela
 * quebrou.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MANIFEST_STATUS_SUBMIT_UNCONFIRMED } from '../../src/lib/status-map.js';
import { canUseManifestForCdf } from '../../src/features/mtr/list/manifestHelpers.js';
import {
  areAllEligibleSelected,
  buildCdfCandidateEntries,
  buildCdfCandidateEntry,
  collectEligibleManifestIds,
  collectEligibleSnapshots,
  resolveEligibleSelectionToggle
} from '../../src/features/cdf/cdfCandidateEligibility.js';

const UNCONFIRMED = MANIFEST_STATUS_SUBMIT_UNCONFIRMED;

/**
 * Linha COM identidade externa completa (hash, número e código). É o fixture
 * mais PERMISSIVO de propósito: era exatamente nele que a cópia da tela
 * devolvia motivo vazio. Um fixture magro passaria pela cópia antiga por falta
 * de identidade e não provaria nada.
 */
function manifest(overrides = {}) {
  return {
    id: 'mtr_u5',
    manifestNumber: '123456789',
    externalCode: '987654',
    externalHashCode: 'HASH-ABC',
    status: 'submitted',
    externalStatus: 'Recebido',
    generator: { document: '12.345.678/0001-90' },
    ...overrides
  };
}

/** O caso que vazava: sem confirmação, mas com 'Recebido' no espelho. */
const unconfirmedMirroredAsReceived = () => manifest({ id: 'mtr_leak', status: UNCONFIRMED });

// ---------------------------------------------------------------------------
// O bug: a tela oferecia o que a listagem bloqueia
// ---------------------------------------------------------------------------

test('envio sem confirmação com espelho "Recebido" NÃO é candidato elegível', () => {
  const entry = buildCdfCandidateEntry(unconfirmedMirroredAsReceived());

  assert.equal(entry.eligible, false, 'o certificado sairia antes de a reconciliação fechar a dúvida');
  assert.ok(entry.reason, 'linha bloqueada sem motivo é checkbox que some sem explicar');
});

test('CONTROLE NEGATIVO: recebido CONFIRMADO segue elegível', () => {
  // Sem este par, o teste acima passaria igual se a tela tivesse simplesmente
  // parado de aceitar qualquer manifesto. Este controle é o único aqui que
  // precisa passar TAMBÉM na versão antiga: ele mede o que o conserto NÃO podia
  // quebrar.
  const entry = buildCdfCandidateEntry(manifest());

  assert.equal(entry.eligible, true);
  assert.equal(entry.reason, '', 'elegível não tem motivo de bloqueio');
});

test('o snapshot leva a identidade externa e o CNPJ do gerador para a CETESB', () => {
  assert.deepEqual(buildCdfCandidateEntry(manifest()).snapshot, {
    manCodigo: '987654',
    manNumero: '123456789',
    manHashCode: 'HASH-ABC',
    parceiroGerador: { parCnpj: '12345678000190' }
  });
});

test('a explicação nomeia o estado e oferece a saída — nada de "Ainda não sincronizado"', () => {
  const { reason } = buildCdfCandidateEntry(unconfirmedMirroredAsReceived());

  assert.match(reason, /sem confirmação/i, 'precisa nomear o estado');
  assert.match(reason, /Atualizar da CETESB/, 'bloqueio sem saída vira beco');
  assert.doesNotMatch(reason, /_|unconfirmed/i, 'não pode vazar o token de máquina');
  // A frase da cópia antiga: sugere que nada saiu daqui, quando o envio SAIU e o
  // que se desconhece é o desfecho.
  assert.doesNotMatch(reason, /Ainda não sincronizado/i);
});

test('envio sem confirmação SEM espelho também é bloqueado, e pela mesma frase', () => {
  // Caso mais comum na prática: `submit_unconfirmed` nasce sem hash. A cópia
  // antiga bloqueava, mas mentindo ("Ainda não sincronizado com a CETESB").
  const semEspelho = manifest({
    status: UNCONFIRMED,
    externalStatus: '',
    externalHashCode: '',
    manifestNumber: '',
    externalCode: ''
  });
  const { eligible, reason } = buildCdfCandidateEntry(semEspelho);

  assert.equal(eligible, false);
  assert.match(reason, /sem confirmação/i);
  assert.doesNotMatch(reason, /Ainda não sincronizado/i);
});

// ---------------------------------------------------------------------------
// Paridade com a listagem — a causa-raiz era a SEGUNDA opinião
// ---------------------------------------------------------------------------

test('a tela concorda com canUseManifestForCdf em TODO status, nos dois sentidos', () => {
  const cenarios = [
    { nome: 'sem confirmação + espelho Recebido', patch: { status: UNCONFIRMED } },
    { nome: 'sem confirmação sem espelho', patch: { status: UNCONFIRMED, externalStatus: '' } },
    { nome: 'recebido confirmado', patch: {} },
    { nome: 'rascunho', patch: { status: 'draft', externalStatus: '' } },
    { nome: 'em processamento', patch: { status: 'processing', externalStatus: 'Salvo' } },
    { nome: 'enviado, aguardando baixa', patch: { externalStatus: 'Salvo' } },
    { nome: 'cancelado', patch: { status: 'cancelled', externalStatus: 'Cancelado' } },
    { nome: 'falhou', patch: { status: 'failed', externalStatus: '' } },
    { nome: 'recebido, mas já com CDF', patch: { cdfEmitidoNumero: 'CDF-77' } },
    { nome: 'sem identidade externa', patch: { externalHashCode: '', manifestNumber: '', externalCode: '' } },
    // Linha ACHATADA: é a forma como `mapManifestListItem` entrega os itens
    // desta tela (sem `externalReference`/`externalSnapshot`). A cópia local não
    // tinha o fallback e chamava isto de "Ainda não sincronizado".
    { nome: 'linha achatada da listagem, recebida', patch: { externalHashCode: '' } }
  ];

  const divergentes = cenarios.filter(({ patch }) => {
    const target = manifest(patch);
    return buildCdfCandidateEntry(target).eligible !== canUseManifestForCdf(target);
  });

  assert.deepEqual(
    divergentes.map(({ nome }) => nome),
    [],
    'a tela voltou a ter opinião própria sobre elegibilidade'
  );

  // CONTROLE DE SANIDADE: a matriz precisa conter os dois vereditos, senão a
  // asserção acima passaria vaziamente (ex.: tudo bloqueado dos dois lados).
  const vereditos = new Set(cenarios.map(({ patch }) => canUseManifestForCdf(manifest(patch))));
  assert.deepEqual([...vereditos].sort(), [false, true]);
});

test('linha achatada da listagem carrega manCodigo/manNumero para o payload da CETESB', () => {
  // A cópia local lia só `externalReference`/`externalSnapshot`, então o
  // snapshot saía vazio para as linhas da listagem.
  const { snapshot, eligible } = buildCdfCandidateEntry(manifest({ externalHashCode: '' }));

  assert.equal(eligible, true);
  assert.equal(snapshot.manNumero, '123456789');
  assert.equal(snapshot.manCodigo, '987654');
});

// ---------------------------------------------------------------------------
// Seleção: "Selecionar todos elegíveis" e marcação manual
// ---------------------------------------------------------------------------

const listaMista = () => buildCdfCandidateEntries([
  manifest({ id: 'mtr_ok_1' }),
  unconfirmedMirroredAsReceived(),
  manifest({ id: 'mtr_ok_2' }),
  manifest({ id: 'mtr_cancelado', status: 'cancelled', externalStatus: 'Cancelado' })
]);

test('"Selecionar todos elegíveis" não marca o envio sem confirmação', () => {
  const entries = listaMista();
  const selecionados = resolveEligibleSelectionToggle(entries, []);

  assert.deepEqual(selecionados, ['mtr_ok_1', 'mtr_ok_2']);
  assert.ok(!selecionados.includes('mtr_leak'), 'a seleção em massa vazava o estado sem confirmação');
  // CONTROLE: a lista TEM elegíveis — o teste não passa por lista vazia.
  assert.equal(collectEligibleManifestIds(entries).length, 2);
});

test('a seleção em massa preserva o que o operador marcou fora do conjunto elegível', () => {
  const entries = listaMista();

  const marcados = resolveEligibleSelectionToggle(entries, ['mtr_cancelado']);
  assert.deepEqual(marcados, ['mtr_cancelado', 'mtr_ok_1', 'mtr_ok_2']);

  // Segundo clique = "Limpar elegíveis": tira só os elegíveis, não a marcação manual.
  assert.equal(areAllEligibleSelected(entries, marcados), true);
  assert.deepEqual(resolveEligibleSelectionToggle(entries, marcados), ['mtr_cancelado']);
});

test('lista sem nenhum elegível não se declara "toda selecionada"', () => {
  // Senão o botão nasce escrito "Limpar elegíveis" numa lista onde não há o que limpar.
  const entries = buildCdfCandidateEntries([unconfirmedMirroredAsReceived()]);

  assert.equal(areAllEligibleSelected(entries, []), false);
  assert.equal(areAllEligibleSelected(entries, ['mtr_leak']), false);
});

test('marcar À MÃO um envio sem confirmação não o coloca no listaManifesto', () => {
  // O operador PODE marcar uma linha bloqueada (ela aparece no resumo com o
  // motivo). O que não pode é ela chegar ao payload da CETESB.
  const selecionadas = buildCdfCandidateEntries([
    manifest({ id: 'mtr_ok_1' }),
    unconfirmedMirroredAsReceived()
  ]);
  const snapshots = collectEligibleSnapshots(selecionadas);

  assert.equal(snapshots.length, 1, 'o envio sem confirmação entrou no certificado');
  assert.equal(snapshots[0].manNumero, '123456789');

  // CONTROLE NEGATIVO: com as duas confirmadas, as duas vão.
  const duasOk = buildCdfCandidateEntries([manifest({ id: 'mtr_ok_1' }), manifest({ id: 'mtr_ok_2' })]);
  assert.equal(collectEligibleSnapshots(duasOk).length, 2);
});

// ---------------------------------------------------------------------------
// Guard de superfície: a duplicação foi a causa-raiz
// ---------------------------------------------------------------------------

const VIEW_SOURCE = readFileSync(
  fileURLToPath(new URL('../../src/views/CdfCreateView.vue', import.meta.url)),
  'utf8'
);

/**
 * Helpers de manifesto que a view mantinha em cópia LOCAL. Cada um destes é
 * exportado por `manifestHelpers`; redeclarar qualquer um aqui reabre a porta
 * para as duas versões divergirem de novo — foi assim que o guard de
 * `submit_unconfirmed` existiu num lado e não no outro.
 */
const HELPERS_QUE_NAO_PODEM_VOLTAR = [
  'resolveManifestIdentifier',
  'resolveManifestIdentifiers',
  'resolveManifestSnapshot',
  'formatManifestLabel',
  'normalizedStatusValue',
  'hasIssuedCdfReference',
  'describeCdfManifestRestriction',
  'toIntegerOrNull',
  'normalizeDocument'
];

function findLocalDeclarations(source, names) {
  return names.filter((name) => new RegExp(`function\\s+${name}\\s*\\(`).test(source));
}

test('CdfCreateView não redeclara os helpers de manifesto', () => {
  const duplicados = findLocalDeclarations(VIEW_SOURCE, HELPERS_QUE_NAO_PODEM_VOLTAR);

  assert.deepEqual(
    duplicados,
    [],
    `CdfCreateView voltou a ter cópia local de: ${duplicados.join(', ')}. `
    + 'Estes helpers vêm de features/mtr/list/manifestHelpers.js — a cópia local '
    + 'é que perdeu o guard de submit_unconfirmed e liberou CDF para um envio '
    + 'de desfecho desconhecido.'
  );
});

test('CONTROLE NEGATIVO: o detector enxerga uma cópia local de verdade', () => {
  // Sem isto, o guard acima passaria igual com a regex quebrada ou o arquivo vazio.
  const comCopia = 'function describeCdfManifestRestriction(manifest) {\n  return "";\n}\n';
  assert.deepEqual(findLocalDeclarations(comCopia, HELPERS_QUE_NAO_PODEM_VOLTAR), ['describeCdfManifestRestriction']);
  assert.deepEqual(findLocalDeclarations(VIEW_SOURCE, ['toStartOfDayIso']), ['toStartOfDayIso'], 'o arquivo lido é a view real');
});

test('a view importa a decisão de elegibilidade, em vez de tomá-la', () => {
  assert.match(VIEW_SOURCE, /from '\.\.\/features\/cdf\/cdfCandidateEligibility\.js'/);
  assert.match(VIEW_SOURCE, /from '\.\.\/features\/mtr\/list\/manifestHelpers\.js'/);
});
