<script setup>
/**
 * WhatsApp do assistente — vinculação de número por código (OTP).
 * Cadeia whatsapp-channel-sicat, fase 02-identity-binding.
 *
 * Fluxo em duas etapas, SEMPRE iniciado aqui no app:
 *   1. o operador informa o número  → o backend manda um código de 6 dígitos pelo WhatsApp;
 *   2. o operador digita o código   → o backend confirma a posse e grava o vínculo.
 *
 * Toda decisão (validação, contagem regressiva, rótulos, tradução de erro) vem
 * dos módulos puros `features/channel-link/channelLinkState.js` (fase 02) e
 * `features/channel-link/actionWindowState.js` (fase 05 — janela de ação N2),
 * que é o que os testes cobrem — `.vue` não é importável em node:test.
 *
 * Feedback de ação SÓ por `useNotification`; o `SicatInlineAlert` daqui é estado
 * da tela (desafio pendente), não toast. Remoção e revogação passam por
 * `useConfirmDialog`.
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChannelLinkStore } from '../stores/channelLinkStore.js';
import { useAuthStore } from '../stores/auth.js';
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
import {
  ACTION_WINDOW_LIMITS,
  buildBudgetOptions,
  buildHoursOptions,
  buildWindowOpenedMessage,
  clampWindowBudgetInput,
  clampWindowHoursInput,
  describeWindowAccount,
  describeWindowBudget,
  hasVerifiedChannelLink,
  resolveActionWindowError,
  resolveWindowExpiry
} from '../features/channel-link/actionWindowState.js';
import { formatDateTimeBr } from '../utils/date-format.js';
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
  actionWindow,
  actionWindowLoading,
  actionWindowError,
  fetchList,
  startLink,
  resendCode,
  confirmCode,
  cancelChallenge,
  removeLink,
  fetchActionWindow,
  openActionWindow,
  revokeActionWindow
} = store;

const authStore = useAuthStore();

// Estado LOCAL do formulário (a regra pura vive no módulo de estado).
const phoneInput = ref('');
const phoneError = ref('');
const codeInput = ref('');
const codeError = ref('');

// Formulário da janela de ação. Os tetos reais são do servidor (clamp); estes
// valores só desenham os seletores.
const windowHours = ref(ACTION_WINDOW_LIMITS.defaultHours);
const windowBudget = ref(ACTION_WINDOW_LIMITS.defaultBudget);

// Trava anti-duplo-clique: 'start' | 'resend' | 'confirm' | 'cancel' |
// `remove:<id>` | 'window:open' | 'window:revoke'.
const actionKey = ref('');
const busy = computed(() => Boolean(actionKey.value));

const phoneFieldRef = ref(null);
const codeFieldRef = ref(null);

// Relógio da tela: alimenta "expira em", "reenviar em" e o contador da janela
// de ação. Só corre com desafio OU janela vivos.
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

// ── Janela de ação (fase 05) ─────────────────────────────────────────────────

const hasVerifiedNumber = computed(() => hasVerifiedChannelLink(links.value));
const hasLiveWindow = computed(() => Boolean(actionWindow.value?.id));

const windowHoursOptions = buildHoursOptions();
const windowBudgetOptions = buildBudgetOptions();

const windowExpiry = computed(() => resolveWindowExpiry(actionWindow.value?.expiresAt, now.value));
const windowBudgetInfo = computed(() => describeWindowBudget(actionWindow.value));
const windowOpenedAtLabel = computed(
  () => (actionWindow.value?.openedAt ? formatDateTimeBr(actionWindow.value.openedAt) : '—')
);
const windowAccountLabel = computed(() =>
  describeWindowAccount(actionWindow.value, {
    integrationAccountId: authStore.integrationAccountId.value,
    accountName: authStore.activeAccount.value?.partnerName || ''
  })
);
const activeAccountName = computed(
  () => authStore.activeAccount.value?.partnerName || 'a conta CETESB ativa'
);
const canOpenWindow = computed(() => authStore.hasActiveCetesbAccount.value);

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
    // O número acabou de virar `verified`: a janela de ação passa a existir
    // como recurso — consultar já mostra o card certo sem exigir F5.
    if (hasVerifiedNumber.value) await fetchActionWindow();
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

// ── Janela de ação (fase 05) ─────────────────────────────────────────────────

function reportWindowError(error, fallback) {
  const resolved = resolveActionWindowError(error, fallback);
  notify.error(resolved.message, { detail: resolved.detail, code: resolved.code });
  return resolved;
}

async function openWindow() {
  if (busy.value) return;

  actionKey.value = 'window:open';
  try {
    // Clamp ESPELHADO do backend antes do POST — os seletores já restringem,
    // mas o payload nunca sai da faixa nem se o estado local for corrompido.
    const response = await openActionWindow({
      hours: clampWindowHoursInput(windowHours.value),
      actionsBudget: clampWindowBudgetInput(windowBudget.value)
    });
    // A mensagem sai do DTO devolvido (validade e orçamento já CLAMPADOS pelo
    // servidor), não do que o formulário pediu.
    notify.success(buildWindowOpenedMessage(response), {
      detail: 'Para encerrar antes da hora, use "Revogar agora" — o corte é imediato.'
    });
  } catch (error) {
    reportWindowError(error, 'Falha ao liberar ações pelo WhatsApp.');
  } finally {
    actionKey.value = '';
  }
}

async function revokeWindow() {
  if (busy.value || !hasLiveWindow.value) return;

  const confirmed = await confirm({
    title: 'Revogar a liberação',
    message: 'Revogar agora? O WhatsApp deixa de executar ações na hora — inclusive as que já receberam código. Consultas continuam funcionando; para liberar de novo, abra outra liberação aqui.',
    confirmLabel: 'Revogar agora',
    danger: true
  });
  if (!confirmed) return;

  actionKey.value = 'window:revoke';
  try {
    await revokeActionWindow();
    notify.success('Liberação revogada. O WhatsApp voltou a só consultar.');
  } catch (error) {
    reportWindowError(error, 'Falha ao revogar a liberação.');
  } finally {
    actionKey.value = '';
  }
}

async function refreshWindow() {
  if (actionWindowLoading.value) return;
  await fetchActionWindow();
}

/** Atualiza lista e, havendo número verificado, a janela — o botão do header usa este. */
async function refreshAll() {
  await fetchList();
  if (hasVerifiedNumber.value) await fetchActionWindow();
}

