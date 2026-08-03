/**
 * Regras de ACESSO POR PERFIL (persona) da conta CETESB ativa — módulo PURO.
 *
 * Perfis: 'generator' (gerador — emite MTR), 'carrier' (transportador — acompanha)
 * e 'receiver' (destinador — dá baixa/recebe + gera CDF).
 *
 * Estas funções viviam dentro de `router.js`, que importa `.vue` e o router do
 * Vue — ou seja, não eram importáveis fora do bundler e o guard de persona
 * ficava SEM teste que o prendesse (um Destinador conseguindo abrir "Emitir MTR"
 * não quebrava nada verde). Aqui elas são puras (sem Vue, sem store, sem DOM) e
 * cobertas por `test/unit/persona-access.test.js`.
 *
 * Comportamento preservado 1:1 do que já estava no router e em
 * `config/navigation.js` (`personaAllows`): rota sem `meta.personas` é livre e
 * perfil NÃO resolvido não restringe nada (fail-open deliberado — enquanto o
 * backend não devolve o `accountType`, a UI não pode trancar o operador fora).
 */

export const PERSONA_LABELS = Object.freeze({
  generator: 'Gerador',
  carrier: 'Transportador',
  receiver: 'Destinador'
});

/** Perfis reconhecidos. Qualquer outro valor conta como "não resolvido". */
export const KNOWN_PERSONAS = Object.freeze(Object.keys(PERSONA_LABELS));

/**
 * Normaliza o `accountType` cru da conta CETESB para um perfil conhecido.
 * @returns {string} 'generator' | 'carrier' | 'receiver' | '' (não resolvido)
 */
export function normalizePersona(accountType) {
  const value = String(accountType || '').trim().toLowerCase();
  return KNOWN_PERSONAS.includes(value) ? value : '';
}

/**
 * Perfil da conta CETESB ativa no store de auth. Mesma derivação de
 * `usePersona()`: '' quando o backend ainda não resolveu o tipo da conta.
 */
export function resolveActivePersona(authStore) {
  return normalizePersona(authStore?.activeAccount?.value?.accountType);
}

/**
 * A rota é permitida para o perfil? Rota sem `meta.personas` é livre; perfil não
 * resolvido ('') NÃO restringe — assim menu e acesso por URL direta contam a
 * mesma história.
 */
export function routeAllowsPersona(to, persona) {
  const allowed = Array.isArray(to?.meta?.personas) ? to.meta.personas : null;
  if (!allowed || !allowed.length) {
    return true;
  }

  if (!persona) {
    return true;
  }

  return allowed.includes(persona);
}

/** "Gerador" / "Gerador ou Destinador" — texto do aviso de rota negada. */
export function describeRequiredPersonas(to) {
  const allowed = Array.isArray(to?.meta?.personas) ? to.meta.personas : [];
  const labels = allowed.map((item) => PERSONA_LABELS[item] || item).filter(Boolean);
  if (!labels.length) {
    return '';
  }

  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} ou ${labels[labels.length - 1]}`;
}
