<!--
  SettingsView — Configurações da Clínica (REQ-NEUROEVOLUI-0001 / 0002 / 0007)
  Painel de configurações: informações do tenant, preferências de notificação
  pessoais (e-mail, push VAPID, WhatsApp) e alternância de tema claro/escuro.

  Endpoints REAIS:
    GET  /me                              → perfil + dados do tenant
    GET  /v1/notifications/preferences    → { data:[{channel,enabled,contact_value}] }
    PUT  /v1/notifications/preferences    { channel, enabled, contact_value }
    GET  /v1/notifications/vapid-public-key
    POST /v1/notifications/subscriptions  { endpoint, keys:{ p256dh, auth } }
    DELETE /v1/notifications/subscriptions { endpoint }

  Layout: sidebar de seções (Tenant, Notificações, Aparência) + painel principal.
  Todos os estados: loading (skeleton), error (retry), empty, normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui"
    title="Configurações"
    subtitle="Gerencie as informações da clínica, preferências de notificação e aparência."
    width="default"
    :loading="meLoading"
    loading-message="Carregando configurações…"
    :error="meError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="ghost" to="/">Voltar ao dashboard</UiButton>
    </template>

    <!-- Layout lateral: sidebar + conteúdo principal -->
    <div class="st-layout">
      <!-- ── Sidebar de navegação ─────────────────────────────────────────── -->
      <nav class="st-sidebar" aria-label="Seções de configuração">
        <button
          v-for="sec in sections"
          :key="sec.key"
          type="button"
          class="st-nav-item"
          :data-active="activeSection === sec.key ? 'true' : null"
          :aria-current="activeSection === sec.key ? 'page' : null"
          @click="activeSection = sec.key"
        >
          <span class="st-nav-icon" aria-hidden="true">{{ sec.icon }}</span>
          <span class="st-nav-label">{{ sec.label }}</span>
          <span
            v-if="sec.badge"
            class="st-nav-badge"
            :data-tone="sec.badgeTone"
            :aria-label="sec.badge"
          >{{ sec.badge }}</span>
        </button>
      </nav>

      <!-- ── Painel principal ────────────────────────────────────────────── -->
      <div class="st-panel">

        <!-- ═══════════════════════ SEÇÃO: Clínica ═════════════════════════ -->
        <section v-if="activeSection === 'tenant'" aria-labelledby="sec-tenant">
          <h2 id="sec-tenant" class="st-section-title">Clínica</h2>
          <UiCard title="Informações da Clínica" subtitle="Dados do tenant e perfil do usuário logado.">
            <template #actions>
              <UiStatusBadge
                :tone="meData ? 'success' : 'neutral'"
                :label="meData ? 'Sessão ativa' : 'Sem dados'"
                with-dot
              />
            </template>

            <!-- Loading do me (inline, já que o PageLayout loading cobre só o mount inicial) -->
            <div v-if="meLoading" class="st-sk-block" aria-label="Carregando dados da clínica" aria-busy="true">
              <div class="st-sk-line st-sk-w60" />
              <div class="st-sk-line st-sk-w40" />
              <div class="st-sk-line st-sk-w80" />
              <div class="st-sk-line st-sk-w50" />
            </div>

            <UiEmptyState
              v-else-if="!meLoading && !meError && !meData"
              icon="person"
              title="Perfil não disponível"
              description="Não foi possível recuperar o perfil do usuário. Verifique sua sessão."
            >
              <template #action>
                <UiButton variant="primary" @click="loadMe">Tentar novamente</UiButton>
              </template>
            </UiEmptyState>

            <dl v-else-if="meData" class="st-dl">
              <div class="st-dl-row">
                <dt class="st-dt">Usuário</dt>
                <dd class="st-dd">{{ meData.name || meData.username || meData.email || '—' }}</dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">E-mail</dt>
                <dd class="st-dd">{{ meData.email || '—' }}</dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">Perfil / Papel</dt>
                <dd class="st-dd">
                  <UiStatusBadge
                    :status="meData.role || meData.roles?.[0] || 'user'"
                    :label="roleLabel(meData.role || meData.roles?.[0])"
                  />
                </dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">Tenant</dt>
                <dd class="st-dd st-dd-code">{{ meData.tenant_id || meData.tenantId || '—' }}</dd>
              </div>
              <div v-if="meData.clinic_name || meData.clinicName" class="st-dl-row">
                <dt class="st-dt">Clínica</dt>
                <dd class="st-dd">{{ meData.clinic_name || meData.clinicName }}</dd>
              </div>
              <div v-if="meData.plan" class="st-dl-row">
                <dt class="st-dt">Plano</dt>
                <dd class="st-dd">
                  <UiStatusBadge :status="meData.plan" :label="planLabel(meData.plan)" />
                </dd>
              </div>
              <div v-if="meData.created_at || meData.createdAt" class="st-dl-row">
                <dt class="st-dt">Membro desde</dt>
                <dd class="st-dd">{{ format.formatDate(meData.created_at || meData.createdAt) }}</dd>
              </div>
            </dl>

            <template #footer>
              <div class="st-card-foot">
                <span class="st-foot-hint">
                  Dados gerenciados pelo Keycloak (SSO/OIDC). Alterações de perfil são feitas no painel de identidade.
                </span>
                <UiButton variant="ghost" size="sm" @click="loadMe" :loading="meLoading">
                  Atualizar
                </UiButton>
              </div>
            </template>
          </UiCard>

          <!-- Card de resumo de métricas do tenant -->
          <div class="st-tenant-metrics">
            <UiMetricCard
              label="Sessão"
              :value="meData ? 'Ativa' : 'Inativa'"
              :tone="meData ? 'success' : 'neutral'"
              hint="Status da sessão OIDC atual"
            />
            <UiMetricCard
              label="Canais de notif."
              :value="activeChannelsCount + ' de 3'"
              :tone="activeChannelsCount > 0 ? 'success' : 'neutral'"
              hint="Canais com notificação ativa"
            />
            <UiMetricCard
              label="Tema"
              :value="isDarkMode ? 'Escuro' : 'Claro'"
              tone="primary"
              hint="Alternância em Aparência"
              clickable
              @click="activeSection = 'appearance'"
            />
          </div>
        </section>

        <!-- ═══════════════════════ SEÇÃO: Notificações ════════════════════ -->
        <section v-if="activeSection === 'notifications'" aria-labelledby="sec-notifications">
          <h2 id="sec-notifications" class="st-section-title">Notificações</h2>

          <!-- Banner de degradação -->
          <div v-if="notifBanner" class="st-banner" :data-tone="notifBanner.tone" role="status">
            <span class="st-banner-icon" aria-hidden="true">{{ notifBanner.icon }}</span>
            <p class="st-banner-text">{{ notifBanner.text }}</p>
          </div>

          <!-- Métricas de canal -->
          <div class="st-notif-metrics">
            <UiMetricCard
              label="Canais ativos"
              :value="activeChannelsCount + ' de 3'"
              :tone="activeChannelsCount > 0 ? 'success' : 'neutral'"
              :hint="activeChannelsCount > 0 ? 'Você será notificado por estes canais' : 'Nenhum canal ativo'"
            />
            <UiMetricCard
              label="Push neste dispositivo"
              :value="pushStateLabel"
              :tone="pushTone"
              :hint="pushSupported ? 'Assinatura VAPID por dispositivo' : 'Não suportado neste navegador'"
            />
            <UiMetricCard
              label="Contatos preenchidos"
              :value="contactsFilled + ' de 2'"
              :tone="contactsFilled === 2 ? 'success' : contactsFilled === 0 ? 'warning' : 'neutral'"
              hint="E-mail e telefone WhatsApp"
            />
          </div>

          <!-- Estado de erro nas preferências -->
          <UiErrorState
            v-if="notifError && !notifLoading"
            :message="notifError"
            :retryable="true"
            @retry="loadNotifPrefs"
          />

          <!-- Cards de canais -->
          <div v-else class="st-channels">

            <!-- Estado vazio: primeiro acesso sem nenhuma preferência configurada -->
            <UiCard v-if="!notifLoading && !hasAnyPreference" title="Configure seus canais">
              <UiEmptyState
                icon="bell"
                title="Nenhum canal configurado ainda"
                description="Ative pelo menos um canal para receber lembretes de consultas, evoluções e cobranças."
              >
                <template #action>
                  <UiButton variant="primary" @click="quickEnableEmail">Começar pelo e-mail</UiButton>
                </template>
              </UiEmptyState>
            </UiCard>

            <!-- Canal: E-mail -->
            <UiCard
              title="E-mail"
              subtitle="Resumos e confirmações direto na sua caixa de entrada."
            >
              <template #actions>
                <UiStatusBadge
                  :tone="emailForm.values.enabled ? 'success' : 'neutral'"
                  :label="emailChannelLabel"
                />
              </template>

              <UiFormSection :columns="1">
                <!-- Skeleton de loading das preferências -->
                <div v-if="notifLoading" class="st-sk-block">
                  <div class="st-sk-line st-sk-w50" />
                  <div class="st-sk-line st-sk-w80" />
                </div>

                <template v-else>
                  <!-- Toggle ativar/desativar -->
                  <div class="st-toggle-row">
                    <div class="st-toggle-copy">
                      <p class="st-toggle-title">{{ emailForm.values.enabled ? 'Ativado' : 'Desativado' }}</p>
                      <p class="st-toggle-hint">Receber notificações por e-mail.</p>
                    </div>
                    <button
                      type="button"
                      class="st-switch"
                      role="switch"
                      :aria-checked="emailForm.values.enabled ? 'true' : 'false'"
                      aria-label="Ativar canal de e-mail"
                      :data-on="emailForm.values.enabled ? 'true' : null"
                      :data-busy="emailForm.submitting.value ? 'true' : null"
                      :disabled="emailForm.submitting.value"
                      @click="onToggleEmail"
                    >
                      <span class="st-switch-knob" aria-hidden="true" />
                    </button>
                  </div>

                  <!-- Campo de e-mail -->
                  <UiFormField
                    label="Endereço de e-mail"
                    hint="Para onde enviamos lembretes, confirmações e avisos de cobrança."
                    :error="emailForm.errors.contact_value"
                  >
                    <template #default="{ id, describedBy, hasError }">
                      <UiInput
                        :id="id"
                        type="email"
                        :model-value="emailForm.values.contact_value"
                        placeholder="voce@clinica.com.br"
                        :described-by="describedBy"
                        :error="hasError"
                        autocomplete="email"
                        @update:model-value="emailForm.setField('contact_value', $event)"
                        @blur="emailForm.validateField('contact_value')"
                      />
                    </template>
                  </UiFormField>
                </template>
              </UiFormSection>

              <template #footer>
                <div class="st-card-foot">
                  <span class="st-foot-hint">Sem servidor SMTP configurado, este canal é ignorado silenciosamente.</span>
                  <UiButton
                    variant="subtle"
                    size="sm"
                    :loading="emailForm.submitting.value"
                    :disabled="emailForm.submitting.value || notifLoading"
                    @click="saveEmailChannel"
                  >Salvar</UiButton>
                </div>
              </template>
            </UiCard>

            <!-- Canal: Push (VAPID) -->
            <UiCard
              title="Push (navegador)"
              subtitle="Avisos instantâneos mesmo com a aba fechada, via VAPID."
            >
              <template #actions>
                <UiStatusBadge
                  :tone="pushChannelTone"
                  :label="pushChannelLabel"
                />
              </template>

              <UiFormSection :columns="1">
                <div v-if="notifLoading" class="st-sk-block">
                  <div class="st-sk-line st-sk-w50" />
                  <div class="st-sk-line st-sk-w60" />
                </div>

                <template v-else>
                  <!-- Toggle push -->
                  <div class="st-toggle-row">
                    <div class="st-toggle-copy">
                      <p class="st-toggle-title">{{ pushEnabled ? 'Ativado' : 'Desativado' }}</p>
                      <p class="st-toggle-hint">Receber notificações push neste navegador.</p>
                    </div>
                    <button
                      type="button"
                      class="st-switch"
                      role="switch"
                      :aria-checked="pushEnabled ? 'true' : 'false'"
                      aria-label="Ativar canal push"
                      :data-on="pushEnabled ? 'true' : null"
                      :data-busy="pushBusy ? 'true' : null"
                      :disabled="pushBusy || !pushSupported"
                      @click="onTogglePush"
                    >
                      <span class="st-switch-knob" aria-hidden="true" />
                    </button>
                  </div>

                  <!-- Bloco de status do push -->
                  <div class="st-push-block">
                    <p v-if="!pushSupported" class="st-push-note" data-tone="warn">
                      Este navegador não suporta notificações push. Use e-mail ou WhatsApp.
                    </p>
                    <template v-else>
                      <p class="st-push-note" :data-tone="pushSubscribed ? 'ok' : 'muted'">
                        {{ pushSubscribed
                          ? 'Este dispositivo está inscrito para receber push.'
                          : 'Registre este dispositivo para receber push. A inscrição vale apenas neste navegador.' }}
                      </p>
                      <div class="st-push-actions">
                        <UiButton
                          v-if="!pushSubscribed"
                          variant="primary"
                          size="sm"
                          :loading="pushBusy"
                          :disabled="pushBusy"
                          @click="subscribePush()"
                        >Registrar este dispositivo</UiButton>
                        <UiButton
                          v-else
                          variant="danger"
                          size="sm"
                          :loading="pushBusy"
                          :disabled="pushBusy"
                          @click="unsubscribePush"
                        >Remover este dispositivo</UiButton>
                      </div>
                    </template>
                  </div>
                </template>
              </UiFormSection>

              <template #footer>
                <div class="st-card-foot">
                  <span class="st-foot-hint">A inscrição push é por dispositivo. Remova ao trocar de computador.</span>
                </div>
              </template>
            </UiCard>

            <!-- Canal: WhatsApp -->
            <UiCard
              title="WhatsApp"
              subtitle="Mensagens diretas no número do paciente ou responsável."
            >
              <template #actions>
                <UiStatusBadge
                  :tone="whatsappForm.values.enabled ? 'success' : 'neutral'"
                  :label="whatsappChannelLabel"
                />
              </template>

              <UiFormSection :columns="1">
                <div v-if="notifLoading" class="st-sk-block">
                  <div class="st-sk-line st-sk-w50" />
                  <div class="st-sk-line st-sk-w80" />
                </div>

                <template v-else>
                  <!-- Toggle WhatsApp -->
                  <div class="st-toggle-row">
                    <div class="st-toggle-copy">
                      <p class="st-toggle-title">{{ whatsappForm.values.enabled ? 'Ativado' : 'Desativado' }}</p>
                      <p class="st-toggle-hint">Receber notificações por WhatsApp.</p>
                    </div>
                    <button
                      type="button"
                      class="st-switch"
                      role="switch"
                      :aria-checked="whatsappForm.values.enabled ? 'true' : 'false'"
                      aria-label="Ativar canal WhatsApp"
                      :data-on="whatsappForm.values.enabled ? 'true' : null"
                      :data-busy="whatsappForm.submitting.value ? 'true' : null"
                      :disabled="whatsappForm.submitting.value"
                      @click="onToggleWhatsapp"
                    >
                      <span class="st-switch-knob" aria-hidden="true" />
                    </button>
                  </div>

                  <!-- Campo de telefone -->
                  <UiFormField
                    label="Telefone (com DDI e DDD)"
                    hint="Número no formato internacional, ex.: +55 11 99999-0000."
                    :error="whatsappForm.errors.contact_value"
                  >
                    <template #default="{ id, describedBy, hasError }">
                      <UiInput
                        :id="id"
                        type="tel"
                        :model-value="whatsappForm.values.contact_value"
                        placeholder="+55 11 99999-0000"
                        :described-by="describedBy"
                        :error="hasError"
                        autocomplete="tel"
                        @update:model-value="whatsappForm.setField('contact_value', $event)"
                        @blur="whatsappForm.validateField('contact_value')"
                      />
                    </template>
                  </UiFormField>
                </template>
              </UiFormSection>

              <template #footer>
                <div class="st-card-foot">
                  <span class="st-foot-hint">Sem provedor de WhatsApp configurado, este canal é ignorado silenciosamente.</span>
                  <UiButton
                    variant="subtle"
                    size="sm"
                    :loading="whatsappForm.submitting.value"
                    :disabled="whatsappForm.submitting.value || notifLoading"
                    @click="saveWhatsappChannel"
                  >Salvar</UiButton>
                </div>
              </template>
            </UiCard>
          </div>

          <!-- Ação global: salvar todos os canais -->
          <div class="st-save-all-row">
            <UiButton
              variant="primary"
              :loading="savingAll"
              :disabled="savingAll || notifLoading"
              @click="saveAll"
            >Salvar todas as preferências</UiButton>
          </div>
        </section>

        <!-- ═══════════════════════ SEÇÃO: Aparência ════════════════════════ -->
        <section v-if="activeSection === 'appearance'" aria-labelledby="sec-appearance">
          <h2 id="sec-appearance" class="st-section-title">Aparência</h2>
          <UiCard
            title="Tema da Interface"
            subtitle="Alterne entre o tema claro e escuro. A preferência é salva no navegador."
          >
            <UiFormSection :columns="1">
              <!-- Toggle de tema -->
              <div class="st-toggle-row st-theme-row">
                <div class="st-toggle-copy">
                  <p class="st-toggle-title">{{ isDarkMode ? 'Tema escuro' : 'Tema claro' }}</p>
                  <p class="st-toggle-hint">
                    {{ isDarkMode
                      ? 'Fundo escuro, ideal para ambientes com pouca luz.'
                      : 'Fundo claro, ideal para ambientes bem iluminados.' }}
                  </p>
                </div>
                <button
                  type="button"
                  class="st-switch st-theme-switch"
                  role="switch"
                  :aria-checked="isDarkMode ? 'true' : 'false'"
                  aria-label="Ativar tema escuro"
                  :data-on="isDarkMode ? 'true' : null"
                  @click="toggleTheme"
                >
                  <span class="st-switch-knob" aria-hidden="true" />
                </button>
              </div>

              <!-- Preview de tokens visuais -->
              <div class="st-theme-preview" role="img" aria-label="Previsualização do tema atual">
                <div class="st-preview-swatch" data-swatch="bg">
                  <span class="st-preview-label">Fundo</span>
                </div>
                <div class="st-preview-swatch" data-swatch="surface">
                  <span class="st-preview-label">Superfície</span>
                </div>
                <div class="st-preview-swatch" data-swatch="accent">
                  <span class="st-preview-label">Destaque</span>
                </div>
                <div class="st-preview-swatch" data-swatch="danger">
                  <span class="st-preview-label">Alerta</span>
                </div>
                <div class="st-preview-swatch" data-swatch="ok">
                  <span class="st-preview-label">Sucesso</span>
                </div>
                <div class="st-preview-swatch" data-swatch="warn">
                  <span class="st-preview-label">Atenção</span>
                </div>
              </div>
            </UiFormSection>

            <template #footer>
              <div class="st-card-foot">
                <span class="st-foot-hint">
                  A preferência de tema é armazenada localmente via localStorage e não sincronizada com a conta.
                </span>
              </div>
            </template>
          </UiCard>

          <!-- Informações da versão / build -->
          <UiCard title="Sobre o NeuroEvolui" subtitle="Informações de versão e ambiente.">
            <dl class="st-dl">
              <div class="st-dl-row">
                <dt class="st-dt">App</dt>
                <dd class="st-dd">NeuroEvolui</dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">Stack</dt>
                <dd class="st-dd">Vue 3 + Fastify + Postgres + Redis/BullMQ</dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">Funcionalidades</dt>
                <dd class="st-dd">Prontuário · Consultas · Evoluções · Relatórios · IA · Cobranças</dd>
              </div>
              <div class="st-dl-row">
                <dt class="st-dt">Autenticação</dt>
                <dd class="st-dd">Keycloak OIDC (SSO multi-tenant)</dd>
              </div>
            </dl>
          </UiCard>
        </section>

      </div><!-- /st-panel -->
    </div><!-- /st-layout -->
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiErrorState,
  UiInput,
  useToast,
  useConfirm,
  useForm,
  validators,
  format,
} from '../ui/index.js';
import { me as meApi, notificationPrefs } from '../api.js';