watch(
  // O relógio serve ao desafio E à janela viva.
  () => hasPendingChallenge.value || hasLiveWindow.value,
  (active) => {
    if (active) {
      startTicker();
      return;
    }
    stopTicker();
  },
  { immediate: true }
);

// Quando o contador zera, a janela morreu no servidor (o GET só devolve janela
// viva): reconsultar troca o painel pelo formulário sem exigir F5. O guard por
// id impede loop caso o relógio local esteja adiantado em relação ao do banco.
let expiredRefetchedForId = '';
watch(
  () => (hasLiveWindow.value && windowExpiry.value.expired ? actionWindow.value.id : ''),
  async (expiredId) => {
    if (!expiredId || expiredId === expiredRefetchedForId) return;
    expiredRefetchedForId = expiredId;
    await fetchActionWindow();
  }
);

onMounted(async () => {
  await refreshAll();
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
            :loading="loadingList || actionWindowLoading"
            :disabled="busy"
            data-testid="wa-link-refresh"
            @click="refreshAll"
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

    <!-- Janela de ação (fase 05) — liberar emissões/baixas pelo WhatsApp. -->
    <SicatCard
      title="Liberar ações pelo WhatsApp"
      subtitle="Consultar é sempre permitido. Executar — emitir MTR, dar baixa — exige uma liberação aberta aqui, na sessão autenticada."
      icon="mdi-lock-open-variant-outline"
    >
      <!-- Pré-requisito: um número verificado. -->
      <SicatEmptyState
        v-if="!hasVerifiedNumber"
        title="Disponível após vincular um número"
        description="Vincule e confirme um número de WhatsApp acima. Depois, libere por tempo limitado a execução de ações pelo canal — no pátio, cada ação pedirá só um código de 6 dígitos."
        icon="mdi-lock-outline"
        data-testid="wa-window-locked"
      />

      <!-- Painel da janela VIVA: contadores de tempo e orçamento + revogação. -->
      <template v-else-if="hasLiveWindow">
        <div class="wa-window__status" data-testid="wa-window-live">
          <div class="wa-window__status-head">
            <SicatStatusBadge
              :label="windowBudgetInfo.exhausted ? 'Orçamento esgotado' : 'Liberação ativa'"
              :tone="windowBudgetInfo.exhausted ? 'warning' : 'success'"
              with-dot
            />
            <p
              v-if="windowExpiry.known"
              class="wa-window__timer"
              aria-live="polite"
              data-testid="wa-window-expiry"
            >
              {{ windowExpiry.label }}
            </p>
          </div>

          <dl class="wa-window__facts">
            <div class="wa-window__fact">
              <dt>Número</dt>
              <dd>{{ actionWindow.maskedUserKey || '—' }}</dd>
            </div>
            <div class="wa-window__fact">
              <dt>Conta CETESB</dt>
              <dd>{{ windowAccountLabel }}</dd>
            </div>
            <div class="wa-window__fact">
              <dt>Aberta em</dt>
              <dd>{{ windowOpenedAtLabel }}</dd>
            </div>
          </dl>

          <div class="wa-window__budget">
            <p class="wa-window__budget-label" data-testid="wa-window-budget">
              {{ windowBudgetInfo.label }}
            </p>
            <v-progress-linear
              :model-value="windowBudgetInfo.percentUsed"
              :color="windowBudgetInfo.exhausted ? 'warning' : 'primary'"
              height="8"
              rounded
              :aria-label="`Orçamento de ações: ${windowBudgetInfo.used} de ${windowBudgetInfo.budget} usadas`"
            />
            <p v-if="windowBudgetInfo.exhausted" class="wa-window__hint">
              As ações desta liberação acabaram. Revogue e abra outra se ainda precisar executar pelo WhatsApp.
            </p>
          </div>
        </div>
      </template>

      <!-- Sem janela viva: formulário de abertura. -->
      <template v-else>
        <SicatInlineAlert
          v-if="actionWindowError"
          tone="error"
          title="Não foi possível consultar a liberação"
          :message="actionWindowError"
          data-testid="wa-window-error"
        >
          <template #actions>
            <v-btn
              class="wa-link__action"
              variant="text"
              :loading="actionWindowLoading"
              @click="refreshWindow"
            >
              Tentar de novo
            </v-btn>
          </template>
        </SicatInlineAlert>

        <SicatFormSection
          title="Abra uma liberação antes de sair do escritório"
          description="Escolha por quanto tempo e quantas ações o WhatsApp pode executar. Ao expirar — ou ao revogar — o canal volta a só consultar."
        >
          <SicatFormField
            label="Duração"
            :hint="`Máximo de ${ACTION_WINDOW_LIMITS.maxHours} horas.`"
          >
            <template #default="{ id, describedBy }">
              <v-select
                :id="id"
                v-model="windowHours"
                :items="windowHoursOptions"
                item-title="label"
                item-value="value"
                density="comfortable"
                variant="outlined"
                hide-details="auto"
                :aria-describedby="describedBy"
                :disabled="actionKey === 'window:open'"
                data-testid="wa-window-hours"
              />
            </template>
          </SicatFormField>

          <SicatFormField
            label="Orçamento de ações"
            :hint="`Cada emissão ou baixa consome 1 ação. Máximo de ${ACTION_WINDOW_LIMITS.maxBudget}.`"
          >
            <template #default="{ id, describedBy }">
              <v-select
                :id="id"
                v-model="windowBudget"
                :items="windowBudgetOptions"
                item-title="label"
                item-value="value"
                density="comfortable"
                variant="outlined"
                hide-details="auto"
                :aria-describedby="describedBy"
                :disabled="actionKey === 'window:open'"
                data-testid="wa-window-budget-select"
              />
            </template>
          </SicatFormField>
        </SicatFormSection>

        <SicatInlineAlert
          v-if="!canOpenWindow"
          tone="warning"
          title="Selecione uma conta CETESB"
          message="A liberação fica presa a uma conta CETESB, escolhida agora. Ative uma conta em Minha sessão → Conta CETESB e volte aqui."
          data-testid="wa-window-account-required"
        />
        <p v-else class="wa-window__hint">
          A liberação vale somente para <strong>{{ activeAccountName }}</strong> — a conta é fixada agora e não muda durante a janela.
        </p>
      </template>

      <template v-if="hasVerifiedNumber" #actions>
        <template v-if="hasLiveWindow">
          <v-btn
            class="wa-link__action"
            color="error"
            variant="flat"
            size="large"
            prepend-icon="mdi-cancel"
            :loading="actionKey === 'window:revoke'"
            :disabled="busy && actionKey !== 'window:revoke'"
            data-testid="wa-window-revoke"
            @click="revokeWindow"
          >
            Revogar agora
          </v-btn>
          <v-btn
            class="wa-link__action"
            variant="tonal"
            prepend-icon="mdi-refresh"
            :loading="actionWindowLoading"
            :disabled="busy"
            data-testid="wa-window-refresh"
            @click="refreshWindow"
          >
            Atualizar contadores
          </v-btn>
        </template>
        <v-btn
          v-else
          class="wa-link__action"
          color="primary"
          variant="flat"
          size="large"
          prepend-icon="mdi-lock-open-outline"
          :loading="actionKey === 'window:open'"
          :disabled="busy || !canOpenWindow || actionWindowLoading"
          data-testid="wa-window-open"
          @click="openWindow"
        >
          Liberar ações
        </v-btn>
      </template>
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

/* ── Janela de ação (fase 05) ─────────────────────────────────────────────── */

.wa-window__status {
  display: grid;
  gap: var(--space-4);
}

.wa-window__status-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.wa-window__timer {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-variant-numeric: tabular-nums;
}

.wa-window__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3) var(--space-5);
  margin: 0;
}

.wa-window__fact dt {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.wa-window__fact dd {
  margin: 2px 0 0;
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.88);
  overflow-wrap: anywhere;
}

.wa-window__budget {
  display: grid;
  gap: var(--space-2);
}

.wa-window__budget-label {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-variant-numeric: tabular-nums;
}

.wa-window__hint {
  margin: var(--space-2) 0 0;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
  max-width: 72ch;
}
</style>
