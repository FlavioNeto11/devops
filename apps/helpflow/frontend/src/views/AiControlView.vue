<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Assistente"
    title="Controle da IA"
    subtitle="Painel próprio do assistente do service desk — modos, limites, telemetria, grounding e feedback. Fail-closed por padrão."
    :loading="firstLoad && loading"
    :error="fatalError"
    @retry="reload"
  >
    <template #actions>
      <span class="ai-stamp" aria-live="polite">{{ stampLabel }}</span>
      <UiButton variant="ghost" :loading="loading && !firstLoad" @click="reload">
        <template #icon-left><span class="ai-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        :variant="control.enabled ? 'danger' : 'primary'"
        :loading="togglingMaster"
        @click="toggleMaster"
      >
        <template #icon-left><span class="ai-ico" aria-hidden="true">{{ control.enabled ? '⏻' : '▶' }}</span></template>
        {{ control.enabled ? 'Desligar assistente' : 'Ligar assistente' }}
      </UiButton>
    </template>

    <!-- Banner de modo seguro: visível sempre que a IA está desligada ou degradada (fail-closed). -->
    <template v-if="showSafeBanner" #banner>
      <div class="ai-banner" :data-tone="safeBannerTone" role="status">
        <span class="ai-banner-icon" aria-hidden="true">{{ safeBannerIcon }}</span>
        <div class="ai-banner-body">
          <p class="ai-banner-title">{{ safeBannerTitle }}</p>
          <p class="ai-banner-text">{{ safeBannerText }}</p>
        </div>
        <UiStatusBadge :status="planeStatus" :label="planeStatusLabel" size="lg" />
      </div>
    </template>

    <!-- ESTADO: erro parcial ao ler config (a telemetria pode seguir utilizável) -->
    <UiCard v-if="configError" class="ai-inline-error" title="Configuração indisponível">
      <UiErrorState
        icon="lock"
        :message="configError"
        @retry="loadControl"
      >
        <template #action>
          <UiButton size="sm" variant="ghost" to="/tickets">Voltar aos chamados</UiButton>
        </template>
      </UiErrorState>
    </UiCard>

    <template v-else>
      <!-- ============ 1. DECK DE CONTROLE: mestre + modos (FeatureToggle) ============ -->
      <UiCard
        title="Modos do assistente"
        subtitle="A chave-mestra governa tudo. Cada modo é independente e só opera com o mestre ligado."
      >
        <template #actions>
          <UiStatusBadge :status="control.enabled ? 'active' : 'inactive'" :label="control.enabled ? 'Mestre ligado' : 'Mestre desligado'" />
        </template>

        <!-- chave-mestra em destaque -->
        <div class="ai-master" :data-on="control.enabled ? 'true' : 'false'">
          <span class="ai-master-glyph" aria-hidden="true">{{ control.enabled ? '🧠' : '💤' }}</span>
          <div class="ai-master-body">
            <p class="ai-master-name">Assistente {{ control.enabled ? 'em operação' : 'em modo seguro' }}</p>
            <p class="ai-master-desc">{{ masterDesc }}</p>
          </div>
          <label class="ai-switch ai-switch--lg" :data-disabled="togglingMaster ? 'true' : null">
            <input
              class="ai-switch-input"
              type="checkbox"
              :checked="control.enabled"
              :disabled="togglingMaster"
              aria-label="Chave-mestra do assistente"
              @change="toggleMaster"
            />
            <span class="ai-switch-track" aria-hidden="true"><span class="ai-switch-thumb" /></span>
            <span class="ai-switch-state">{{ control.enabled ? 'Ligado' : 'Desligado' }}</span>
          </label>
        </div>

        <div class="ai-toggles" role="group" aria-label="Modos do assistente de IA">
          <div
            v-for="m in modeList"
            :key="m.key"
            class="ai-toggle"
            :data-on="control.modes[m.key] && control.enabled ? 'true' : 'false'"
            :data-locked="!control.enabled ? 'true' : null"
          >
            <div class="ai-toggle-head">
              <span class="ai-toggle-glyph" aria-hidden="true">{{ m.glyph }}</span>
              <div class="ai-toggle-titles">
                <p class="ai-toggle-name">{{ m.label }}</p>
                <p class="ai-toggle-desc">{{ m.desc }}</p>
              </div>
            </div>
            <label class="ai-switch" :data-disabled="!control.enabled || savingModes ? 'true' : null">
              <input
                class="ai-switch-input"
                type="checkbox"
                :checked="control.modes[m.key]"
                :disabled="!control.enabled || savingModes"
                :aria-label="'Modo ' + m.label"
                @change="onModeToggle(m.key, $event.target.checked)"
              />
              <span class="ai-switch-track" aria-hidden="true"><span class="ai-switch-thumb" /></span>
              <span class="ai-switch-state">{{ control.modes[m.key] ? 'Ligado' : 'Desligado' }}</span>
            </label>
          </div>
        </div>
      </UiCard>

      <!-- ============ 2. TELEMETRIA (UsageMetrics) ============ -->
      <section class="ai-metrics" aria-label="Telemetria do assistente">
        <UiMetricCard
          label="Tokens (período)"
          :value="usageError ? '—' : format.formatNumber(usage.tokens)"
          :loading="usageLoading"
          tone="primary"
          :hint="usagePeriodLabel"
        />
        <UiMetricCard
          label="Custo estimado"
          :value="usageError ? '—' : format.formatCurrency(usage.costUsd, 'USD')"
          :loading="usageLoading"
          tone="neutral"
          hint="acumulado no período"
        />
        <UiMetricCard
          label="Latência p95"
          :value="usageError ? '—' : latencyLabel"
          :loading="usageLoading"
          :tone="latencyTone"
          hint="tempo de resposta do grafo"
        />
        <UiMetricCard
          label="Requisições"
          :value="usageError ? '—' : format.formatNumber(usage.requests)"
          :loading="usageLoading"
          tone="neutral"
          hint="chamadas ao assistente"
        />
        <UiMetricCard
          label="Aprovação"
          :value="usageError ? '—' : approvalLabel"
          :loading="usageLoading"
          :tone="approvalTone"
          :hint="approvalHint"
        />
      </section>

      <!-- ESTADO: telemetria indisponível (a config segue editável acima/abaixo) -->
      <div v-if="usageError" class="ai-soft-error" role="alert">
        <span class="ai-soft-error-icon" aria-hidden="true">📉</span>
        <div class="ai-soft-error-body">
          <p class="ai-soft-error-title">Telemetria indisponível</p>
          <p class="ai-soft-error-text">
            Não foi possível ler <code class="ai-code">GET /v1/ai/usage</code>. Os controles acima continuam funcionando.
          </p>
        </div>
        <UiButton size="sm" variant="ghost" :loading="usageLoading" @click="loadUsage">Tentar de novo</UiButton>
      </div>

      <!-- composição de tokens (entrada vs. saída) — mini-viz CSP-safe -->
      <UiCard
        v-else
        title="Composição do consumo"
        subtitle="Como os tokens do período se dividem entre entrada (prompt + grounding) e saída (geração)."
      >
        <div v-if="usageLoading" class="ai-mix-loading">
          <UiLoadingState variant="skeleton" :skeleton-lines="2" />
        </div>
        <template v-else-if="usage.tokens > 0">
          <div class="ai-mix" role="img" :aria-label="mixAria">
            <div class="ai-mix-bar">
              <span class="ai-mix-seg" data-kind="in" :data-pct="mixInBucket" />
              <span class="ai-mix-seg" data-kind="out" :data-pct="mixOutBucket" />
            </div>
          </div>
          <ul class="ai-mix-legend">
            <li class="ai-mix-item">
              <span class="ai-mix-dot" data-kind="in" aria-hidden="true" />
              <span class="ai-mix-label">Entrada</span>
              <span class="ai-mix-value">{{ format.formatNumber(usage.tokensIn) }} · {{ mixInPct }}%</span>
            </li>
            <li class="ai-mix-item">
              <span class="ai-mix-dot" data-kind="out" aria-hidden="true" />
              <span class="ai-mix-label">Saída</span>
              <span class="ai-mix-value">{{ format.formatNumber(usage.tokensOut) }} · {{ mixOutPct }}%</span>
            </li>
            <li class="ai-mix-item">
              <span class="ai-mix-dot" data-kind="cpr" aria-hidden="true" />
              <span class="ai-mix-label">Custo por requisição</span>
              <span class="ai-mix-value">{{ costPerRequestLabel }}</span>
            </li>
          </ul>
        </template>
        <div v-else class="ai-soft-empty">
          <span class="ai-soft-empty-icon" aria-hidden="true">∅</span>
          <p class="ai-soft-empty-text">Nenhum consumo registrado no período. Ligue um modo para começar a coletar telemetria.</p>
        </div>
      </UiCard>

      <div class="ai-grid-2">
        <!-- ============ 3. ORÇAMENTO (BudgetControl) ============ -->
        <UiCard title="Limites e orçamento" subtitle="Teto de gasto e de tokens. Ao estourar, o assistente entra em modo seguro (fail-closed).">
          <template #actions>
            <UiStatusBadge :status="budgetStatus" :label="budgetStatusLabel" />
          </template>

          <div v-if="usageLoading" class="ai-budget-loading">
            <UiLoadingState variant="skeleton" :skeleton-lines="3" />
          </div>

          <div v-else-if="usageError" class="ai-soft-empty">
            <span class="ai-soft-empty-icon" aria-hidden="true">🔌</span>
            <p class="ai-soft-empty-text">Sem telemetria para medir o consumo. Os limites configurados seguem abaixo.</p>
            <UiButton size="sm" variant="subtle" @click="openBudget">Ajustar limites</UiButton>
          </div>

          <template v-else>
            <!-- Barra de consumo do orçamento de custo -->
            <div class="ai-meter" role="img" :aria-label="budgetAria">
              <div class="ai-meter-head">
                <span class="ai-meter-label">Gasto no período</span>
                <span class="ai-meter-value">
                  {{ format.formatCurrency(usage.costUsd, 'USD') }} / {{ control.budgetUsd ? format.formatCurrency(control.budgetUsd, 'USD') : 'sem teto' }}
                </span>
              </div>
              <div class="ai-meter-track">
                <div class="ai-meter-fill" :data-tone="budgetTone" :data-pct="budgetPctBucket" />
              </div>
              <p class="ai-meter-foot">{{ control.budgetUsd ? budgetPct + '% do orçamento de custo utilizado' : 'Defina um teto de custo para ativar a proteção fail-closed.' }}</p>
            </div>

            <!-- Barra de consumo do orçamento de tokens -->
            <div class="ai-meter" role="img" :aria-label="tokenAria">
              <div class="ai-meter-head">
                <span class="ai-meter-label">Tokens no período</span>
                <span class="ai-meter-value">
                  {{ format.formatNumber(usage.tokens) }} / {{ control.tokenBudget ? format.formatNumber(control.tokenBudget) : 'sem teto' }}
                </span>
              </div>
              <div class="ai-meter-track">
                <div class="ai-meter-fill" :data-tone="tokenTone" :data-pct="tokenPctBucket" />
              </div>
              <p class="ai-meter-foot">{{ control.tokenBudget ? tokenPct + '% do orçamento de tokens utilizado' : 'Defina um teto de tokens para ativar a proteção fail-closed.' }}</p>
            </div>

            <UiButton variant="subtle" block @click="openBudget">
              <template #icon-left><span class="ai-ico" aria-hidden="true">⚙</span></template>
              Ajustar limites
            </UiButton>
          </template>
        </UiCard>

        <!-- ============ 4. GROUNDING (ConfigForm) ============ -->
        <UiCard title="Grounding & geração" subtitle="De onde o assistente tira contexto e como ele responde.">
          <template #actions>
            <UiButton size="sm" variant="ghost" @click="openConfig">Editar</UiButton>
          </template>

          <!-- fontes de contexto como chips -->
          <div class="ai-sources" role="group" aria-label="Fontes de contexto do assistente">
            <span class="ai-source" :data-on="control.grounding.useKb ? 'true' : 'false'">
              <span class="ai-source-glyph" aria-hidden="true">📚</span>
              <span class="ai-source-text">
                <span class="ai-source-name">Base de conhecimento</span>
                <span class="ai-source-state">{{ control.grounding.useKb ? 'Citando artigos da KB' : 'Sem citações' }}</span>
              </span>
            </span>
            <span class="ai-source" :data-on="control.grounding.useSimilarTickets ? 'true' : 'false'">
              <span class="ai-source-glyph" aria-hidden="true">🧩</span>
              <span class="ai-source-text">
                <span class="ai-source-name">Tickets similares (ReAct)</span>
                <span class="ai-source-state">{{ control.grounding.useSimilarTickets ? 'Tool habilitada' : 'Desabilitada' }}</span>
              </span>
            </span>
          </div>

          <dl class="ai-defs">
            <div class="ai-def">
              <dt>Modelo</dt>
              <dd class="ai-mono">{{ control.model || '—' }}</dd>
            </div>
            <div class="ai-def">
              <dt>Versão do prompt</dt>
              <dd class="ai-mono">{{ control.promptVersion || 'v1 (fallback)' }}</dd>
            </div>
            <div class="ai-def">
              <dt>Temperatura</dt>
              <dd>
                <span class="ai-temp">
                  <span class="ai-temp-bar"><span class="ai-temp-fill" :data-pct="tempBucket" /></span>
                  <span class="ai-mono">{{ tempLabel }}</span>
                </span>
              </dd>
            </div>
            <div class="ai-def">
              <dt>Confirmar mutações</dt>
              <dd>
                <UiStatusBadge
                  :status="control.dryRun ? 'pending' : 'inactive'"
                  :tone="control.dryRun ? 'warning' : 'error'"
                  :label="control.dryRun ? 'Dry-run (usuário confirma)' : 'Direto (sem confirmação)'"
                />
              </dd>
            </div>
          </dl>

          <p class="ai-hint">
            Com dry-run ligado, o assistente nunca publica respostas sozinho. As respostas citam a
            <RouterLink to="/kb-articles" class="ai-link">base de conhecimento</RouterLink>.
          </p>
        </UiCard>
      </div>

      <!-- ============ 5. FEEDBACK (FeedbackList) ============ -->
      <UiCard title="Feedback recente (thumbs)" subtitle="O que os agentes acharam das sugestões da IA. Use para calibrar prompts e modos.">
        <template #actions>
          <span v-if="!feedbackError && feedbackRows.length" class="ai-fb-summary">
            <span class="ai-vote" data-vote="up" aria-hidden="true">👍</span> {{ usage.thumbsUp }}
            <span class="ai-fb-sep" aria-hidden="true">·</span>
            <span class="ai-vote" data-vote="down" aria-hidden="true">👎</span> {{ usage.thumbsDown }}
          </span>
          <UiButton size="sm" variant="ghost" :loading="feedbackLoading" @click="loadFeedback">Recarregar</UiButton>
        </template>

        <UiDataTable
          :columns="feedbackColumns"
          :rows="feedbackRows"
          row-key="id"
          :loading="feedbackLoading"
          :error="feedbackError"
          density="compact"
          :empty="{
            title: 'Sem feedback ainda',
            description: 'Quando os agentes avaliarem as sugestões do assistente, os votos aparecem aqui.',
            icon: 'inbox',
          }"
          @retry="loadFeedback"
        >
          <template #cell-vote="{ value }">
            <span class="ai-vote" :data-vote="value" :aria-label="value === 'up' ? 'Positivo' : 'Negativo'">
              {{ value === 'up' ? '👍' : '👎' }}
            </span>
          </template>
          <template #cell-kind="{ value }">
            <UiStatusBadge :status="value" tone="neutral" :label="kindLabel(value)" :with-dot="false" />
          </template>
          <template #cell-summary="{ value }">
            <span class="ai-fb-text">{{ value }}</span>
          </template>
          <template #cell-created_at="{ value }">{{ format.formatDateTime(value) }}</template>
          <template #empty-action>
            <UiButton size="sm" to="/tickets">Ver chamados</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <template #footer>
      <span>
        {{ updatedAt ? 'Atualizado ' + format.formatDateTime(updatedAt) : 'Carregando estado do assistente…' }}
        · estado lido do control plane do app.
      </span>
    </template>
  </UiPageLayout>

  <!-- ====== MODAL: ajustar limites/orçamento (BudgetControl) ====== -->
  <UiModal v-model:open="budgetModal" title="Ajustar limites do assistente" width="sm">
    <form class="ai-form" @submit.prevent="saveBudget">
      <p class="ai-form-lead">
        Ao atingir qualquer teto no período, o assistente entra em <strong>modo seguro</strong> e para de
        sugerir até a virada do período ou o aumento do limite. Use <code class="ai-code">0</code> para não limitar.
      </p>
      <UiFormField
        label="Orçamento de custo (USD) no período"
        required
        :error="budgetForm.errors.budgetUsd"
        hint="0 = sem teto de custo."
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            class="ai-input"
            type="number"
            min="0"
            step="0.5"
            inputmode="decimal"
            :value="budgetForm.values.budgetUsd"
            @input="budgetForm.setField('budgetUsd', $event.target.value)"
          />
        </template>
      </UiFormField>

      <UiFormField
        label="Orçamento de tokens no período"
        required
        :error="budgetForm.errors.tokenBudget"
        hint="0 = sem teto de tokens."
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            class="ai-input"
            type="number"
            min="0"
            step="1000"
            inputmode="numeric"
            :value="budgetForm.values.tokenBudget"
            @input="budgetForm.setField('tokenBudget', $event.target.value)"
          />
        </template>
      </UiFormField>
    </form>

    <template #footer>
      <UiButton variant="ghost" @click="budgetModal = false">Cancelar</UiButton>
      <UiButton :loading="budgetForm.submitting.value" @click="saveBudget">Salvar limites</UiButton>
    </template>
  </UiModal>

  <!-- ====== MODAL: grounding & geração (ConfigForm) ====== -->
  <UiModal v-model:open="configModal" title="Grounding & geração" width="md">
    <form class="ai-form" @submit.prevent="saveConfig">
      <UiFormSection title="Contexto (grounding)" description="De onde o assistente recupera contexto antes de responder." :columns="1">
        <label class="ai-check">
          <input
            class="ai-check-input"
            type="checkbox"
            :checked="configForm.values.useKb"
            @change="configForm.setField('useKb', $event.target.checked)"
          />
          <span class="ai-check-body">
            <span class="ai-check-title">Citar a base de conhecimento</span>
            <span class="ai-check-desc">Recupera e cita artigos publicados ao rascunhar respostas.</span>
          </span>
        </label>
        <label class="ai-check">
          <input
            class="ai-check-input"
            type="checkbox"
            :checked="configForm.values.useSimilarTickets"
            @change="configForm.setField('useSimilarTickets', $event.target.checked)"
          />
          <span class="ai-check-body">
            <span class="ai-check-title">Buscar tickets similares (ReAct)</span>
            <span class="ai-check-desc">Permite a tool de busca por histórico durante o reasoning.</span>
          </span>
        </label>
      </UiFormSection>

      <UiFormSection title="Geração" description="Como o assistente gera as saídas." :columns="2">
        <UiFormField label="Modelo" :error="configForm.errors.model" required>
          <template #default="{ id, describedBy }">
            <select
              :id="id"
              :aria-describedby="describedBy"
              class="ai-input"
              :value="configForm.values.model"
              @change="configForm.setField('model', $event.target.value)"
            >
              <option v-for="opt in modelOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </template>
        </UiFormField>

        <UiFormField label="Versão do prompt" :error="configForm.errors.promptVersion" hint="Vazio = fallback v1 (fail-closed).">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              class="ai-input"
              type="text"
              placeholder="v1"
              :value="configForm.values.promptVersion"
              @input="configForm.setField('promptVersion', $event.target.value)"
            />
          </template>
        </UiFormField>

        <UiFormField
          label="Temperatura"
          :error="configForm.errors.temperature"
          hint="0 = determinístico · 1 = criativo."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              class="ai-input"
              type="number"
              min="0"
              max="1"
              step="0.1"
              inputmode="decimal"
              :value="configForm.values.temperature"
              @input="configForm.setField('temperature', $event.target.value)"
            />
          </template>
        </UiFormField>
      </UiFormSection>

      <UiFormSection title="Segurança" description="Comportamento em ações que mudam dados." :columns="1">
        <label class="ai-check" :data-warn="!configForm.values.dryRun ? 'true' : null">
          <input
            class="ai-check-input"
            type="checkbox"
            :checked="configForm.values.dryRun"
            @change="configForm.setField('dryRun', $event.target.checked)"
          />
          <span class="ai-check-body">
            <span class="ai-check-title">Dry-run em mutações (recomendado)</span>
            <span class="ai-check-desc">As respostas ficam como rascunho até o agente confirmar.</span>
          </span>
        </label>
        <p v-if="!configForm.values.dryRun" class="ai-warn-line" role="alert">
          <span aria-hidden="true">⚠</span> Sem dry-run, o assistente pode aplicar respostas sem confirmação do agente.
        </p>
      </UiFormSection>
    </form>

    <template #footer>
      <UiButton variant="ghost" @click="configModal = false">Cancelar</UiButton>
      <UiButton :loading="configForm.submitting.value" @click="saveConfig">Salvar configuração</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiFormField,
  UiFormSection,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  useForm,
  validators,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();