const toast = useToast();
const confirm = useConfirm();

// ── Estado do perfil (GET /me) ────────────────────────────────────────────────
const meLoading = ref(true);
const meError = ref(null);
const meData = ref(null);

// ── Estado das preferências de notificação ────────────────────────────────────
const notifLoading = ref(false);
const notifError = ref(null);
const savingAll = ref(false);

// ── Seção ativa da sidebar ────────────────────────────────────────────────────
const activeSection = ref('tenant');

// ── Tema ──────────────────────────────────────────────────────────────────────
const isDarkMode = ref(false);

// ── Push (VAPID) ──────────────────────────────────────────────────────────────
const pushSupported = ref(false);
const pushSubscribed = ref(false);
const pushEnabled = ref(false);
const pushBusy = ref(false);
const vapidKey = ref('');

// ── Formulários de canal de contato ───────────────────────────────────────────
const emailForm = useForm({
  initial: { contact_value: '', enabled: false },
  rules: {
    contact_value: [
      (v, all) => (all.enabled ? validators.required('Informe um e-mail para ativar este canal.')(v) : ''),
      validators.email('E-mail inválido. Verifique o endereço.'),
    ],
  },
});

const whatsappForm = useForm({
  initial: { contact_value: '', enabled: false },
  rules: {
    contact_value: [
      (v, all) => (all.enabled ? validators.required('Informe um telefone para ativar este canal.')(v) : ''),
      validators.pattern(/^\+?[0-9\s()\-]{8,20}$/, 'Telefone inválido. Use DDI/DDD, ex.: +55 11 99999-0000.'),
    ],
  },
});

