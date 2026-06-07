import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Coordena o cabeçalho de página entre o shell (SicatAppShell) e as views.
 *
 * Quase todas as views renderizam o seu próprio SicatPageHeader (via
 * SicatPageLayout #header). Sem coordenação, o shell renderiza um header genérico
 * E a view renderiza o seu → cabeçalho duplicado em toda a aplicação.
 *
 * A view que fornece header registra-se aqui; o shell então suprime o header
 * genérico, evitando a duplicação — de forma adaptativa (views sem header próprio
 * continuam recebendo o header do shell).
 */
const viewHeaderCount = ref(0);

export function useProvidesPageHeader(isActive) {
  const resolveActive = () => {
    const value = typeof isActive === 'function' ? isActive() : isActive;
    if (value && typeof value === 'object' && 'value' in value) return Boolean(value.value);
    return value === undefined ? true : Boolean(value);
  };

  let registered = false;
  const register = () => {
    if (!registered && resolveActive()) {
      viewHeaderCount.value += 1;
      registered = true;
    }
  };
  const unregister = () => {
    if (registered) {
      viewHeaderCount.value = Math.max(0, viewHeaderCount.value - 1);
      registered = false;
    }
  };

  onMounted(register);
  onBeforeUnmount(unregister);
  watch(resolveActive, (active) => (active ? register() : unregister()));
}

/** Reativo: o shell deve ocultar o header genérico (uma view já fornece o seu). */
export const shellHasViewHeader = computed(() => viewHeaderCount.value > 0);