const ask = useConfirm();

// Endpoints REAIS do control-plane da IA do app (mesmo padrão do DashboardView com 'health/jobs').
//   GET  /v1/ai/control       -> estado/config      (.list())
//   PATCH/PUT /v1/ai/control  -> persistência       (.update())
//   GET  /v1/ai/usage         -> telemetria do período (.list())
const aiControlApi = resourceFactory('ai/control');
const aiUsageApi = resourceFactory('ai/usage');

// ---------- estado base ----------
const firstLoad = ref(true);
const loading = ref(true);
const fatalError = ref(null); // só vira fatal se NADA carregar (página em branco proibida)
const configError = ref(null);
const usageError = ref(false);
const usageLoading = ref(true);
const feedbackError = ref(null);
const feedbackLoading = ref(true);
const togglingMaster = ref(false);
const savingModes = ref(false);
const updatedAt = ref(null);

// Defaults FAIL-CLOSED: na ausência de resposta, a IA está desligada e segura.
const control = reactive({
  enabled: false,
  modes: { assist: false, chat: false },
  budgetUsd: 0,
  tokenBudget: 0,
  model: '',
  promptVersion: '',
  temperature: 0,
  dryRun: true,
  grounding: { useKb: true, useSimilarTickets: true },
});

const usage = reactive({
  tokens: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  requests: 0,
  latencyP95Ms: 0,
  thumbsUp: 0,
  thumbsDown: 0,
  periodLabel: '',
});
const feedbackRows = ref([]);