// ── Seções da sidebar ─────────────────────────────────────────────────────────
const sections = computed(() => [
  {
    key: 'tenant',
    label: 'Clínica',
    icon: '◈',
    badge: meData.value ? null : '!',
    badgeTone: 'warning',
  },
  {
    key: 'notifications',
    label: 'Notificações',
    icon: '◉',
    badge: activeChannelsCount.value > 0 ? String(activeChannelsCount.value) : null,
    badgeTone: 'success',
  },
  {
    key: 'appearance',
    label: 'Aparência',
    icon: '◐',
    badge: null,
  },
]);

// ── Derivados ──────────────────────────────────────────────────────────────────
const activeChannelsCount = computed(
  () =>
    (emailForm.values.enabled ? 1 : 0) +
    (pushEnabled.value ? 1 : 0) +
    (whatsappForm.values.enabled ? 1 : 0),
);

const contactsFilled = computed(
  () =>
    ((emailForm.values.contact_value || '').trim() ? 1 : 0) +
    ((whatsappForm.values.contact_value || '').trim() ? 1 : 0),
);

const hasAnyPreference = computed(
  () =>
    emailForm.values.enabled ||
    pushEnabled.value ||
    whatsappForm.values.enabled ||
    (emailForm.values.contact_value || '').trim() ||
    (whatsappForm.values.contact_value || '').trim(),
);

