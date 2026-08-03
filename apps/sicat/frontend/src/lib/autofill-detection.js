/**
 * AUTOFILL DO NAVEGADOR × RÓTULO FLUTUANTE DA VUETIFY.
 *
 * Na porta de entrada do produto (/sicat/login), quando o Chrome/Edge preenchia
 * as credenciais salvas, os rótulos NÃO subiam: "E-mail" ficava impresso sobre o
 * endereço e "Senha" sobre a máscara — ilegíveis.
 *
 * Causa: o rótulo sobe quando o `VField` está `active`, e
 * `active = focused || dirty` (`VTextField.js`: `isActive = ... || props.active`,
 * `VField` recebe `active: isActive || isDirty`). O preenchimento automático não
 * dispara os eventos que o v-model escuta — o `<input>` do DOM tem valor, o
 * estado do Vue não —, então nem `focused` nem `dirty` ficam verdadeiros.
 *
 * Detecção: o truque clássico `onAutoFillStart` (WebKit/Blink) — pendurar uma
 * animação CSS de duração desprezível em `input:-webkit-autofill` e ouvir o
 * evento `animationstart`, que é o único sinal que o navegador emite ao
 * autopreencher. Contraparte em `input:not(:-webkit-autofill)` para saber quando
 * o autofill foi DESFEITO.
 * Referência: MDN — `:autofill` / `-webkit-autofill` ("Detecting autofill" com
 * `animationstart`), padrão adotado por Material-UI (`useAutoFill`), Angular
 * Material (`AutofillMonitor`) e pelo próprio issue vuetifyjs/vuetify#7017.
 *
 * O nome da animação chega SUFIXADO quando declarada em `<style scoped>` (o
 * compilador do Vue reescreve `@keyframes x` para `x-<hash>`), por isso o
 * casamento é por PREFIXO e nunca por igualdade.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em
 * tests/unit/autofill-detection.test.js.
 */

/** Animação disparada quando o navegador PREENCHE o campo. */
export const AUTOFILL_ANIMATION_START = 'sicat-autofill-start';
/** Animação disparada quando o campo deixa de estar autopreenchido. */
export const AUTOFILL_ANIMATION_CANCEL = 'sicat-autofill-cancel';

/**
 * Fase do autofill correspondente ao nome da animação.
 * @returns {'start' | 'cancel' | null}
 */
export function matchAutofillAnimation(animationName) {
  const name = String(animationName ?? '');

  // 'cancel' é testado ANTES: os dois nomes compartilham o prefixo do app e uma
  // checagem frouxa em 'start' engoliria o cancelamento.
  if (name.startsWith(AUTOFILL_ANIMATION_CANCEL)) {
    return 'cancel';
  }

  if (name.startsWith(AUTOFILL_ANIMATION_START)) {
    return 'start';
  }

  return null;
}

/**
 * Qual campo do formulário o evento atingiu.
 *
 * O alvo do `animationstart` é o `<input>`, mas a Vuetify NÃO repassa `data-*`
 * para ele: `filterInputAttrs` (`vuetify/lib/util/helpers.js`) manda
 * `class`, `style`, `id`, `inert` e `/^data-/` para a RAIZ do `.v-input` e só o
 * resto para o input. Por isso a chave é procurada subindo com `closest()`;
 * `name` (esse sim chega ao input) fecha como última rede.
 */
export function resolveAutofillFieldKey(target) {
  if (!target) {
    return '';
  }

  const ownKey = target.dataset?.autofillKey;
  if (ownKey) {
    return String(ownKey);
  }

  const owner = target.closest?.('[data-autofill-key]');
  const inheritedKey = owner?.dataset?.autofillKey || owner?.getAttribute?.('data-autofill-key');
  if (inheritedKey) {
    return String(inheritedKey);
  }

  return String(target.name || '');
}

/**
 * Novo estado de autofill do formulário a partir de um `animationstart`.
 *
 * Devolve o MESMO objeto quando nada muda — o componente pode atribuir o
 * resultado direto ao `ref` sem provocar renderização à toa a cada frame de
 * animação de campo que não interessa.
 */
export function reduceAutofillState(currentState, event) {
  const state = currentState && typeof currentState === 'object' ? currentState : {};
  const phase = matchAutofillAnimation(event?.animationName);
  if (!phase) {
    return state;
  }

  const fieldKey = resolveAutofillFieldKey(event?.target);
  if (!fieldKey) {
    return state;
  }

  const isAutofilled = phase === 'start';
  if (Boolean(state[fieldKey]) === isAutofilled) {
    return state;
  }

  return { ...state, [fieldKey]: isAutofilled };
}