// ---------- catálogos estáticos da tela ----------
const modeList = [
  { key: 'assist', glyph: '✦', label: 'Assistência (classificação)', desc: 'Sugere categoria e prioridade ao abrir um chamado.' },
  { key: 'chat', glyph: '💬', label: 'Chat / rascunho de resposta', desc: 'Conversa e propõe rascunhos citando a base de conhecimento.' },
];
const modelOptions = ['claude-opus-4-8', 'claude-sonnet-4-5', 'claude-haiku-4-5'];

const feedbackColumns = [
  { key: 'vote', label: 'Voto', align: 'center' },
  { key: 'kind', label: 'Tipo' },
  { key: 'summary', label: 'Resumo' },
  { key: 'agent', label: 'Agente' },
  { key: 'created_at', label: 'Quando', align: 'right' },
];

// ---------- normalização defensiva (a API pode envelopar em {data} ou não) ----------
function unwrap(res) {
  if (res && res.data !== undefined && !Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.data)) return res;
  return res || {};
}
function num(v, fallback = 0) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// ---------- carregamento ----------
async function loadControl() {
  configError.value = null;
  try {
    const c = unwrap(await aiControlApi.list());
    control.enabled = !!c.enabled;
    control.modes = {
      assist: !!(c.modes && c.modes.assist),
      chat: !!(c.modes && c.modes.chat),
    };
    control.budgetUsd = num(c.budgetUsd ?? c.budget_usd);
    control.tokenBudget = num(c.tokenBudget ?? c.token_budget);
    control.model = c.model || '';
    control.promptVersion = c.promptVersion ?? c.prompt_version ?? '';
    control.temperature = num(c.temperature, 0);
    control.dryRun = !!(c.dryRun ?? c.dry_run ?? true);
    const g = c.grounding || {};
    control.grounding = {
      useKb: !!(g.useKb ?? g.use_kb ?? true),
      useSimilarTickets: !!(g.useSimilarTickets ?? g.use_similar_tickets ?? true),
    };
    return true;
  } catch (e) {
    configError.value = e && e.message ? e.message : 'Não foi possível ler o controle da IA.';
    return false;
  }
}