const pushStateLabel = computed(() => {
  if (!pushSupported.value) return 'Indisponível';
  return pushSubscribed.value ? 'Inscrito' : 'Não inscrito';
});

const pushTone = computed(() => {
  if (!pushSupported.value) return 'neutral';
  return pushSubscribed.value ? 'success' : 'warning';
});

const pushChannelTone = computed(() => {
  if (!pushSupported.value) return 'neutral';
  if (pushEnabled.value && pushSubscribed.value) return 'success';
  if (pushEnabled.value) return 'warning';
  return 'neutral';
});

const pushChannelLabel = computed(() => {
  if (!pushSupported.value) return 'Indisponível';
  if (pushEnabled.value && pushSubscribed.value) return 'Ativo neste dispositivo';
  if (pushEnabled.value) return 'Ativo — registre o dispositivo';
  return 'Desativado';
});

const emailChannelLabel = computed(() => {
  if (emailForm.values.enabled && !(emailForm.values.contact_value || '').trim()) return 'Ativo — sem e-mail';
  return emailForm.values.enabled ? 'Ativo' : 'Desativado';
});

const whatsappChannelLabel = computed(() => {
  if (whatsappForm.values.enabled && !(whatsappForm.values.contact_value || '').trim()) return 'Ativo — sem contato';
  return whatsappForm.values.enabled ? 'Ativo' : 'Desativado';
});

