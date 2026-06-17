import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';

/**
 * Fonte ÚNICA do PERFIL operacional do usuário, derivado do tipo da conta CETESB
 * ativa: 'generator' (gerador — cria MTR), 'carrier' (transportador — só acompanha)
 * ou 'receiver' (destinador — dá baixa/recebe + gera CDF).
 *
 * Use isto em vez de reler `activeAccount.accountType` solto em cada tela, para a
 * UX por perfil ficar consistente (hub, navegação, onboarding).
 */
const PERSONA_LABELS = {
  generator: 'Gerador',
  carrier: 'Transportador',
  receiver: 'Destinador'
};

export const KNOWN_PERSONAS = Object.keys(PERSONA_LABELS);

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