async function loadUsage() {
  usageLoading.value = true;
  usageError.value = false;
  try {
    const u = unwrap(await aiUsageApi.list());
    usage.tokens = num(u.tokens);
    usage.tokensIn = num(u.tokensIn ?? u.tokens_in ?? u.inputTokens ?? u.input_tokens);
    usage.tokensOut = num(u.tokensOut ?? u.tokens_out ?? u.outputTokens ?? u.output_tokens);
    usage.costUsd = num(u.costUsd ?? u.cost_usd);
    usage.requests = num(u.requests);
    usage.latencyP95Ms = num(u.latencyP95Ms ?? u.latency_p95_ms);
    usage.thumbsUp = num(u.thumbsUp ?? u.thumbs_up);
    usage.thumbsDown = num(u.thumbsDown ?? u.thumbs_down);
    usage.periodLabel = u.periodLabel || u.period_label || '';
    // se a API não detalhou a divisão in/out mas deu o total, mantemos a barra coerente.
    if (!usage.tokensIn && !usage.tokensOut && usage.tokens > 0) {
      usage.tokensIn = usage.tokens;
      usage.tokensOut = 0;
    }
    // feedback pode vir embutido na telemetria.
    const fb = u.feedback || u.thumbs || [];
    if (Array.isArray(fb)) {
      feedbackRows.value = fb.map(normalizeFeedback);
      feedbackError.value = null;
    }
  } catch (e) {
    usageError.value = true;
  } finally {
    usageLoading.value = false;
  }
}