const notifBanner = computed(() => {
  if (notifLoading.value || notifError.value) return null;
  if (!pushSupported.value) {
    return {
      tone: 'warn',
      icon: '◔',
      text: 'Push não é suportado neste navegador — e-mail e WhatsApp continuam funcionando.',
    };
  }
  if (activeChannelsCount.value === 0) {
    return {
      tone: 'info',
      icon: '◌',
      text: 'Nenhum canal ativo: você não receberá lembretes até ativar pelo menos um.',
    };
  }
  return null;
});

// ── Helpers de display ─────────────────────────────────────────────────────────
function roleLabel(role) {
  const map = {
    admin: 'Administrador',
    manager: 'Gestor',
    professional: 'Profissional',
    receptionist: 'Recepcionista',
    user: 'Usuário',
  };
  return map[role] || role || 'Usuário';
}

function planLabel(plan) {
  const map = {
    free: 'Gratuito',
    starter: 'Inicial',
    professional: 'Profissional',
    enterprise: 'Empresarial',
  };
  return map[plan] || plan || '—';
}

// ── Carregamento ──────────────────────────────────────────────────────────────
async function loadMe() {
  meLoading.value = true;
  meError.value = null;
  try {
    meData.value = await meApi();
  } catch (e) {
    meError.value = e.message || 'Não foi possível carregar o perfil do usuário.';
    meData.value = null;
  } finally {
    meLoading.value = false;
  }
}

