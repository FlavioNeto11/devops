<script setup>
/**
 * WhatsApp do assistente — vinculação de número por código (OTP).
 * Cadeia whatsapp-channel-sicat, fase 02-identity-binding.
 *
 * Fluxo em duas etapas, SEMPRE iniciado aqui no app:
 *   1. o operador informa o número  → o backend manda um código de 6 dígitos pelo WhatsApp;
 *   2. o operador digita o código   → o backend confirma a posse e grava o vínculo.
 *
 * Toda decisão (validação, contagem regressiva, rótulos, tradução de erro) vem do
 * módulo puro `features/channel-link/channelLinkState.js`, que é o que os testes
 * cobrem — `.vue` não é importável em node:test.
 *
 * Feedback de ação SÓ por `useNotification`; o `SicatInlineAlert` daqui é estado
 * da tela (desafio pendente), não toast. Remoção passa por `useConfirmDialog`.
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChannelLinkStore } from '../stores/channelLinkStore.js';
import {
  CHANNEL_LINK_STAGE,
  OTP_CODE_LENGTH,
  buildChallengeBanner,
  canAddMoreLinks,
  describeAttempts,
  describeLinkRow,
  formatCountdown,
  maskPhone,
  normalizeLimits,
  resolveChannelLinkError,
  resolveExpiryState,
  resolveResendState,
  resolveStage,
  sanitizeOtpInput,
  validateOtpInput,
  validatePhoneInput
} from '../features/channel-link/channelLinkState.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirmDialog } from '../composables/useConfirmDialog.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatFormSection from '../components/sicat/SicatFormSection.vue';
import SicatFormField from '../components/sicat/SicatFormField.vue';
import SicatInlineAlert from '../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../components/sicat/SicatEmptyState.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import ConfirmDialog from '../components/sicat/SicatConfirmDialog.vue';

const notify = useNotification();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const store = useChannelLinkStore();
const {
  links,
  pendingChallenge,
  limits,
  loadingList,
  listError,
  hasPendingChallenge,
  fetchList,
  startLink,
  resendCode,
  confirmCode,
  cancelChallenge,
  removeLink
} = store;

// Estado LOCAL do formulário (a regra pura vive no módulo de estado).
const phoneInput = ref('');
const phoneError = ref('');
const codeInput = ref('');
const codeError = ref('');

// Trava anti-duplo-clique: 'start' | 'resend' | 'confirm' | 'cancel' | `remove:<id>`.
const actionKey = ref('');
const busy = computed(() => Boolean(actionKey.value));

const phoneFieldRef = ref(null);
const codeFieldRef = ref(null);

// Relógio da tela: alimenta "expira em" e "reenviar em". Só corre com desafio vivo.
const now = ref(Date.now());
let tickerId = null;

function startTicker() {
  if (tickerId) return;
  tickerId = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}

function stopTicker() {
  if (!tickerId) return;
  clearInterval(tickerId);
  tickerId = null;
}

const stage = computed(() => resolveStage(pendingChallenge.value));
const isCodeStage = computed(() => stage.value === CHANNEL_LINK_STAGE.CODE);
const resolvedLimits = computed(() => normalizeLimits(limits.value));
const canAddMore = computed(() => canAddMoreLinks(links.value, limits.value));

const challengeBanner = computed(() => buildChallengeBanner(pendingChallenge.value, now.value));
const expiryState = computed(() => resolveExpiryState(pendingChallenge.value?.expiresAt, now.value));
const resendState = computed(() => resolveResendState(pendingChallenge.value, now.value));
const attemptsLabel = computed(() => describeAttempts(pendingChallenge.value?.attemptsRemaining));
const challengePhoneMasked = computed(() => pendingChallenge.value?.phoneMasked || 'seu número');

const ttlLabel = computed(() => formatCountdown(resolvedLimits.value.otpTtlSeconds));
const phoneHint = computed(
  () => `Com DDD — por exemplo, (11) 91234-5678. O código chega no WhatsApp desse número e vale por ${ttlLabel.value}.`
);
const linkQuotaLabel = computed(
  () => `${links.value.length} de ${resolvedLimits.value.maxLinksPerUser} números vinculados.`
);

const headers = [
  { title: 'Número', key: 'phoneDisplay', sortable: false },
  { title: 'Situação', key: 'verificationStatus', sortable: false },
  { title: 'Vinculado em', key: 'verifiedAtLabel', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() => (links.value || []).map((link) => describeLinkRow(link)));
const showEmptyState = computed(
  () => !loadingList.value && !listError.value && rows.value.length === 0
);

function reportError(error, fallback) {
  const resolved = resolveChannelLinkError(error, fallback);
  notify.error(resolved.message, { detail: resolved.detail, code: resolved.code });
  return resolved;
}

async function focusField(fieldRef) {
  await nextTick();
  fieldRef.value?.focus?.();
}

function onPhoneInput(value) {
  phoneInput.value = value;
  if (phoneError.value) phoneError.value = '';
}

function onCodeInput(value) {
  // Colar "123 456" ou "1 2 3 4 5 6" precisa funcionar; letras nunca entram.
  codeInput.value = sanitizeOtpInput(value);
  if (codeError.value) codeError.value = '';
}

async function submitPhone() {
  if (busy.value) return;

  const validation = validatePhoneInput(phoneInput.value);
  phoneError.value = validation.message;
  if (!validation.valid) {
    await focusField(phoneFieldRef);
    return;
  }

  if (!canAddMore.value) {
    notify.warning(
      `Você já tem ${resolvedLimits.value.maxLinksPerUser} números vinculados. Remova um antes de adicionar outro.`
    );
    return;
  }

  actionKey.value = 'start';
  try {
    const response = await startLink(validation.digits);
    codeInput.value = '';
    codeError.value = '';
    notify.success(`Código enviado para ${response?.phoneMasked || maskPhone(validation.digits)}.`, {
      detail: 'A mensagem pode levar alguns segundos para chegar no WhatsApp.'
    });
    await focusField(codeFieldRef);
  } catch (error) {
    reportError(error, 'Falha ao enviar o código.');
  } finally {
    actionKey.value = '';
  }
}

async function submitCode() {
  if (busy.value) return;

  const validation = validateOtpInput(codeInput.value);
  codeError.value = validation.message;
  if (!validation.valid) {
    await focusField(codeFieldRef);
    return;
  }

  actionKey.value = 'confirm';
  try {
    const response = await confirmCode(validation.code);
    const masked = response?.link?.phoneMasked || challengePhoneMasked.value;
    codeInput.value = '';
    codeError.value = '';
    phoneInput.value = '';
    notify.success(
      response?.transferred
        ? `Número ${masked} vinculado à sua conta. Ele estava em outra conta e foi transferido para você.`
        : `Número ${masked} vinculado. Agora dá para falar com o assistente pelo WhatsApp.`
    );
  } catch (error) {
    const resolved = reportError(error, 'Falha ao confirmar o código.');
    codeError.value = resolved.message;
    // O limitador barra ANTES de o servidor olhar o código: apagar o que foi
    // digitado só obrigaria a redigitar os mesmos 6 dígitos.
    if (resolved.code !== 'CHANNEL_LINK_RATE_LIMITED') {
      codeInput.value = '';
    }
    // Código errado consome uma tentativa NO BANCO: só o servidor sabe quantas
    // sobraram. Recarregar mantém o contador da tela honesto.
    if (resolved.code === 'CHANNEL_LINK_CODE_INVALID') {
      await fetchList();
      await focusField(codeFieldRef);
    }
  } finally {
    actionKey.value = '';
  }
}

async function resend() {
  if (busy.value || !resendState.value.enabled) return;

  actionKey.value = 'resend';
  try {
    await resendCode();
    codeInput.value = '';
    codeError.value = '';
    notify.info('Enviamos um código novo. O código anterior deixou de valer.');
    await focusField(codeFieldRef);
  } catch (error) {
    reportError(error, 'Falha ao reenviar o código.');
  } finally {
    actionKey.value = '';
  }
}

async function changeNumber() {
  if (busy.value) return;

  actionKey.value = 'cancel';
  try {
    await cancelChallenge('typo');
    codeInput.value = '';
    codeError.value = '';
    notify.info('Pedido de código cancelado. Informe o número de novo.');
    await focusField(phoneFieldRef);
  } catch (error) {
    reportError(error, 'Falha ao cancelar o pedido de código.');
  } finally {
    actionKey.value = '';
  }
}

async function remove(row) {
  if (busy.value || !row?.id) return;

  const confirmed = await confirm({
    title: 'Desvincular número',
    message: `Desvincular ${row.phoneDisplay}? Esse número deixa de falar com o assistente do SICAT na hora. Para voltar, é preciso vincular de novo com um código.`,
    confirmLabel: 'Desvincular',
    danger: true
  });
  if (!confirmed) return;

  actionKey.value = `remove:${row.id}`;
  try {
    await removeLink(row.id);
    notify.success('Número desvinculado.');
  } catch (error) {
    reportError(error, 'Falha ao desvincular o número.');
  } finally {
    actionKey.value = '';
  }
}

watch(
  hasPendingChallenge,
  (active) => {
    if (active) {
      startTicker();
      return;
    }
    stopTicker();
  },
  { immediate: true }
);

onMounted(async () => {
  await fetchList();
});

onBeforeUnmount(stopTicker);
</script>

<template>
  <SicatPageLayout width="narrow">
    <template #header>
      <SicatPageHeader
        kicker="Minha conta"
        title="WhatsApp do assistente"
        description="Vincule o seu número para conversar com o assistente do SICAT pelo WhatsApp. Enviamos um código pelo próprio WhatsApp para confirmar que o aparelho é seu."
      >
        <template #actions>
          <v-btn
            class="wa-link__action"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-refresh"
            :loading="loadingList"
            :disabled="busy"
            data-testid="wa-link-refresh"
            @click="fetchList"
          >
            Atualizar
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="challengeBanner"
        :tone="challengeBanner.tone"
        :title="challengeBanner.title"
        :message="challengeBanner.message"
        data-testid="wa-link-challenge-banner"
      >
        <template #actions>
          <v-btn
            class="wa-link__action"
            variant="text"
            :loading="actionKey === 'cancel'"
            :disabled="busy && actionKey !== 'cancel'"
            data-testid="wa-link-change-number"
            @click="changeNumber"
          >
            Alterar número
          </v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <!-- Etapa 1 — informar o número. -->
    <SicatCard v-if="!isCodeStage" title="Adicionar um número" icon="mdi-whatsapp">
      <SicatFormSection
        :step="1"
        title="Informe o número"
        description="Enviaremos um código pelo WhatsApp para confirmar que o aparelho é seu."
      >
        <SicatFormField
          label="Número do WhatsApp"
          required
          full-width
          :error="phoneError"
          :hint="phoneHint"
        >
          <template #default="{ id, describedBy }">
            <v-text-field
              :id="id"
              ref="phoneFieldRef"
              :model-value="phoneInput"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="(11) 91234-5678"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              :aria-describedby="describedBy"
              :disabled="actionKey === 'start'"
              data-testid="wa-link-phone"
              @update:model-value="onPhoneInput"
              @keyup.enter="submitPhone"
            />
          </template>
        </SicatFormField>
      </SicatFormSection>

      <template #actions>
        <v-btn
          class="wa-link__action"
          color="primary"
          variant="flat"
          size="large"
          prepend-icon="mdi-send-outline"
          :loading="actionKey === 'start'"
          :disabled="busy || !canAddMore"
          data-testid="wa-link-send-code"
          @click="submitPhone"
        >
          Enviar código
        </v-btn>
        <span class="wa-link__quota">{{ linkQuotaLabel }}</span>
      </template>
    </SicatCard>

    <!-- Etapa 2 — confirmar o código. -->
    <SicatCard v-else title="Confirmar o código" icon="mdi-shield-check-outline">
      <SicatFormSection
        :step="2"
        title="Digite o código recebido"
        :description="`Enviamos um código para ${challengePhoneMasked}. Ele tem ${OTP_CODE_LENGTH} dígitos e é de uso único.`"
      >
        <SicatFormField
          label="Código recebido no WhatsApp"
          required
          full-width
          :error="codeError"
          :hint="attemptsLabel"
        >
          <template #default="{ id, describedBy }">
            <v-text-field
              :id="id"
              ref="codeFieldRef"
              :model-value="codeInput"
              inputmode="numeric"
              autocomplete="one-time-code"
              :maxlength="OTP_CODE_LENGTH"
              placeholder="000000"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              class="wa-link__code-field"
              :aria-describedby="describedBy"
              :disabled="actionKey === 'confirm'"
              data-testid="wa-link-code"
              @update:model-value="onCodeInput"
              @keyup.enter="submitCode"
            />
          </template>
        </SicatFormField>
      </SicatFormSection>

      <p v-if="expiryState.known" class="wa-link__timer" aria-live="polite" data-testid="wa-link-expiry">
        {{ expiryState.label }}
      </p>

      <template #actions>
        <v-btn
          class="wa-link__action"
          color="primary"
          variant="flat"
          size="large"
          prepend-icon="mdi-check"
          :loading="actionKey === 'confirm'"
          :disabled="busy"
          data-testid="wa-link-confirm"
          @click="submitCode"
        >
          Confirmar
        </v-btn>
        <v-btn
          class="wa-link__action"
          variant="tonal"
          size="large"
          prepend-icon="mdi-message-reprocessing-outline"
          :loading="actionKey === 'resend'"
          :disabled="busy || !resendState.enabled"
          data-testid="wa-link-resend"
          @click="resend"
        >
          {{ resendState.label }}
        </v-btn>
        <span class="wa-link__quota">{{ resendState.hint }}</span>
      </template>
    </SicatCard>

    <!-- Números já vinculados. -->
    <SicatCard title="Números vinculados" :subtitle="linkQuotaLabel" :flush-body="!showEmptyState">
      <SicatEmptyState
        v-if="showEmptyState"
        title="Nenhum número vinculado"
        description="Adicione um número acima para falar com o assistente do SICAT pelo WhatsApp."
        icon="mdi-whatsapp"
        data-testid="wa-link-empty"
      />
      <SicatDataTable
        v-else
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        density="compact"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhum número vinculado',
          description: 'Adicione um número acima para falar com o assistente pelo WhatsApp.',
          icon: 'mdi-whatsapp'
        }"
      >
        <template #[`item.verificationStatus`]="{ item }">
          <SicatStatusBadge :label="item.statusLabel" :tone="item.statusTone" with-dot />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            class="wa-link__action"
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-link-variant-off"
            :loading="actionKey === `remove:${item.id}`"
            :disabled="busy"
            :aria-label="`Desvincular ${item.phoneDisplay}`"
            :data-testid="`wa-link-remove-${item.id}`"
            @click.stop="remove(item)"
          >
            Desvincular
          </v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <template #footer>
      <p class="wa-link__help">
        Trocou de aparelho? O vínculo é do <strong>número</strong> — reinstalar o WhatsApp não afeta nada.
        Trocou de <strong>número</strong>? Vincule o novo e remova o antigo.
        Nunca compartilhe o código com ninguém: quem tem o código fala com o SICAT no seu lugar.
      </p>
    </template>

    <ConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :show-cancel="dialogShowCancel"
      :danger="dialogDanger"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </SicatPageLayout>
</template>

<style scoped>
/* Alvo de toque mínimo de 48px nas ações — a tela é usada no celular, e o
   `size` do Vuetify sozinho não garante a altura em todas as variantes. */
.wa-link__action {
  min-height: 48px;
}

.wa-link__quota {
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.wa-link__timer {
  margin: var(--space-3) 0 0;
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-variant-numeric: tabular-nums;
}

.wa-link__code-field :deep(input) {
  letter-spacing: 0.4em;
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.wa-link__help {
  margin: 0;
  max-width: 72ch;
}
</style>