function normalizeFeedback(f, i) {
  return {
    id: f.id ?? 'fb-' + i,
    vote: (f.vote || f.thumb || '').toString().toLowerCase() === 'down' || f.vote === false ? 'down' : 'up',
    kind: f.kind || f.mode || 'assist',
    summary: f.summary || f.comment || f.text || '—',
    agent: f.agent || f.user || '—',
    created_at: f.created_at || f.createdAt || null,
  };
}

async function loadFeedback() {
  feedbackLoading.value = true;
  feedbackError.value = null;
  try {
    // O feedback vive na telemetria do assistente (mesmo endpoint real /v1/ai/usage).
    const u = unwrap(await aiUsageApi.list({ include: 'feedback' }));
    const fb = u.feedback || u.thumbs || [];
    feedbackRows.value = Array.isArray(fb) ? fb.map(normalizeFeedback) : [];
  } catch (e) {
    feedbackError.value = e && e.message ? e.message : 'Não foi possível carregar o feedback.';
  } finally {
    feedbackLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  fatalError.value = null;
  feedbackLoading.value = true;
  const [okControl] = await Promise.all([loadControl(), loadUsage()]);
  feedbackLoading.value = false;
  // Página em branco proibida: só é fatal se o controle E a telemetria falharem juntos.
  if (!okControl && usageError.value) {
    fatalError.value = configError.value || 'Não foi possível carregar o controle da IA.';
  }
  updatedAt.value = new Date();
  loading.value = false;
  firstLoad.value = false;
}

async function reload() {
  await load();
  if (!fatalError.value) toast.success('Estado do assistente atualizado');
}

// ---------- persistência (PATCH /v1/ai/control via factory) ----------
async function persist(patch) {
  // resourceFactory.update(id, body) → escreve no recurso real /v1/ai/control.
  return unwrap(await aiControlApi.update('', patch));
}

async function toggleMaster() {
  if (togglingMaster.value) return;
  const turningOff = control.enabled;
  if (turningOff) {
    const ok = await ask({
      title: 'Desligar o assistente?',
      message: 'O assistente para de sugerir classificações e rascunhos. Os agentes seguem atendendo manualmente.',
      confirmLabel: 'Desligar',
      danger: true,
    });
    if (!ok) return;
  }
  togglingMaster.value = true;
  const next = !control.enabled;
  try {
    await persist({ enabled: next });
    control.enabled = next;
    toast.success(next ? 'Assistente ligado' : 'Assistente desligado (modo seguro)');
  } catch (e) {
    toast.error('Não foi possível alterar o assistente', { detail: e && e.message });
  } finally {
    togglingMaster.value = false;
  }
}

async function onModeToggle(key, next) {
  if (!control.enabled) return;
  savingModes.value = true;
  const prev = control.modes[key];
  control.modes[key] = next; // otimista
  try {
    await persist({ modes: { ...control.modes } });
    toast.success(modeLabelOf(key) + (next ? ' ligado' : ' desligado'));
  } catch (e) {
    control.modes[key] = prev; // rollback
    toast.error('Não foi possível salvar o modo', { detail: e && e.message });
  } finally {
    savingModes.value = false;
  }
}
const modeLabelOf = (key) => (modeList.find((m) => m.key === key) || {}).label || key;

// ---------- formulário: orçamento ----------
const budgetModal = ref(false);
const budgetForm = useForm({
  initial: { budgetUsd: 0, tokenBudget: 0 },
  rules: {
    budgetUsd: [validators.required('Informe o orçamento de custo'), validators.min(0, 'Não pode ser negativo')],
    tokenBudget: [validators.required('Informe o orçamento de tokens'), validators.min(0, 'Não pode ser negativo')],
  },
});
function openBudget() {
  budgetForm.reset();
  budgetForm.setField('budgetUsd', control.budgetUsd);
  budgetForm.setField('tokenBudget', control.tokenBudget);
  budgetModal.value = true;
}
function saveBudget() {
  budgetForm.handleSubmit(async (vals) => {
    const patch = { budgetUsd: num(vals.budgetUsd), tokenBudget: num(vals.tokenBudget) };
    try {
      await persist(patch);
      control.budgetUsd = patch.budgetUsd;
      control.tokenBudget = patch.tokenBudget;
      budgetModal.value = false;
      toast.success('Limites atualizados');
    } catch (e) {
      toast.error('Não foi possível salvar os limites', { detail: e && e.message });
    }
  });
}

// ---------- formulário: grounding & geração ----------
const configModal = ref(false);
const configForm = useForm({
  initial: { useKb: true, useSimilarTickets: true, model: '', promptVersion: '', temperature: 0, dryRun: true },
  rules: {
    model: [validators.required('Selecione um modelo')],
    temperature: [validators.min(0, 'Mínimo 0'), validators.max(1, 'Máximo 1')],
  },
});
function openConfig() {
  configForm.reset();
  configForm.setField('useKb', control.grounding.useKb);
  configForm.setField('useSimilarTickets', control.grounding.useSimilarTickets);
  configForm.setField('model', control.model || modelOptions[0]);
  configForm.setField('promptVersion', control.promptVersion);
  configForm.setField('temperature', control.temperature);
  configForm.setField('dryRun', control.dryRun);
  configModal.value = true;
}
function saveConfig() {
  configForm.handleSubmit(async (vals) => {
    if (!vals.dryRun) {
      const ok = await ask({
        title: 'Desligar o dry-run?',
        message: 'Sem dry-run, o assistente pode aplicar respostas sem confirmação do agente. Tem certeza?',
        confirmLabel: 'Desligar dry-run',
        danger: true,
      });
      if (!ok) return;
    }
    const patch = {
      grounding: { useKb: !!vals.useKb, useSimilarTickets: !!vals.useSimilarTickets },
      model: vals.model,
      promptVersion: (vals.promptVersion || '').trim(),
      temperature: num(vals.temperature, 0),
      dryRun: !!vals.dryRun,
    };
    try {
      await persist(patch);
      control.grounding = { ...patch.grounding };
      control.model = patch.model;
      control.promptVersion = patch.promptVersion;
      control.temperature = patch.temperature;
      control.dryRun = patch.dryRun;
      configModal.value = false;
      toast.success('Configuração salva');
    } catch (e) {
      toast.error('Não foi possível salvar a configuração', { detail: e && e.message });
    }
  });
}

// ---------- derivados (cabeçalho/mestre) ----------
const stampLabel = computed(() => {
  if (!updatedAt.value) return 'Lendo control plane…';
  return 'Lido às ' + format.formatDateTime(updatedAt.value);
});
const masterDesc = computed(() => {
  if (!control.enabled) return 'Nenhum modo opera enquanto a chave-mestra está desligada. Ligue para liberar as sugestões.';
  const on = modeList.filter((m) => control.modes[m.key]).length;
  if (on === 0) return 'Mestre ligado, mas nenhum modo ativo. Ligue um modo abaixo para o assistente agir.';
  return on + (on === 1 ? ' modo ativo' : ' modos ativos') + ' · operando com os limites e o grounding configurados.';
});

// ---------- derivados (telemetria) ----------
const usagePeriodLabel = computed(() => usage.periodLabel || 'período atual');
const latencyLabel = computed(() => {
  const ms = usage.latencyP95Ms;
  if (!ms) return '—';
  return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
});
const latencyTone = computed(() => {
  const ms = usage.latencyP95Ms;
  if (!ms) return 'neutral';
  if (ms > 5000) return 'error';
  if (ms > 2500) return 'warning';
  return 'success';
});

const totalThumbs = computed(() => usage.thumbsUp + usage.thumbsDown);
const approvalLabel = computed(() => {
  if (!totalThumbs.value) return '—';
  return Math.round((usage.thumbsUp / totalThumbs.value) * 100) + '%';
});
const approvalHint = computed(() =>
  totalThumbs.value ? '👍 sobre ' + totalThumbs.value + ' avaliações' : 'sem votos no período',
);
const approvalTone = computed(() => {
  if (!totalThumbs.value) return 'neutral';
  const pct = usage.thumbsUp / totalThumbs.value;
  if (pct >= 0.8) return 'success';
  if (pct >= 0.5) return 'warning';
  return 'error';
});

const costPerRequestLabel = computed(() => {
  if (!usage.requests) return '—';
  return format.formatCurrency(usage.costUsd / usage.requests, 'USD');
});

// composição de tokens (entrada vs. saída) — buckets em CSS p/ evitar style inline
const mixTotal = computed(() => usage.tokensIn + usage.tokensOut);
const mixInPct = computed(() => (mixTotal.value ? Math.round((usage.tokensIn / mixTotal.value) * 100) : 0));
const mixOutPct = computed(() => (mixTotal.value ? 100 - mixInPct.value : 0));
function bucketOf(pct) {
  const p = Math.max(0, Math.min(100, pct));
  return String(Math.round(p / 10) * 10);
}
const mixInBucket = computed(() => bucketOf(mixInPct.value));
const mixOutBucket = computed(() => bucketOf(mixOutPct.value));
const mixAria = computed(
  () => 'Composição de tokens: entrada ' + mixInPct.value + '%, saída ' + mixOutPct.value + '%.',
);

const tempLabel = computed(() => Number(control.temperature).toFixed(1));
const tempBucket = computed(() => bucketOf(Math.round(Number(control.temperature) * 100)));

// barras de orçamento (custo + tokens)
const budgetPct = computed(() => {
  if (!control.budgetUsd) return 0;
  return Math.min(999, Math.round((usage.costUsd / control.budgetUsd) * 100));
});
const tokenPct = computed(() => {
  if (!control.tokenBudget) return 0;
  return Math.min(999, Math.round((usage.tokens / control.tokenBudget) * 100));
});
const budgetPctBucket = computed(() => bucketOf(budgetPct.value));
const tokenPctBucket = computed(() => bucketOf(tokenPct.value));
function meterTone(pct, hasBudget) {
  if (!hasBudget) return 'none';
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'ok';
}
const budgetTone = computed(() => meterTone(budgetPct.value, control.budgetUsd > 0));
const tokenTone = computed(() => meterTone(tokenPct.value, control.tokenBudget > 0));
const budgetAria = computed(() =>
  control.budgetUsd ? 'Orçamento de custo: ' + budgetPct.value + '% utilizado' : 'Sem teto de custo definido',
);
const tokenAria = computed(() =>
  control.tokenBudget ? 'Orçamento de tokens: ' + tokenPct.value + '% utilizado' : 'Sem teto de tokens definido',
);

const overBudget = computed(
  () => (control.budgetUsd > 0 && budgetPct.value >= 100) || (control.tokenBudget > 0 && tokenPct.value >= 100),
);
const nearBudget = computed(
  () => (control.budgetUsd > 0 && budgetPct.value >= 80) || (control.tokenBudget > 0 && tokenPct.value >= 80),
);
const budgetStatus = computed(() => (overBudget.value ? 'error' : nearBudget.value ? 'warning' : 'active'));
const budgetStatusLabel = computed(() =>
  overBudget.value ? 'Estourado' : nearBudget.value ? 'Próximo do limite' : 'Dentro do limite',
);

// control plane / banner de modo seguro
const planeStatus = computed(() => {
  if (configError.value) return 'error';
  if (!control.enabled) return 'inactive';
  if (overBudget.value) return 'warning';
  return 'active';
});
const planeStatusLabel = computed(() => {
  if (configError.value) return 'Control plane fora';
  if (!control.enabled) return 'Modo seguro';
  if (overBudget.value) return 'Limite atingido';
  return 'Operando';
});
const showSafeBanner = computed(() => !control.enabled || overBudget.value || !!configError.value);
const safeBannerTone = computed(() => (configError.value || overBudget.value ? 'danger' : 'neutral'));
const safeBannerIcon = computed(() => (configError.value || overBudget.value ? '🛡' : '⏸'));
const safeBannerTitle = computed(() => {
  if (configError.value) return 'Assistente em fallback (fail-closed)';
  if (overBudget.value) return 'Orçamento esgotado — assistente em modo seguro';
  return 'Assistente desligado';
});
const safeBannerText = computed(() => {
  if (configError.value) return 'O control plane não respondeu. O assistente opera com o prompt v1 padrão e não aplica mutações.';
  if (overBudget.value) return 'O teto de custo/tokens do período foi atingido. Ajuste os limites para reativar as sugestões.';
  return 'Nenhum modo está ativo. Ligue o assistente para sugerir classificações e rascunhos.';
});

function kindLabel(kind) {
  const k = String(kind).toLowerCase();
  if (k === 'assist' || k === 'classification') return 'Classificação';
  if (k === 'chat' || k === 'draft' || k === 'reply') return 'Rascunho';
  return format.humanize(kind);
}

onMounted(load);
</script>

<style scoped>
.ai-ico {
  font-size: 1em;
  line-height: 1;
}
.ai-stamp {
  align-self: center;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.ai-code {
  font-family: var(--ui-font-mono);
  font-size: 0.85em;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
  color: rgb(var(--ui-accent-strong));
}

/* ---------- banner de modo seguro ---------- */
.ai-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.ai-banner[data-tone="danger"] {
  border-color: rgb(var(--ui-danger) / 0.45);
  background: rgb(var(--ui-danger) / 0.08);
}
.ai-banner-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}
.ai-banner-body {
  flex: 1;
  min-width: 0;
}
.ai-banner-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ai-banner-text {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.ai-inline-error :deep(.ui-card-body) {
  padding-block: var(--ui-space-2);
}

/* ---------- chave-mestra ---------- */
.ai-master {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  margin-bottom: var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  background: rgb(var(--ui-surface-2));
  transition: border-color 0.18s ease, background 0.18s ease;
}
.ai-master[data-on="true"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
}
.ai-master-glyph {
  font-size: 1.8rem;
  line-height: 1;
  flex-shrink: 0;
}
.ai-master-body {
  flex: 1;
  min-width: 0;
}
.ai-master-name {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ai-master-desc {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---------- modos / toggles ---------- */
.ai-toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--ui-space-3);
}
.ai-toggle {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  transition: border-color 0.15s ease;
}
.ai-toggle[data-on="true"] {
  border-left-color: rgb(var(--ui-accent));
}
.ai-toggle[data-locked="true"] {
  opacity: 0.7;
}
.ai-toggle-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.ai-toggle-glyph {
  font-size: 1.4rem;
  line-height: 1.2;
  flex-shrink: 0;
}
.ai-toggle-titles {
  min-width: 0;
}
.ai-toggle-name {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ai-toggle-desc {
  margin: 2px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* switch acessível: input nativo (sr-only) ao teclado + trilho desenhado */
.ai-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  cursor: pointer;
  user-select: none;
}
.ai-switch[data-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.6;
}
.ai-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.ai-switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.5);
  border: 1px solid rgb(var(--ui-border-strong));
  transition: background 0.15s ease;
  flex-shrink: 0;
}
.ai-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.ai-switch-input:checked + .ai-switch-track {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.ai-switch-input:checked + .ai-switch-track .ai-switch-thumb {
  transform: translateX(18px);
}
.ai-switch-input:focus-visible + .ai-switch-track {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ai-switch-state {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  min-width: 4.5em;
}
/* variante grande (chave-mestra) */
.ai-switch--lg .ai-switch-track {
  width: 52px;
  height: 30px;
}
.ai-switch--lg .ai-switch-thumb {
  width: 24px;
  height: 24px;
}
.ai-switch--lg .ai-switch-input:checked + .ai-switch-track .ai-switch-thumb {
  transform: translateX(22px);
}

/* ---------- telemetria ---------- */
.ai-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ---------- soft error (telemetria) ---------- */
.ai-soft-error {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px dashed rgb(var(--ui-danger) / 0.4);
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-danger) / 0.06);
}
.ai-soft-error-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}
.ai-soft-error-body {
  flex: 1;
  min-width: 0;
}
.ai-soft-error-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ai-soft-error-text {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---------- composição de tokens (mix) ---------- */
.ai-mix-loading {
  padding: var(--ui-space-2) 0;
}
.ai-mix {
  margin-bottom: var(--ui-space-4);
}
.ai-mix-bar {
  display: flex;
  width: 100%;
  height: 16px;
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
}
.ai-mix-seg {
  height: 100%;
  transition: width 0.3s ease;
  width: 0;
}
.ai-mix-seg[data-kind="in"] {
  background: rgb(var(--ui-accent));
}
.ai-mix-seg[data-kind="out"] {
  background: rgb(var(--ui-accent-strong));
}
.ai-mix-seg[data-pct="0"] { width: 0; }
.ai-mix-seg[data-pct="10"] { width: 10%; }
.ai-mix-seg[data-pct="20"] { width: 20%; }
.ai-mix-seg[data-pct="30"] { width: 30%; }
.ai-mix-seg[data-pct="40"] { width: 40%; }
.ai-mix-seg[data-pct="50"] { width: 50%; }
.ai-mix-seg[data-pct="60"] { width: 60%; }
.ai-mix-seg[data-pct="70"] { width: 70%; }
.ai-mix-seg[data-pct="80"] { width: 80%; }
.ai-mix-seg[data-pct="90"] { width: 90%; }
.ai-mix-seg[data-pct="100"] { width: 100%; }
.ai-mix-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}
.ai-mix-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.ai-mix-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--ui-radius-sm);
  flex-shrink: 0;
}
.ai-mix-dot[data-kind="in"] {
  background: rgb(var(--ui-accent));
}
.ai-mix-dot[data-kind="out"] {
  background: rgb(var(--ui-accent-strong));
}
.ai-mix-dot[data-kind="cpr"] {
  background: rgb(var(--ui-faint));
}
.ai-mix-label {
  color: rgb(var(--ui-muted));
}
.ai-mix-value {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* ---------- empty suave ---------- */
.ai-soft-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-5) var(--ui-space-4);
  text-align: center;
}
.ai-soft-empty-icon {
  font-size: 1.6rem;
  opacity: 0.7;
}
.ai-soft-empty-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  max-width: 42ch;
}