async function loadNotifPrefs() {
  notifLoading.value = true;
  notifError.value = null;
  try {
    // VAPID (não derruba a tela em caso de falha)
    try {
      vapidKey.value = await notificationPrefs.vapidKey();
    } catch {
      vapidKey.value = '';
    }

    // Suporte e estado de assinatura do browser
    await detectPushState();

    // Preferências persistidas
    const res = await notificationPrefs.list();
    const prefs = (res && res.data) || [];
    const byKey = (k) => prefs.find((x) => x.channel === k);

    const e = byKey('email');
    emailForm.values.enabled = e ? e.enabled !== false : false;
    emailForm.values.contact_value = (e && e.contact_value) || '';

    const w = byKey('whatsapp');
    whatsappForm.values.enabled = w ? w.enabled !== false : false;
    whatsappForm.values.contact_value = (w && w.contact_value) || '';

    const p = byKey('push');
    pushEnabled.value = p ? p.enabled !== false : false;
  } catch (e) {
    notifError.value = e.message || 'Não foi possível carregar as preferências de notificação.';
  } finally {
    notifLoading.value = false;
  }
}

async function loadAll() {
  await Promise.allSettled([loadMe(), loadNotifPrefs()]);
}

async function detectPushState() {
  pushSupported.value =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  if (!pushSupported.value) {
    pushSubscribed.value = false;
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    pushSubscribed.value = !!sub;
  } catch {
    pushSubscribed.value = false;
  }
}

// ── Tema ──────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('neuroevolui-theme') : null;
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  isDarkMode.value = saved ? saved === 'dark' : prefersDark;
  applyTheme();
}

function applyTheme() {
  if (typeof document === 'undefined') return;
  if (isDarkMode.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  applyTheme();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('neuroevolui-theme', isDarkMode.value ? 'dark' : 'light');
  }
  toast.success('Tema ' + (isDarkMode.value ? 'escuro' : 'claro') + ' ativado.');
}

// ── Persistência de canal ─────────────────────────────────────────────────────
async function persistContact(channel, enabled, contactValue) {
  await notificationPrefs.put(channel, enabled, (contactValue || '').trim());
}

async function persistPush() {
  await notificationPrefs.put('push', pushEnabled.value, '');
}

// ── Salvar canal e-mail ───────────────────────────────────────────────────────
async function saveEmailChannel() {
  if (!emailForm.validate()) {
    toast.warning('Confira os dados do canal e-mail.');
    return;
  }
  await emailForm.handleSubmit(async (values) => {
    try {
      await persistContact('email', !!values.enabled, values.contact_value);
      toast.success('Canal e-mail salvo.');
    } catch (e) {
      toast.error('Falha ao salvar e-mail.', { detail: e.message, code: e.status });
    }
  });
}

// ── Salvar canal WhatsApp ─────────────────────────────────────────────────────
async function saveWhatsappChannel() {
  if (!whatsappForm.validate()) {
    toast.warning('Confira os dados do canal WhatsApp.');
    return;
  }
  await whatsappForm.handleSubmit(async (values) => {
    try {
      await persistContact('whatsapp', !!values.enabled, values.contact_value);
      toast.success('Canal WhatsApp salvo.');
    } catch (e) {
      toast.error('Falha ao salvar WhatsApp.', { detail: e.message, code: e.status });
    }
  });
}

// ── Salvar todos ──────────────────────────────────────────────────────────────
async function saveAll() {
  const okEmail = emailForm.validate();
  const okWhats = whatsappForm.validate();
  if (!okEmail || !okWhats) {
    toast.warning('Corrija os campos destacados antes de salvar.');
    return;
  }
  savingAll.value = true;
  try {
    await persistContact('email', !!emailForm.values.enabled, emailForm.values.contact_value);
    await persistContact('whatsapp', !!whatsappForm.values.enabled, whatsappForm.values.contact_value);
    await persistPush();
    toast.success('Todas as preferências de notificação foram salvas.');
  } catch (e) {
    toast.error('Não foi possível salvar todas as preferências.', { detail: e.message, code: e.status });
  } finally {
    savingAll.value = false;
  }
}

// ── Toggle e-mail ─────────────────────────────────────────────────────────────
async function onToggleEmail() {
  const turningOff = emailForm.values.enabled;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar e-mail?',
      message: 'Você deixará de receber notificações por e-mail. Pode reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }
  const next = !emailForm.values.enabled;
  emailForm.values.enabled = next;
  if (next && !emailForm.validateField('contact_value')) {
    emailForm.values.enabled = false;
    toast.warning('Informe um e-mail válido antes de ativar este canal.');
    return;
  }
  try {
    await persistContact('email', next, emailForm.values.contact_value);
    toast.success('E-mail ' + (next ? 'ativado' : 'desativado') + '.');
  } catch (e) {
    emailForm.values.enabled = !next;
    toast.error('Falha ao atualizar canal e-mail.', { detail: e.message, code: e.status });
  }
}

