import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cetesbEvidenceDir, requiredHarFiles, cetesbEvidenceMapping } from '../../src/lib/cetesb-source-of-truth.ts';

test('docs/cetesb contém todos HARs obrigatórios', () => {
  assert.equal(fs.existsSync(cetesbEvidenceDir), true, 'Pasta docs/cetesb deve existir');

  for (const harFile of requiredHarFiles) {
    const harPath = path.join(cetesbEvidenceDir, harFile);
    assert.equal(fs.existsSync(harPath), true, `HAR obrigatório ausente: ${harFile}`);
  }
});

test('mapeamento de evidência CETESB é coerente', () => {
  const operations = Object.keys(cetesbEvidenceMapping);
  assert.equal(operations.length > 0, true, 'Mapeamento de evidências não pode ser vazio');

  for (const operation of operations) {
    const harFile = cetesbEvidenceMapping[operation];
    assert.equal(requiredHarFiles.includes(harFile), true, `Operação ${operation} deve mapear para HAR obrigatório`);
  }
});

// ── Âncoras MTR provisório (cadeia mtr-provisorio-fluxo-base, fase 02) ──
// Estes asserts congelam evidência observada nos HARs reais para os campos
// críticos do MTR provisório, evitando regressão de fonte da verdade quando a
// fase 03 (gateway) e a fase 04 (backend) modelarem a variante.
//
// Evidência:
// - docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har
//   • GET /api/mtr/manifesto/provisorio/{parCodigo}/{flag} (listagem de
//     provisórios pendentes do parceiro — resposta `objetoResposta: []`)
//   • PUT /api/mtr/manifesto com body contendo `tipoManifesto`
// - docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har
//   • Resposta de listagem unificada com `mtrProvisorioNumero` e
//     `mtrProvisorioDataRecebimento` em todos os itens.
//
// Veredicto fase 02 (resumo): listagem provisória CONFIRMADA,
// criação/impressão pura provisória SUPOSIÇÃO. Detalhes em
// docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md.

test('HAR gerar_mtr expõe endpoint dedicado de listagem de MTR provisório', () => {
  const harPath = path.join(cetesbEvidenceDir, 'mtr.cetesb.sp.gov.br_gerar_mtr.har');
  const raw = fs.readFileSync(harPath, 'utf8');
  assert.match(
    raw,
    /\/api\/mtr\/manifesto\/provisorio\/\d+\/(true|false)/,
    'Endpoint /api/mtr/manifesto/provisorio/{parCodigo}/{flag} é fonte de verdade para listagem provisória'
  );
});

test('HAR imprimir_mtr fixa campos provisórios no payload de manifesto', () => {
  const harPath = path.join(cetesbEvidenceDir, 'mtr.cetesb.sp.gov.br_imprimir_mtr.har');
  const raw = fs.readFileSync(harPath, 'utf8');
  // Os campos aparecem dentro de strings JSON escapadas (`\"campo\":...`)
  // porque o body é serializado como string no HAR. Verificamos somente a
  // presença textual da chave, independente de aspas escapadas.
  for (const key of ['tipoManifesto', 'mtrProvisorioNumero', 'mtrProvisorioDataRecebimento']) {
    assert.equal(
      raw.includes(key),
      true,
      `Campo ${key} deve aparecer no HAR de imprimir/listar como discriminador/dado da variante provisória`
    );
  }
});

test('HAR gerar_mtr fixa discriminador tipoManifesto no body de criação', () => {
  const harPath = path.join(cetesbEvidenceDir, 'mtr.cetesb.sp.gov.br_gerar_mtr.har');
  const raw = fs.readFileSync(harPath, 'utf8');
  // O body capturado é de MTR definitivo (`tipoManifesto":1`); o valor numérico
  // exato para a variante provisória é SUPOSIÇÃO até nova captura. O assert
  // congela apenas a presença do campo discriminador (string escapada).
  assert.match(
    raw,
    /tipoManifesto\\?":\s*\d+/,
    'Body PUT /api/mtr/manifesto deve conter campo numérico tipoManifesto (discriminador)'
  );
});