/* ---------- grid de 2 colunas ---------- */
.ai-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---------- barras de orçamento ---------- */
.ai-budget-loading {
  padding: var(--ui-space-2) 0;
}
.ai-meter {
  margin-bottom: var(--ui-space-4);
}
.ai-meter-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-2);
}
.ai-meter-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ai-meter-value {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.ai-meter-track {
  height: 10px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
}
.ai-meter-fill {
  height: 100%;
  border-radius: var(--ui-radius-pill);
  transition: width 0.3s ease;
  width: 0;
}
.ai-meter-fill[data-tone="ok"] {
  background: rgb(var(--ui-accent));
}
.ai-meter-fill[data-tone="warn"] {
  background: rgb(var(--ui-warn));
}
.ai-meter-fill[data-tone="over"] {
  background: rgb(var(--ui-danger));
}
.ai-meter-fill[data-tone="none"] {
  background: rgb(var(--ui-faint) / 0.5);
}
.ai-meter-fill[data-pct="0"] { width: 2%; }
.ai-meter-fill[data-pct="10"] { width: 10%; }
.ai-meter-fill[data-pct="20"] { width: 20%; }
.ai-meter-fill[data-pct="30"] { width: 30%; }
.ai-meter-fill[data-pct="40"] { width: 40%; }
.ai-meter-fill[data-pct="50"] { width: 50%; }
.ai-meter-fill[data-pct="60"] { width: 60%; }
.ai-meter-fill[data-pct="70"] { width: 70%; }
.ai-meter-fill[data-pct="80"] { width: 80%; }
.ai-meter-fill[data-pct="90"] { width: 90%; }
.ai-meter-fill[data-pct="100"] { width: 100%; }
.ai-meter-foot {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---------- grounding: fontes ---------- */
.ai-sources {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}
.ai-source {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  opacity: 0.6;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}
.ai-source[data-on="true"] {
  opacity: 1;
  border-color: rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-accent) / 0.06);
}
.ai-source-glyph {
  font-size: 1.3rem;
  flex-shrink: 0;
}
.ai-source-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ai-source-name {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ai-source-state {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---------- definições (grounding) ---------- */
.ai-defs {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ui-space-2);
}
.ai-def {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ai-def:last-child {
  border-bottom: none;
}
.ai-def dt {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ai-def dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ai-mono {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-sm);
}
.ai-temp {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ai-temp-bar {
  width: 64px;
  height: 6px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
}
.ai-temp-fill {
  display: block;
  height: 100%;
  background: rgb(var(--ui-accent));
  width: 0;
}
.ai-temp-fill[data-pct="0"] { width: 2%; }
.ai-temp-fill[data-pct="10"] { width: 10%; }
.ai-temp-fill[data-pct="20"] { width: 20%; }
.ai-temp-fill[data-pct="30"] { width: 30%; }
.ai-temp-fill[data-pct="40"] { width: 40%; }
.ai-temp-fill[data-pct="50"] { width: 50%; }
.ai-temp-fill[data-pct="60"] { width: 60%; }
.ai-temp-fill[data-pct="70"] { width: 70%; }
.ai-temp-fill[data-pct="80"] { width: 80%; }
.ai-temp-fill[data-pct="90"] { width: 90%; }
.ai-temp-fill[data-pct="100"] { width: 100%; }
.ai-hint {
  margin: var(--ui-space-4) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ai-link {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}

/* ---------- votos (feedback) ---------- */
.ai-vote {
  font-size: 1.1rem;
  line-height: 1;
}
.ai-fb-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}
.ai-fb-sep {
  color: rgb(var(--ui-faint));
}
.ai-fb-text {
  display: inline-block;
  max-width: 42ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* ---------- formulários (modais) ---------- */
.ai-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ai-form-lead {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ai-form-lead strong {
  color: rgb(var(--ui-fg));
}
.ai-input {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  width: 100%;
}
.ai-check {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
}
.ai-check[data-warn="true"] {
  border-color: rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.08);
}
.ai-check-input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: rgb(var(--ui-accent));
}
.ai-check-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ai-check-title {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ai-check-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ai-warn-line {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-warn));
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .ai-master,
  .ai-source,
  .ai-toggle,
  .ai-switch-track,
  .ai-switch-thumb,
  .ai-mix-seg,
  .ai-meter-fill {
    transition: none !important;
  }
}

@media (max-width: 860px) {
  .ai-grid-2 {
    grid-template-columns: 1fr;
  }
  .ai-master {
    flex-wrap: wrap;
  }
  .ai-def {
    flex-direction: column;
    align-items: flex-start;
  }
  .ai-def dd {
    text-align: left;
  }
  .ai-fb-text {
    max-width: 24ch;
  }
}
</style>