// ── Toggle WhatsApp ────────────────────────────────────────────────────────────
async function onToggleWhatsapp() {
  const turningOff = whatsappForm.values.enabled;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar WhatsApp?',
      message: 'Você deixará de receber notificações por WhatsApp. Pode reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }
  const next = !whatsappForm.values.enabled;
  whatsappForm.values.enabled = next;
  if (next && !whatsappForm.validateField('contact_value')) {
    whatsappForm.values.enabled = false;
    toast.warning('Informe um telefone válido antes de ativar este canal.');
    return;
  }
  try {
    await persistContact('whatsapp', next, whatsappForm.values.contact_value);
    toast.success('WhatsApp ' + (next ? 'ativado' : 'desativado') + '.');
  } catch (e) {
    whatsappForm.values.enabled = !next;
    toast.error('Falha ao atualizar canal WhatsApp.', { detail: e.message, code: e.status });
  }
}

// ── Toggle push ────────────────────────────────────────────────────────────────
async function onTogglePush() {
  if (!pushSupported.value) return;
  const turningOff = pushEnabled.value;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar push?',
      message: 'Você deixará de receber notificações push neste dispositivo. Pode reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }
  const next = !pushEnabled.value;
  pushBusy.value = true;
  try {
    pushEnabled.value = next;
    await persistPush();
    if (next && !pushSubscribed.value) {
      await subscribePush({ silent: true });
    } else if (!next && pushSubscribed.value) {
      await removeSubscription({ silent: true });
    }
    toast.success('Push ' + (next ? 'ativado' : 'desativado') + '.');
  } catch (e) {
    pushEnabled.value = !next;
    toast.error('Falha ao atualizar canal push.', { detail: e.message, code: e.status });
  } finally {
    pushBusy.value = false;
  }
}

// ── VAPID utils ────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureServiceWorker() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    const swSource =
      "self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{}}catch(_){}" +
      "var t=d.title||'NeuroEvolui';e.waitUntil(self.registration.showNotification(t,{body:d.body||'',data:{url:d.url||'/'}}))});" +
      "self.addEventListener('notificationclick',function(e){e.notification.close();" +
      "e.waitUntil(clients.openWindow((e.notification.data&&e.notification.data.url)||'/'))});";
    const url = URL.createObjectURL(new Blob([swSource], { type: 'text/javascript' }));
    reg = await navigator.serviceWorker.register(url);
    await navigator.serviceWorker.ready;
  }
  return reg;
}

async function subscribePush(opts = {}) {
  const silent = !!opts.silent;
  if (!pushSupported.value) {
    if (!silent) toast.warning('Push não é suportado neste navegador.');
    return;
  }
  if (!vapidKey.value) {
    if (!silent) toast.error('Chave VAPID indisponível. Configure o servidor antes de registrar.');
    throw new Error('VAPID indisponível');
  }
  if (!silent) pushBusy.value = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (!silent) toast.warning('Permissão de notificação negada pelo navegador.');
      pushEnabled.value = false;
      await persistPush().catch(() => {});
      return;
    }
    const reg = await ensureServiceWorker();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey.value),
    });
    const json = sub.toJSON();
    await notificationPrefs.subscribe(json.endpoint, json.keys.p256dh, json.keys.auth);
    pushSubscribed.value = true;
    if (!pushEnabled.value) {
      pushEnabled.value = true;
      await persistPush().catch(() => {});
    }
    if (!silent) toast.success('Dispositivo registrado para push.');
  } catch (e) {
    if (!silent) toast.error('Falha ao registrar push.', { detail: e.message, code: e.status });
    if (!silent) throw e;
  } finally {
    if (!silent) pushBusy.value = false;
  }
}

async function removeSubscription(opts = {}) {
  const silent = !!opts.silent;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await notificationPrefs.unsubscribe(endpoint).catch((e) => {
      if (!silent) throw e;
    });
  }
  pushSubscribed.value = false;
}

async function unsubscribePush() {
  const ok = await confirm({
    title: 'Remover este dispositivo?',
    message: 'Este navegador deixará de receber notificações push. Você pode registrar novamente depois.',
    confirmLabel: 'Remover',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  pushBusy.value = true;
  try {
    await removeSubscription();
    toast.success('Dispositivo removido do push.');
  } catch (e) {
    toast.error('Falha ao remover o dispositivo.', { detail: e.message, code: e.status });
  } finally {
    pushBusy.value = false;
  }
}

// ── Atalho: habilitar e-mail rapidamente ──────────────────────────────────────
function quickEnableEmail() {
  emailForm.values.enabled = true;
  activeSection.value = 'notifications';
  toast.info('Informe seu e-mail e salve o canal para ativá-lo.');
}

onMounted(async () => {
  initTheme();
  await loadAll();
});
</script>

<style scoped>
/* ── Layout lateral ──────────────────────────────────────────────────────────── */
.st-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--ui-space-5);
  align-items: start;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────────── */
.st-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  position: sticky;
  top: var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-2);
  box-shadow: var(--ui-shadow-sm);
}

.st-nav-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: none;
  background: transparent;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
  width: 100%;
}

.st-nav-item:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

.st-nav-item[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}

.st-nav-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}

.st-nav-icon {
  font-size: 1.1rem;
  width: 1.4rem;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
}

.st-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-nav-badge {
  flex-shrink: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.15);
  color: rgb(var(--ui-accent-strong));
  line-height: 1.6;
}

.st-nav-badge[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.15);
  color: rgb(var(--ui-warn));
}

