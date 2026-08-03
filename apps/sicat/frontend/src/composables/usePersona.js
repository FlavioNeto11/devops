import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { KNOWN_PERSONAS, PERSONA_LABELS } from '../lib/persona-access.js';

/**
 * Fonte ÚNICA do PERFIL operacional do usuário, derivado do tipo da conta CETESB
 * ativa: 'generator' (gerador — cria MTR), 'carrier' (transportador — só acompanha)
 * ou 'receiver' (destinador — dá baixa/recebe + gera CDF).
 *
 * Use isto em vez de reler `activeAccount.accountType` solto em cada tela, para a
 * UX por perfil ficar consistente (hub, navegação, onboarding).
 */
// Rótulos e lista de perfis vêm do módulo PURO `lib/persona-access.js` (mesma
// fonte usada pelo guard de rota) — reexportados para não quebrar quem já
// importava KNOWN_PERSONAS daqui.
export { KNOWN_PERSONAS, PERSONA_LABELS };

export function usePersona() {
  const authStore = useAuthStore();
  // string normalizada do tipo de conta ('' quando não resolvido pelo backend)
  const accountType = computed(() => String(authStore.activeAccount.value?.accountType || '').toLowerCase());
  // 'generator' | 'carrier' | 'receiver' | 'unknown'
  const persona = computed(() => (PERSONA_LABELS[accountType.value] ? accountType.value : 'unknown'));
  const isGenerator = computed(() => persona.value === 'generator');
  const isCarrier = computed(() => persona.value === 'carrier');
  const isReceiver = computed(() => persona.value === 'receiver');
  // true quando o backend ainda não resolveu o tipo — nesse caso a UX não restringe nada
  const isUnknown = computed(() => persona.value === 'unknown');
  const personaLabel = computed(() => PERSONA_LABELS[accountType.value] || 'Conta operacional');
  return { accountType, persona, isGenerator, isCarrier, isReceiver, isUnknown, personaLabel };
}
