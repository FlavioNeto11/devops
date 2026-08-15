/**
 * CONTRASTE DO TEMA — texto branco sobre o verde primário do tema ESCURO dava
 * 2,59:1 (o mínimo AA é 4,5:1). Atingia botões primários ("Aplicar filtros",
 * "Gerar certificado") e chips selecionados ("Todos", "30 dias"); o tema claro
 * passava, então o defeito só aparecia no escuro.
 *
 * A correção declara `on-primary` no tema (o Vuetify só inventa a cor do texto
 * quando ela falta) com o token que a paleta CSS já usava — verde intacto,
 * tinta escura por cima. Estes testes TRAVAM o resultado: se alguém mexer no
 * verde ou remover o `on-primary`, o teste cai.
 *
 * O último caso é um CONTROLE NEGATIVO: prova que a régua acusa o defeito
 * original (branco sobre o verde) em vez de aprovar qualquer par de cores.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WCAG_AA_NORMAL_TEXT,
  auditThemeContrast,
  contrastRatio,
  meetsWcagAA,
  parseHexColor,
  relativeLuminance
} from '../../src/lib/wcag-contrast.js';
import { sicatVuetifyThemes } from '../../src/plugins/vuetify-theme.generated.js';

/** Arredonda como a auditoria reporta (2 casas). */
const ratio = (fg, bg) => Math.round(contrastRatio(fg, bg) * 100) / 100;

test('razão de contraste bate com os valores conhecidos da WCAG', () => {
  assert.equal(ratio('#000000', '#ffffff'), 21);
  assert.equal(ratio('#ffffff', '#ffffff'), 1);
  // Simétrica: a ordem dos argumentos não muda a razão.
  assert.equal(ratio('#35b493', '#ffffff'), ratio('#ffffff', '#35b493'));
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
});

test('hex de 3 dígitos e sem "#" são aceitos; lixo é rejeitado', () => {
  assert.deepEqual(parseHexColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHexColor('35b493'), { r: 53, g: 180, b: 147 });
  assert.throws(() => parseHexColor('verde'), TypeError);
  assert.throws(() => parseHexColor(''), TypeError);
});

test('todo tema declara on-primary (senão o Vuetify escolhe branco sozinho)', () => {
  for (const [name, theme] of Object.entries(sicatVuetifyThemes)) {
    assert.ok(theme.colors.primary, `${name}: sem primary`);
    assert.ok(theme.colors['on-primary'], `${name}: sem on-primary declarado`);
  }
});

test('texto sobre o primário passa no AA nos DOIS temas', () => {
  for (const [name, theme] of Object.entries(sicatVuetifyThemes)) {
    const findings = auditThemeContrast(theme.colors);
    for (const finding of findings) {
      assert.ok(
        finding.passes,
        `${name}: ${finding.foreground} sobre ${finding.background} = ${finding.ratio.toFixed(2)}:1 (mínimo ${WCAG_AA_NORMAL_TEXT}:1)`
      );
    }
  }
});

test('números medidos do tema escuro e do tema claro', () => {
  // Claro: branco sobre o verde-petróleo escuro — já passava, segue igual.
  assert.equal(ratio(sicatVuetifyThemes.sicat['colors']['on-primary'], sicatVuetifyThemes.sicat.colors.primary), 6.17);
  // Escuro: tinta escura sobre o MESMO verde da marca (o verde não mudou).
  assert.equal(sicatVuetifyThemes.sicatDark.colors.primary, '#35b493');
  assert.equal(ratio(sicatVuetifyThemes.sicatDark.colors['on-primary'], sicatVuetifyThemes.sicatDark.colors.primary), 7.39);
});

test('CONTROLE NEGATIVO: a régua reprova o defeito original (branco no verde escuro)', () => {
  const defeito = ratio('#ffffff', '#35b493');
  assert.equal(defeito, 2.59);
  assert.equal(meetsWcagAA('#ffffff', '#35b493'), false);

  // E a auditoria também reprova um tema montado com o par defeituoso —
  // prova de que ela olha as cores, não o nome do tema.
  const [finding] = auditThemeContrast({ primary: '#35b493', 'on-primary': '#ffffff' });
  assert.equal(finding.passes, false);
  assert.equal(Math.round(finding.ratio * 100) / 100, 2.59);

  // Cor ausente é falha, não aprovação silenciosa.
  const [semCor] = auditThemeContrast({ primary: '#35b493' });
  assert.equal(semCor.passes, false);
  assert.equal(semCor.missing, true);
});