/* ── Painel principal ────────────────────────────────────────────────────────── */
.st-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Título de seção (a11y: ancora o aria-labelledby; visualmente oculto pois o
      UiCard já exibe o título visual). ──────────────────────────────────────── */
.st-section-title {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Definition list ─────────────────────────────────────────────────────────── */
.st-dl {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.st-dl-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}

.st-dl-row:last-child {
  border-bottom: none;
}

.st-dt {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  padding-right: var(--ui-space-2);
  display: flex;
  align-items: center;
}

.st-dd {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.st-dd-code {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  border: 1px solid rgb(var(--ui-border));
}

/* ── Métricas do tenant ───────────────────────────────────────────────────────── */
.st-tenant-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

/* ── Métricas de notificação ─────────────────────────────────────────────────── */
.st-notif-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

/* ── Banner de degradação ────────────────────────────────────────────────────── */
.st-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}

.st-banner[data-tone="warn"] {
  border-color: rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.08);
}

.st-banner[data-tone="info"] {
  border-color: rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.07);
}

.st-banner-icon {
  font-size: 1.2rem;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}

.st-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── Canais de notificação ───────────────────────────────────────────────────── */
.st-channels {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Toggle (switch acessível) ──────────────────────────────────────────────── */
.st-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
}

.st-toggle-copy {
  min-width: 0;
  flex: 1;
}

.st-toggle-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.st-toggle-hint {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Switch visual */
.st-switch {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.st-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}

.st-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}

.st-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.st-switch[data-busy="true"] {
  cursor: progress;
}

.st-switch-knob {
  position: absolute;
  top: var(--ui-space-1);
  left: var(--ui-space-1);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}

.st-switch[data-on="true"] .st-switch-knob {
  transform: translateX(20px);
}

/* Tema switch (maior e mais visual) */
.st-theme-row {
  padding: var(--ui-space-3) 0;
}

.st-theme-switch {
  width: 56px;
  height: 30px;
}

.st-theme-switch .st-switch-knob {
  width: 22px;
  height: 22px;
}

.st-theme-switch[data-on="true"] .st-switch-knob {
  transform: translateX(26px);
}

@media (prefers-reduced-motion: reduce) {
  .st-switch,
  .st-switch-knob {
    transition: none;
  }
}

/* ── Bloco push ──────────────────────────────────────────────────────────────── */
.st-push-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
}

.st-push-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.st-push-note[data-tone="ok"] {
  color: rgb(var(--ui-ok));
}

.st-push-note[data-tone="warn"] {
  color: rgb(var(--ui-warn));
}

.st-push-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* ── Rodapé dos cards ────────────────────────────────────────────────────────── */
.st-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.st-foot-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Ação global "Salvar tudo" ───────────────────────────────────────────────── */
.st-save-all-row {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--ui-space-2);
}

/* ── Preview de tema ─────────────────────────────────────────────────────────── */
.st-theme-preview {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-2);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}

.st-preview-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2);
  border: 1px solid rgb(var(--ui-border));
}

.st-preview-swatch[data-swatch="bg"] {
  background: rgb(var(--ui-bg));
}

.st-preview-swatch[data-swatch="surface"] {
  background: rgb(var(--ui-surface));
}

.st-preview-swatch[data-swatch="accent"] {
  background: rgb(var(--ui-accent));
}

.st-preview-swatch[data-swatch="danger"] {
  background: rgb(var(--ui-danger));
}

.st-preview-swatch[data-swatch="ok"] {
  background: rgb(var(--ui-ok));
}

.st-preview-swatch[data-swatch="warn"] {
  background: rgb(var(--ui-warn));
}

.st-preview-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.st-preview-swatch[data-swatch="accent"] .st-preview-label,
.st-preview-swatch[data-swatch="danger"] .st-preview-label,
.st-preview-swatch[data-swatch="ok"] .st-preview-label,
.st-preview-swatch[data-swatch="warn"] .st-preview-label {
  color: rgb(var(--ui-bg));
  font-weight: 600;
}

/* ── Skeleton ────────────────────────────────────────────────────────────────── */
.st-sk-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}

.st-sk-line {
  height: 14px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  animation: st-pulse 1.4s ease-in-out infinite;
}

.st-sk-w40 { width: 40%; }
.st-sk-w50 { width: 50%; }
.st-sk-w60 { width: 60%; }
.st-sk-w80 { width: 80%; }

@keyframes st-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ── Responsivo ──────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .st-layout {
    grid-template-columns: 1fr;
  }

  .st-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: var(--ui-space-1);
  }

  .st-nav-item {
    flex-direction: column;
    gap: var(--ui-space-1);
    padding: var(--ui-space-2);
    min-width: 80px;
    text-align: center;
    align-items: center;
  }

  .st-nav-label {
    font-size: var(--ui-text-xs);
  }

  .st-tenant-metrics,
  .st-notif-metrics {
    grid-template-columns: 1fr;
  }

  .st-dl-row {
    grid-template-columns: 120px 1fr;
  }

  .st-theme-preview {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 480px) {
  .st-dl-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }

  .st-dt {
    color: rgb(var(--ui-accent-strong));
    font-size: var(--ui-text-xs);
  }

  .st-theme-preview {
    grid-template-columns: repeat(2, 1fr);
  }

  .st-save-all-row {
    justify-content: stretch;
  }
}
</style>
