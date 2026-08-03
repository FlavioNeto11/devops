/**
 * CONTRASTE WCAG 2.x — a régua que o tema tem de passar.
 *
 * O Vuetify escolhe sozinho a cor do texto sobre cada cor do tema
 * (`getForeground`, em vuetify/lib/util/colorUtils.js) usando APCA e a regra
 * "prefira BRANCO quando os dois contrastes forem aceitáveis". No tema ESCURO
 * isso punha texto BRANCO sobre o verde primário `#35b493` — 2,59:1, longe do
 * mínimo AA de 4,5:1: botões primários ("Aplicar filtros", "Gerar certificado")
 * e chips selecionados ("Todos", "30 dias") ficavam lavados. O tema claro
 * passava (branco sobre `#0e6e5c` = 6,17:1), então o defeito só aparecia no
 * escuro.
 *
 * A correção é declarar `on-primary` explicitamente no tema (o Vuetify só
 * deriva a cor quando ela NÃO existe — ver `genOnColors`), reaproveitando o
 * token que a paleta já tinha: `--color-primary-contrast` (#ffffff no claro,
 * tinta escura #08110e no escuro). Este módulo é a régua que TRAVA isso:
 * `tests/unit/theme-contrast.test.js` mede os tokens do tema gerado.
 *
 * Fórmula: WCAG 2.1, 1.4.3 (luminância relativa sRGB + (L1+0.05)/(L2+0.05)).
 * Módulo PURO (sem Vue, sem DOM).
 */

/** Mínimos da WCAG 2.1 para texto normal e para texto grande/ícones. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;

/** `#rgb` ou `#rrggbb` -> { r, g, b } em 0-255. Lança em entrada inválida. */
export function parseHexColor(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  const hex = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new TypeError(`Cor hexadecimal inválida: "${value}"`);
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

/** Canal sRGB 0-255 -> linear (WCAG 2.1). */
function toLinearChannel(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (0 = preto, 1 = branco). */
export function relativeLuminance(color) {
  const { r, g, b } = parseHexColor(color);
  return 0.2126 * toLinearChannel(r) + 0.7152 * toLinearChannel(g) + 0.0722 * toLinearChannel(b);
}

/**
 * Razão de contraste entre duas cores opacas — de 1 (iguais) a 21
 * (preto x branco). A ordem dos argumentos não importa.
 */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Passa no AA? `large: true` afrouxa para 3:1 (texto grande/ícone). */
export function meetsWcagAA(foreground, background, { large = false } = {}) {
  const minimum = large ? WCAG_AA_LARGE_TEXT : WCAG_AA_NORMAL_TEXT;
  return contrastRatio(foreground, background) >= minimum;
}

/**
 * Pares texto-sobre-fundo que TODO tema do SICAT precisa cumprir.
 * Hoje: a superfície de marca (botão/chip primário preenchido), que é onde o
 * tema escuro falhava. `on-<cor>` é o nome que o Vuetify dá à cor do texto.
 */
export const REQUIRED_THEME_PAIRS = [{ foreground: 'on-primary', background: 'primary' }];

/**
 * Audita um mapa de cores (`{ primary: '#...', 'on-primary': '#...' }`) contra
 * REQUIRED_THEME_PAIRS. Devolve uma linha por par com a razão medida — a lista
 * de falhas é `filter(r => !r.passes)`.
 */
export function auditThemeContrast(colors = {}, { large = false } = {}) {
  return REQUIRED_THEME_PAIRS.map(({ foreground, background }) => {
    const fg = colors[foreground];
    const bg = colors[background];
    if (!fg || !bg) {
      return { foreground, background, ratio: 0, passes: false, missing: true };
    }
    const ratio = contrastRatio(fg, bg);
    return {
      foreground,
      background,
      ratio,
      passes: ratio >= (large ? WCAG_AA_LARGE_TEXT : WCAG_AA_NORMAL_TEXT),
      missing: false
    };
  });
}
