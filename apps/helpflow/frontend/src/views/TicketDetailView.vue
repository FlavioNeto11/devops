<template>
  <UiPageLayout
    width="full"
    :eyebrow="'HelpFlow · Chamado #' + id"
    :title="ticket.subject || ('Chamado #' + id)"
    :subtitle="loaded ? headline : ''"
    :loading="loading"
    loading-message="Carregando o chamado…"
    :error="error"
    @retry="load"
  >
    <!-- ===================== ActionMenu (ações globais) ===================== -->
    <template #actions>
      <UiButton variant="ghost" to="/tickets">
        <template #icon-left><span class="td-ico" aria-hidden="true">←</span></template>
        Chamados
      </UiButton>
      <UiButton variant="ghost" :to="'/tickets/' + id + '/edit'">Editar</UiButton>
      <UiButton variant="subtle" @click="openAssign">Atribuir</UiButton>
      <UiButton
        variant="subtle"
        :data-pressed="aiVisible ? 'true' : null"
        :aria-pressed="aiVisible ? 'true' : 'false'"
        @click="toggleAi"
      >
        <template #icon-left><span class="td-ico" aria-hidden="true">✦</span></template>
        {{ aiVisible ? 'Ocultar IA' : 'Assistente de IA' }}
      </UiButton>
      <UiButton
        variant="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="onSubmit"
      >Submeter ao sistema externo</UiButton>
    </template>

    <!-- Banner de SLA estourado (atenção imediata) -->
    <template v-if="loaded && slaTone === 'breach'" #banner>
      <div class="td-banner" role="alert">
        <span class="td-banner-ico" aria-hidden="true">⏰</span>
        <span class="td-banner-text">
          <strong>SLA estourado.</strong> {{ slaText }} — resolva ou reatribua este chamado com prioridade.
        </span>
        <UiButton variant="ghost" size="sm" :loading="quickBusy === 'resolve'" @click="quickStatus('resolved')">
          Marcar resolvido
        </UiButton>
      </div>
    </template>

    <!-- ===================== TicketHeader + SlaCountdown ===================== -->
    <UiCard padded>
      <div class="th">
        <div class="th-main">
          <div class="th-badges" role="group" aria-label="Situação do chamado">
            <UiStatusBadge :status="ticket.status" size="lg" :label="statusLabelFor(ticket.status)" />
            <UiStatusBadge
              :status="ticket.priority"
              :tone="priorityTone(ticket.priority)"
              :label="'Prioridade: ' + enumLabel(ticket.priority)"
            />
            <UiStatusBadge
              v-if="ticket.channel"
              tone="neutral"
              :label="'Canal: ' + enumLabel(ticket.channel)"
              :with-dot="false"
            />
            <UiStatusBadge
              v-if="ticket.external_ref"
              tone="running"
              :label="'Externo: ' + ticket.external_ref"
              :with-dot="false"
            />
          </div>
          <p v-if="ticket.description" class="th-desc">{{ ticket.description }}</p>
          <p v-else class="th-desc td-muted">Sem descrição informada.</p>
          <dl class="th-meta">
            <div><dt>Solicitante</dt><dd>{{ refName('customer', ticket.customer_id) }}</dd></div>
            <div><dt>Responsável</dt><dd>{{ refName('agent', ticket.assignee_id) }}</dd></div>
            <div><dt>Time / Fila</dt><dd>{{ refName('team', ticket.team_id) }}</dd></div>
            <div><dt>Ref. externa</dt><dd class="td-mono">{{ ticket.external_ref || '—' }}</dd></div>
            <div><dt>Aberto em</dt><dd>{{ fmtDateTime(ticket.created_at) }}</dd></div>
            <div><dt>Atualizado</dt><dd>{{ fmtDateTime(ticket.updated_at) }}</dd></div>
          </dl>
        </div>

        <!-- SlaCountdown -->
        <div class="sla" :data-tone="slaTone" role="group" aria-label="Tempo de SLA">
          <span class="sla-cap">Vencimento do SLA</span>
          <span class="sla-clock" aria-live="polite">{{ slaText }}</span>
          <span class="sla-due">{{ ticket.sla_due_at ? fmtDateTime(ticket.sla_due_at) : 'Sem prazo de SLA' }}</span>
          <span class="sla-policy">{{ refName('sla', ticket.sla_policy_id) }}</span>
          <span v-if="slaTone === 'warn'" class="sla-flag">Vence em breve</span>
          <span v-else-if="slaTone === 'breach'" class="sla-flag">Prazo excedido</span>
        </div>
      </div>
    </UiCard>

    <!-- ===================== Faixa de KPIs ===================== -->
    <section class="td-metrics" aria-label="Indicadores do chamado">
      <UiMetricCard label="Status" :value="statusLabelFor(ticket.status)" :tone="statusMetricTone" hint="Situação atual" />
      <UiMetricCard label="Prioridade" :value="enumLabel(ticket.priority)" :tone="priorityMetricTone" hint="Nível de urgência" />
      <UiMetricCard
        label="Interações"
        :value="commentCountText"
        :loading="commentsLoading"
        tone="primary"
        :hint="commentBreakdown"
      />
      <UiMetricCard
        label="Jobs disparados"
        :value="jobCountText"
        :loading="jobsLoading"
        :tone="jobMetricTone"
        :hint="jobBreakdown"
      />
    </section>

    <div class="grid">
      <!-- ===================== Coluna principal ===================== -->
      <div class="col-main">
        <!-- CommentThread -->
        <UiCard title="Interações" :subtitle="threadSubtitle">
          <template #actions>
            <div class="seg" role="tablist" aria-label="Filtrar interações" @keydown="onFilterKeydown">
              <button
                v-for="opt in visibilityFilters"
                :key="opt.value"
                :id="'thread-tab-' + opt.value"
                :ref="(el) => registerTab(opt.value, el)"
                class="seg-btn"
                role="tab"
                type="button"
                aria-controls="thread-panel"
                :data-active="commentFilter === opt.value ? 'true' : null"
                :aria-selected="commentFilter === opt.value"
                :tabindex="commentFilter === opt.value ? 0 : -1"
                @click="commentFilter = opt.value"
              >{{ opt.label }}<span class="seg-n">{{ filterCount(opt.value) }}</span></button>
            </div>
          </template>

          <div id="thread-panel" role="tabpanel" :aria-labelledby="'thread-tab-' + commentFilter" tabindex="0">
            <UiLoadingState v-if="commentsLoading" variant="skeleton" :skeleton-lines="4" />
            <UiErrorState v-else-if="commentsError" :message="commentsError" @retry="loadComments" />
            <UiEmptyState
              v-else-if="!visibleComments.length"
              icon="inbox"
              title="Nenhuma interação"
              :description="commentFilter === 'all'
                ? 'Responda ao solicitante ou registre uma nota interna abaixo.'
                : 'Não há interações neste filtro.'"
            />
            <ol v-else class="thread">
              <li
                v-for="c in visibleComments"
                :key="c.id"
                class="msg"
                :data-internal="isInternal(c) ? 'true' : null"
              >
                <div class="msg-avatar" aria-hidden="true">{{ initialsFor(c.author_id) }}</div>
                <div class="msg-body">
                  <div class="msg-head">
                    <span class="msg-author">{{ refName('agent', c.author_id) }}</span>
                    <UiStatusBadge
                      :tone="isInternal(c) ? 'warning' : 'success'"
                      :label="isInternal(c) ? 'Nota interna' : 'Pública'"
                      size="sm"
                    />
                    <span class="msg-when">{{ fmtDateTime(c.created_at) }}</span>
                  </div>
                  <p class="msg-text">{{ c.body }}</p>
                </div>
              </li>
            </ol>
          </div>

          <!-- AddCommentForm -->
          <template #footer>
            <form class="addc" @submit.prevent="onAddComment">
              <UiFormField label="Nova interação" :required="true" :error="cf.errors.body" full-width>
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="cf.values.body"
                    placeholder="Escreva uma resposta pública ou uma nota interna…"
                    @input="cf.setField('body', $event.target.value)"
                  ></textarea>
                </template>
              </UiFormField>
              <div class="addc-row">
                <UiFormField label="Visibilidade">
                  <template #default="{ id }">
                    <select :id="id" :value="cf.values.visibility" @change="cf.setField('visibility', $event.target.value)">
                      <option value="public">Pública (visível ao solicitante)</option>
                      <option value="internal">Interna (somente agentes)</option>
                    </select>
                  </template>
                </UiFormField>
                <UiFormField label="Autor (agente)">
                  <template #default="{ id }">
                    <select :id="id" :value="cf.values.author_id" @change="cf.setField('author_id', $event.target.value)">
                      <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                      <option v-if="!agents.length" value="">Sem agentes</option>
                    </select>
                  </template>
                </UiFormField>
                <div class="addc-actions">
                  <UiButton type="submit" :loading="cf.submitting.value" :disabled="!agents.length">
                    Enviar interação
                  </UiButton>
                </div>
              </div>
            </form>
          </template>
        </UiCard>

        <!-- JobTimeline -->
        <UiCard title="Histórico de jobs" subtitle="Processos disparados pelo chamado (fila transacional).">
          <template #actions>
            <UiButton variant="ghost" size="sm" :loading="jobsLoading" @click="loadJobs">Atualizar</UiButton>
            <UiButton variant="subtle" size="sm" to="/jobs">Abrir fila</UiButton>
          </template>

          <UiLoadingState v-if="jobsLoading" variant="skeleton" :skeleton-lines="3" />
          <UiErrorState
            v-else-if="jobsError"
            :message="jobsError"
            :retryable="jobsAvailable"
            @retry="loadJobs"
          >
            <template v-if="!jobsAvailable" #action>
              <span class="td-muted">Monitor de fila indisponível neste ambiente.</span>
            </template>
          </UiErrorState>
          <UiEmptyState
            v-else-if="!jobEvents.length"
            icon="clock"
            title="Nenhum job disparado"
            description="Ao submeter ao sistema externo, o job aparece aqui."
          />
          <ol v-else class="timeline">
            <li
              v-for="(j, i) in jobEvents"
              :key="j.id != null ? ('job-' + j.id) : ('ev-' + i)"
              class="tl-item"
              :data-tone="jobTone(j.status)"
            >
              <span class="tl-dot" aria-hidden="true" />
              <div class="tl-content">
                <div class="tl-head">
                  <span class="tl-type td-mono">{{ j.type }}</span>
                  <UiStatusBadge :status="j.status" size="sm" :label="enumLabel(j.status)" />
                  <span v-if="j.attempts != null" class="tl-attempts">tentativa {{ j.attempts }}<template v-if="j.max_attempts">/{{ j.max_attempts }}</template></span>
                </div>
                <p v-if="j.detail" class="tl-meta">{{ j.detail }}</p>
                <p v-if="j.error" class="tl-error">{{ truncate(j.error, 120) }}</p>
                <div class="tl-foot">
                  <span v-if="j.at" class="tl-when">{{ fmtDateTime(j.at) }}</span>
                  <button
                    v-if="j.id != null"
                    type="button"
                    class="tl-link"
                    @click="openJob(j)"
                  >Ver detalhes</button>
                </div>
              </div>
            </li>
          </ol>

          <template v-if="jobCounts" #footer>
            <div class="jobsum" aria-label="Resumo da fila de jobs">
              <span v-for="s in jobSummary" :key="s.key" class="jobsum-cell" :data-tone="jobTone(s.key)">
                <strong>{{ s.value }}</strong> {{ s.label }}
              </span>
            </div>
          </template>
        </UiCard>

        <!-- AiAssistPanel -->
        <UiCard v-if="aiVisible" title="Assistente de IA" subtitle="Sugestão contextual fundamentada neste chamado.">
          <template #actions>
            <UiButton variant="subtle" size="sm" :loading="aiLoading && aiLastMode === 'summary'" :disabled="aiLoading" @click="runAi('summary')">Resumir</UiButton>
            <UiButton variant="subtle" size="sm" :loading="aiLoading && aiLastMode === 'reply'" :disabled="aiLoading" @click="runAi('reply')">Sugerir resposta</UiButton>
            <UiButton variant="subtle" size="sm" :loading="aiLoading && aiLastMode === 'triage'" :disabled="aiLoading" @click="runAi('triage')">Triagem</UiButton>
          </template>
          <div class="ai-region" aria-live="polite" :aria-busy="aiLoading ? 'true' : 'false'">
            <UiLoadingState v-if="aiLoading" variant="spinner" title="Consultando o assistente…" />
            <UiErrorState
              v-else-if="aiError"
              :message="aiError"
              :retryable="aiAvailable"
              @retry="runAi(aiLastMode)"
            >
              <template v-if="!aiAvailable" #action>
                <span class="td-muted">Assistente indisponível neste ambiente.</span>
              </template>
            </UiErrorState>
            <div v-else-if="aiAnswer" class="ai-answer">
              <p class="ai-mode">{{ aiModeLabel(aiLastMode) }}</p>
              <p class="ai-text">{{ aiAnswer }}</p>
              <div v-if="aiCitations.length" class="ai-cites">
                <span class="ai-cites-cap">Fontes</span>
                <UiStatusBadge
                  v-for="(cite, i) in aiCitations"
                  :key="i"
                  tone="neutral"
                  :label="cite"
                  :with-dot="false"
                  size="sm"
                />
              </div>
              <div class="ai-foot">
                <UiButton variant="ghost" size="sm" @click="useAiAsComment">Usar como rascunho de interação</UiButton>
              </div>
            </div>
            <UiEmptyState
              v-else
              icon="info"
              title="Peça uma sugestão"
              description="Resuma o chamado, gere um rascunho de resposta ou peça uma triagem com base no histórico."
            />
          </div>
        </UiCard>
      </div>

      <!-- ===================== PropertiesSidebar ===================== -->
      <aside class="col-side" aria-label="Propriedades do chamado">
        <UiCard title="Propriedades" subtitle="Edite e salve as alterações.">
          <form class="props" @submit.prevent="saveProps">
            <UiFormField label="Status" :required="true" :error="pf.errors.status">
              <template #default="{ id }">
                <select :id="id" :value="pf.values.status" @change="pf.setField('status', $event.target.value)">
                  <option v-for="s in statusOptions" :key="s" :value="s">{{ statusLabelFor(s) }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Prioridade" :required="true" :error="pf.errors.priority">
              <template #default="{ id }">
                <select :id="id" :value="pf.values.priority" @change="pf.setField('priority', $event.target.value)">
                  <option v-for="p in priorityOptions" :key="p" :value="p">{{ enumLabel(p) }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Responsável">
              <template #default="{ id }">
                <select :id="id" :value="pf.values.assignee_id" @change="pf.setField('assignee_id', $event.target.value)">
                  <option value="">Sem responsável</option>
                  <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Time / Fila">
              <template #default="{ id }">
                <select :id="id" :value="pf.values.team_id" @change="pf.setField('team_id', $event.target.value)">
                  <option value="">Sem time</option>
                  <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Política de SLA">
              <template #default="{ id }">
                <select :id="id" :value="pf.values.sla_policy_id" @change="pf.setField('sla_policy_id', $event.target.value)">
                  <option value="">Sem política</option>
                  <option v-for="s in slaPolicies" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </template>
            </UiFormField>

            <div class="props-actions">
              <UiButton variant="ghost" type="button" :disabled="!propsDirty || pf.submitting.value" @click="resetProps">
                Descartar
              </UiButton>
              <UiButton type="submit" :loading="pf.submitting.value" :disabled="!propsDirty">
                Salvar alterações
              </UiButton>
            </div>
          </form>
        </UiCard>

        <UiCard title="Atalhos">
          <div class="quick">
            <UiButton
              variant="subtle"
              block
              :loading="quickBusy === 'progress'"
              :disabled="ticket.status === 'in_progress'"
              @click="quickStatus('in_progress')"
            >Iniciar atendimento</UiButton>
            <UiButton
              variant="subtle"
              block
              :loading="quickBusy === 'pending'"
              :disabled="ticket.status === 'pending'"
              @click="quickStatus('pending')"
            >Aguardar solicitante</UiButton>
            <UiButton
              variant="subtle"
              block
              :loading="quickBusy === 'resolve'"
              :disabled="ticket.status === 'resolved'"
              @click="quickStatus('resolved')"
            >Marcar como resolvido</UiButton>
            <UiButton
              variant="ghost"
              block
              :loading="quickBusy === 'mine'"
              :disabled="!firstAgentId"
              @click="assignToFirstAgent"
            >Atribuir a {{ firstAgentName }}</UiButton>
          </div>
        </UiCard>

        <UiCard title="Solicitante">
          <dl class="side-dl">
            <div class="side-dl-row">
              <dt>Nome</dt>
              <dd class="side-strong">{{ refName('customer', ticket.customer_id) }}</dd>
            </div>
            <div v-if="customerEmail" class="side-dl-row">
              <dt>E-mail</dt>
              <dd class="td-mono side-ellipsis" :title="customerEmail">{{ customerEmail }}</dd>
            </div>
            <div class="side-dl-row">
              <dt>Canal de entrada</dt>
              <dd>{{ enumLabel(ticket.channel) }}</dd>
            </div>
          </dl>
          <template #footer>
            <UiButton
              v-if="ticket.customer_id"
              variant="ghost"
              size="sm"
              :to="'/customers/' + ticket.customer_id"
            >Ver solicitante</UiButton>
            <span v-else class="td-muted">Sem solicitante vinculado.</span>
          </template>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>

  <!-- Modal: atribuir / encaminhar -->
  <UiModal v-model:open="assignOpen" title="Atribuir chamado" width="sm">
    <form class="assign" @submit.prevent="confirmAssign">
      <UiFormField label="Responsável">
        <template #default="{ id }">
          <select :id="id" v-model="assignDraft.assignee_id">
            <option value="">Sem responsável</option>
            <option v-for="a in agents" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </template>
      </UiFormField>
      <UiFormField label="Time / Fila" hint="Encaminhe a fila responsável pelo atendimento.">
        <template #default="{ id }">
          <select :id="id" v-model="assignDraft.team_id">
            <option value="">Sem time</option>
            <option v-for="t in teams" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
          </select>
        </template>
      </UiFormField>
    </form>
    <template #footer>
      <UiButton variant="ghost" :disabled="assignBusy" @click="assignOpen = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="assignBusy" @click="confirmAssign">Atribuir</UiButton>
    </template>
  </UiModal>

  <!-- Modal: detalhe do job -->
  <UiModal v-model:open="jobOpen" :title="jobModalTitle" width="lg">
    <div v-if="currentJob" class="jobd">
      <header class="jobd-head">
        <UiStatusBadge :status="currentJob.status" :label="enumLabel(currentJob.status)" size="lg" />
        <span class="jobd-type td-mono">{{ currentJob.type || 'job' }}</span>
        <span v-if="currentJob.id != null" class="jobd-id td-mono">#{{ currentJob.id }}</span>
      </header>
      <dl class="jobd-dl">
        <div class="jobd-row"><dt>Tentativas</dt><dd>{{ currentJob.attempts ?? 0 }} de {{ currentJob.max_attempts ?? '—' }}</dd></div>
        <div class="jobd-row"><dt>Chave de idempotência</dt><dd class="td-mono jobd-wrap">{{ currentJob.job_key || '—' }}</dd></div>
        <div class="jobd-row"><dt>Worker</dt><dd>{{ currentJob.locked_by || 'Nenhum' }}</dd></div>
        <div class="jobd-row"><dt>Executar após</dt><dd>{{ currentJob.run_after ? fmtDateTime(currentJob.run_after) : '—' }}</dd></div>
        <div class="jobd-row"><dt>Criado em</dt><dd>{{ currentJob.created_at ? fmtDateTime(currentJob.created_at) : '—' }}</dd></div>
        <div class="jobd-row"><dt>Atualizado em</dt><dd>{{ currentJob.updated_at ? fmtDateTime(currentJob.updated_at) : '—' }}</dd></div>
      </dl>
      <div v-if="currentJob.last_error" class="jobd-err">
        <p class="jobd-err-title"><span aria-hidden="true">⚠</span> Último erro</p>
        <pre class="jobd-pre td-mono">{{ currentJob.last_error }}</pre>
      </div>
      <p v-else class="td-muted">Nenhum erro registrado para este job.</p>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="jobOpen = false">Fechar</UiButton>
      <UiButton v-if="currentJob && currentJob.id != null" variant="subtle" :to="'/jobs/' + currentJob.id">Abrir no monitor</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout, UiCard, UiMetricCard, UiButton, UiStatusBadge, UiFormField,
  UiEmptyState, UiLoadingState, UiErrorState, UiModal,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();
const ask = useConfirm();

// ---- recursos de domínio reais (sem fallback a placeholders de scaffold) ----
const tickets = api.tickets;        // recurso REAL do chamado (/v1/tickets)
const commentsApi = api.comments;   // fallback CRUD de comentários (/v1/comments)
const jobsApi = api.jobs;           // fila transacional (/v1/jobs)
// Endpoints dedicados do chamado (REF-HELPFLOW-0004):
//  · tickets.messages(id) → GET /v1/tickets/{id}/messages (thread de interações)
//  · tickets.sla(id)      → GET /v1/tickets/{id}/sla      (estado do SLA)
//  · tickets.assist(id)   → POST /v1/tickets/{id}/assist  (sugestão de IA)

function hasFn(obj, name) { return obj && typeof obj[name] === 'function'; }

// ---- estado base ----
const loading = ref(true);
const loaded = ref(false);
const error = ref(null);
const ticket = ref({});

// referências (resolvem IDs -> nomes na sidebar/thread)
const agents = ref([]);
const teams = ref([]);
const customers = ref([]);
const slaPolicies = ref([]);

const statusOptions = ['open', 'in_progress', 'pending', 'on_hold', 'resolved', 'closed'];
const priorityOptions = ['low', 'medium', 'high', 'urgent'];

const STATUS_LABELS = {
  open: 'Aberto', in_progress: 'Em atendimento', pending: 'Pendente',
  on_hold: 'Em espera', resolved: 'Resolvido', closed: 'Fechado',
};
const ENUM_LABELS = {
  low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente',
  email: 'E-mail', portal: 'Portal', phone: 'Telefone', chat: 'Chat', api: 'API',
  queued: 'Na fila', running: 'Executando', done: 'Concluído', dlq: 'Falha (DLQ)', failed: 'Falhou',
};
const AI_MODE_LABELS = { summary: 'Resumo da situação', reply: 'Rascunho de resposta', triage: 'Triagem sugerida' };
const statusLabelFor = (s) => STATUS_LABELS[s] || format.humanize(s);
const enumLabel = (v) => (v == null || v === '' ? '—' : (ENUM_LABELS[v] || format.humanize(v)));
const aiModeLabel = (m) => AI_MODE_LABELS[m] || 'Sugestão';
const fmtDateTime = (v) => format.formatDateTime(v);
const truncate = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function priorityTone(p) {
  if (p === 'urgent') return 'error';
  if (p === 'high') return 'warning';
  if (p === 'low') return 'neutral';
  return 'running';
}
const statusMetricTone = computed(() => {
  const s = ticket.value.status;
  if (s === 'resolved' || s === 'closed') return 'success';
  if (s === 'on_hold' || s === 'pending') return 'warning';
  if (s === 'in_progress') return 'running';
  return 'neutral';
});
const priorityMetricTone = computed(() => {
  const p = ticket.value.priority;
  if (p === 'urgent') return 'error';
  if (p === 'high') return 'warning';
  return 'neutral';
});

const headline = computed(() => {
  const parts = [statusLabelFor(ticket.value.status), enumLabel(ticket.value.priority) + ' prioridade'];
  const who = refName('customer', ticket.value.customer_id);
  if (who && !who.startsWith('#')) parts.push('de ' + who);
  return parts.join(' · ');
});

// resolução de nomes a partir de coleções de referência
function findById(list, id) {
  if (id == null || id === '') return null;
  return list.value.find((x) => String(x.id) === String(id)) || null;
}
function refName(kind, id) {
  if (id == null || id === '') return '—';
  let r = null;
  if (kind === 'agent') r = findById(agents, id);
  else if (kind === 'team') r = findById(teams, id);
  else if (kind === 'customer') r = findById(customers, id);
  else if (kind === 'sla') r = findById(slaPolicies, id);
  return (r && r.name) || ('#' + id);
}
function initialsFor(id) {
  const n = refName('agent', id);
  if (!n || n.startsWith('#')) return '#';
  return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
const customerEmail = computed(() => {
  const c = findById(customers, ticket.value.customer_id);
  return (c && (c.email || c.contact_email)) || '';
});

// ---- SLA countdown (relógio vivo) ----
const now = ref(Date.now());
let clockTimer = null;
const slaMs = computed(() => {
  if (!ticket.value.sla_due_at) return null;
  const due = new Date(ticket.value.sla_due_at).getTime();
  if (isNaN(due)) return null;
  return due - now.value;
});
const slaBreached = computed(() => slaMs.value != null && slaMs.value <= 0);
const slaClosed = computed(() => ['resolved', 'closed'].includes(ticket.value.status));
const slaTone = computed(() => {
  if (slaMs.value == null) return 'neutral';
  if (slaClosed.value) return 'ok';
  if (slaBreached.value) return 'breach';
  if (slaMs.value < 60 * 60 * 1000) return 'warn';
  return 'ok';
});
const slaText = computed(() => {
  if (slaMs.value == null) return '—';
  if (slaClosed.value) return 'Encerrado';
  const ms = Math.abs(slaMs.value);
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h || d) parts.push(h + 'h');
  parts.push(m + 'min');
  const body = parts.join(' ');
  return slaBreached.value ? ('Estourado há ' + body) : ('Vence em ' + body);
});

// ---- carregamento principal ----
async function loadReferences() {
  const safe = async (apiObj) => {
    if (!hasFn(apiObj, 'list')) return [];
    try { const r = await apiObj.list({ pageSize: 200 }); return (r && r.data) || (Array.isArray(r) ? r : []); }
    catch { return []; }
  };
  const [ag, tm, cu, sp] = await Promise.all([
    safe(api.agents), safe(api.teams), safe(api.customers), safe(api.slaPolicies),
  ]);
  agents.value = ag; teams.value = tm; customers.value = cu; slaPolicies.value = sp;
}

async function load() {
  loading.value = true; error.value = null;
  try {
    if (!hasFn(tickets, 'get')) throw new Error('Recurso de chamados indisponível.');
    const [t] = await Promise.all([tickets.get(props.id), loadReferences()]);
    ticket.value = (t && t.data !== undefined ? t.data : t) || {};
    loaded.value = true;
    syncProps();
    if (!cf.values.author_id && agents.value.length) cf.values.author_id = agents.value[0].id;
    // enriquece sla_due_at com o estado autoritativo do endpoint dedicado (REF-HELPFLOW-0004)
    if (hasFn(tickets, 'sla')) {
      tickets.sla(props.id).then((s) => {
        if (s && s.sla_due_at && !ticket.value.sla_due_at) ticket.value = { ...ticket.value, sla_due_at: s.sla_due_at };
      }).catch(() => {});
    }
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
  loadComments();
  loadJobs();
}

// ---- comentários (thread) ----
const commentsLoading = ref(true);
const commentsError = ref(null);
const comments = ref([]);
const commentFilter = ref('all');
const visibilityFilters = [
  { value: 'all', label: 'Todas' },
  { value: 'public', label: 'Públicas' },
  { value: 'internal', label: 'Internas' },
];
const isInternal = (c) => c && c.visibility === 'internal';

// roving tabindex + navegação por seta no filtro segmentado (padrão ARIA tabs)
const tabEls = new Map();
function registerTab(value, el) { if (el) tabEls.set(value, el); else tabEls.delete(value); }
function onFilterKeydown(e) {
  const order = visibilityFilters.map((o) => o.value);
  const idx = order.indexOf(commentFilter.value);
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(idx + 1) % order.length];
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[(idx - 1 + order.length) % order.length];
  else if (e.key === 'Home') next = order[0];
  else if (e.key === 'End') next = order[order.length - 1];
  if (next == null) return;
  e.preventDefault();
  commentFilter.value = next;
  const el = tabEls.get(next);
  if (el && typeof el.focus === 'function') el.focus();
}
const ticketComments = computed(() =>
  comments.value
    .filter((c) => String(c.ticket_id) === String(props.id))
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
);
const publicCount = computed(() => ticketComments.value.filter((c) => !isInternal(c)).length);
const internalCount = computed(() => ticketComments.value.length - publicCount.value);
function filterCount(value) {
  if (value === 'all') return ticketComments.value.length;
  if (value === 'public') return publicCount.value;
  return internalCount.value;
}
const visibleComments = computed(() => {
  if (commentFilter.value === 'all') return ticketComments.value;
  return ticketComments.value.filter((c) => (c.visibility || 'public') === commentFilter.value);
});
const threadSubtitle = computed(() => {
  const n = ticketComments.value.length;
  if (!n) return 'Sem interações ainda.';
  return n + ' interações · ' + publicCount.value + ' públicas · ' + internalCount.value + ' internas';
});
const commentCountText = computed(() => format.formatNumber(ticketComments.value.length));
const commentBreakdown = computed(() =>
  ticketComments.value.length ? publicCount.value + ' públicas · ' + internalCount.value + ' internas' : 'Nenhuma ainda',
);

async function loadComments() {
  commentsLoading.value = true; commentsError.value = null;
  try {
    // usa o endpoint dedicado /tickets/:id/messages (REF-HELPFLOW-0004);
    // degrada para /comments?ticket_id se o endpoint retornar 404/501
    if (hasFn(tickets, 'messages')) {
      try {
        const r = await tickets.messages(props.id);
        comments.value = (r && r.data) || (Array.isArray(r) ? r : []);
        return;
      } catch (e) {
        if (e.status !== 404 && e.status !== 501) throw e;
      }
    }
    if (!hasFn(commentsApi, 'list')) { comments.value = []; return; }
    const r = await commentsApi.list({ ticket_id: props.id, pageSize: 200, sort: 'created_at', dir: 'asc' });
    comments.value = (r && r.data) || (Array.isArray(r) ? r : []);
  } catch (e) {
    commentsError.value = e;
  } finally {
    commentsLoading.value = false;
  }
}

const cf = useForm({
  initial: { body: '', visibility: 'public', author_id: '' },
  rules: { body: [validators.required(), validators.minLen(2)] },
});
function onAddComment() {
  cf.handleSubmit(async (vals) => {
    if (!hasFn(commentsApi, 'create')) { toast.error('Comentários indisponíveis.'); return; }
    try {
      await commentsApi.create({
        ticket_id: Number(props.id),
        author_id: Number(vals.author_id) || (agents.value[0] && agents.value[0].id),
        body: vals.body,
        visibility: vals.visibility,
      });
      toast.success(vals.visibility === 'internal' ? 'Nota interna registrada' : 'Resposta enviada');
      cf.values.body = '';
      delete cf.errors.body;
      await loadComments();
    } catch (e) {
      toast.error(e.message || 'Falha ao registrar a interação');
    }
  });
}

// ---- propriedades editáveis (sidebar) ----
const pf = useForm({
  initial: { status: 'open', priority: 'medium', assignee_id: '', team_id: '', sla_policy_id: '' },
  rules: { status: [validators.required()], priority: [validators.required()] },
});
function syncProps() {
  pf.values.status = ticket.value.status || 'open';
  pf.values.priority = ticket.value.priority || 'medium';
  pf.values.assignee_id = ticket.value.assignee_id != null ? String(ticket.value.assignee_id) : '';
  pf.values.team_id = ticket.value.team_id != null ? String(ticket.value.team_id) : '';
  pf.values.sla_policy_id = ticket.value.sla_policy_id != null ? String(ticket.value.sla_policy_id) : '';
}
const propsDirty = computed(() => {
  const t = ticket.value;
  const norm = (v) => (v == null || v === '' ? '' : String(v));
  return pf.values.status !== norm(t.status || 'open')
    || pf.values.priority !== norm(t.priority || 'medium')
    || pf.values.assignee_id !== norm(t.assignee_id)
    || pf.values.team_id !== norm(t.team_id)
    || pf.values.sla_policy_id !== norm(t.sla_policy_id);
});
function resetProps() { syncProps(); }
function toNumOrNull(v) { return v === '' || v == null ? null : Number(v); }

async function persist(patch, successMsg) {
  if (!hasFn(tickets, 'update')) { toast.error('Edição indisponível.'); return false; }
  try {
    const updated = await tickets.update(props.id, patch);
    const u = updated && updated.data !== undefined ? updated.data : updated;
    ticket.value = (u && u.id != null) ? u : { ...ticket.value, ...patch };
    syncProps();
    toast.success(successMsg);
    return true;
  } catch (e) {
    toast.error(e.message || 'Falha ao salvar');
    return false;
  }
}
function saveProps() {
  pf.handleSubmit(async (vals) => {
    await persist({
      status: vals.status,
      priority: vals.priority,
      assignee_id: toNumOrNull(vals.assignee_id),
      team_id: toNumOrNull(vals.team_id),
      sla_policy_id: toNumOrNull(vals.sla_policy_id),
    }, 'Propriedades atualizadas');
  });
}

// ---- atalhos rápidos ----
const quickBusy = ref('');
const firstAgentId = computed(() => (agents.value[0] && agents.value[0].id) || null);
const firstAgentName = computed(() => (agents.value[0] && agents.value[0].name) || 'agente');
const QUICK_KEYS = { in_progress: 'progress', pending: 'pending', resolved: 'resolve' };
async function quickStatus(status) {
  const key = QUICK_KEYS[status] || status;
  if (status === 'resolved') {
    const ok = await ask({ title: 'Resolver chamado', message: 'Marcar este chamado como resolvido?' });
    if (!ok) return;
  }
  quickBusy.value = key;
  try { await persist({ status }, 'Status: ' + statusLabelFor(status)); }
  finally { quickBusy.value = ''; }
}
async function assignToFirstAgent() {
  if (!firstAgentId.value) return;
  quickBusy.value = 'mine';
  try { await persist({ assignee_id: firstAgentId.value }, 'Atribuído a ' + firstAgentName.value); }
  finally { quickBusy.value = ''; }
}

// ---- modal: atribuir / encaminhar ----
const assignOpen = ref(false);
const assignBusy = ref(false);
const assignDraft = reactive({ assignee_id: '', team_id: '' });
function openAssign() {
  assignDraft.assignee_id = ticket.value.assignee_id != null ? String(ticket.value.assignee_id) : '';
  assignDraft.team_id = ticket.value.team_id != null ? String(ticket.value.team_id) : '';
  assignOpen.value = true;
}
async function confirmAssign() {
  assignBusy.value = true;
  try {
    const ok = await persist(
      { assignee_id: toNumOrNull(assignDraft.assignee_id), team_id: toNumOrNull(assignDraft.team_id) },
      'Atribuição atualizada',
    );
    if (ok) assignOpen.value = false;
  } finally {
    assignBusy.value = false;
  }
}

// ---- submeter ao sistema externo (ActionMenu) ----
const submitting = ref(false);
const canSubmit = computed(() => ['open', 'in_progress', 'pending', 'on_hold'].includes(ticket.value.status));
async function onSubmit() {
  const ok = await ask({
    title: 'Submeter ao sistema externo',
    message: 'Enviar este chamado ao sistema externo? Um job de integração será disparado.',
    confirmLabel: 'Submeter',
  });
  if (!ok) return;
  if (!hasFn(tickets, 'submit')) { toast.error('Submissão externa indisponível.'); return; }
  submitting.value = true;
  try {
    const res = await tickets.submit(props.id);
    const r = res && res.data !== undefined ? res.data : res;
    toast.success('Chamado submetido — integração em andamento');
    // marca um evento otimista até o monitor refletir o job real
    jobEvents.value.unshift({
      type: (r && r.type) || 'ticket.submit',
      status: (r && r.status) || 'queued',
      detail: (r && r.enqueued) ? 'Job de integração enfileirado.' : 'Submissão registrada.',
      at: new Date().toISOString(),
    });
    await load();
  } catch (e) {
    toast.error(e.message || 'Falha ao submeter');
  } finally {
    submitting.value = false;
  }
}

// ---- JobTimeline (jobs reais filtrados pelo chamado + contadores da fila) ----
const jobsLoading = ref(true);
const jobsError = ref(null);
const jobsAvailable = ref(true);
const jobCounts = ref(null);
const jobEvents = ref([]);

const jobCountText = computed(() => format.formatNumber(jobEvents.value.length));
const jobMetricTone = computed(() => {
  if (jobEvents.value.some((j) => jobTone(j.status) === 'breach')) return 'error';
  if (jobEvents.value.some((j) => jobTone(j.status) === 'warn')) return 'warning';
  if (jobEvents.value.length) return 'success';
  return 'neutral';
});
const jobBreakdown = computed(() => {
  if (!jobCounts.value) return jobEvents.value.length ? 'Disparados por este chamado' : 'Nenhum ainda';
  const dlq = jobCounts.value.dlq ?? 0;
  return dlq > 0 ? (dlq + ' em falha na fila') : 'Fila saudável';
});
const jobSummary = computed(() => {
  if (!jobCounts.value) return [];
  const order = [['queued', 'na fila'], ['running', 'executando'], ['done', 'concluídos'], ['dlq', 'em falha']];
  return order.map(([key, label]) => ({ key, label, value: jobCounts.value[key] ?? 0 }));
});
function jobTone(s) {
  if (s === 'done') return 'ok';
  if (s === 'dlq' || s === 'failed') return 'breach';
  if (s === 'running' || s === 'queued' || s === 'submitting') return 'warn';
  return 'neutral';
}
function matchesTicket(job) {
  if (!job || typeof job !== 'object') return false;
  if (String(job.ticket_id) === String(props.id)) return true;
  const payload = job.payload || job.data || {};
  return String(payload.ticket_id ?? payload.ticketId) === String(props.id);
}
function toEvent(job) {
  return {
    id: job.id,
    type: job.type || 'job',
    status: job.status || 'queued',
    detail: job.job_key ? ('Idempotência: ' + truncate(job.job_key, 40)) : '',
    error: job.last_error || '',
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    job_key: job.job_key,
    locked_by: job.locked_by,
    run_after: job.run_after,
    created_at: job.created_at,
    updated_at: job.updated_at,
    last_error: job.last_error,
    at: job.updated_at || job.created_at,
  };
}
async function loadJobs() {
  jobsLoading.value = true; jobsError.value = null;
  try {
    // contadores agregados da fila (fail-soft — não bloqueia a timeline)
    if (hasFn(api, 'jobsHealth')) {
      try { const h = await api.jobsHealth(); jobCounts.value = (h && h.jobs) || null; }
      catch { jobCounts.value = null; }
    }
    // jobs reais; filtramos client-side pelos que pertencem a este chamado
    if (hasFn(jobsApi, 'list')) {
      const r = await jobsApi.list({ ticket_id: props.id, pageSize: 100, sort: 'created_at', dir: 'desc' });
      const rows = (r && r.data) || (Array.isArray(r) ? r : []);
      jobEvents.value = rows.filter(matchesTicket).map(toEvent);
      jobsAvailable.value = true;
    } else {
      jobsAvailable.value = false;
    }
  } catch (e) {
    if (e && (e.status === 404 || e.status === 501 || e.status === 503)) {
      jobsAvailable.value = false;
      // a fila pode não estar montada; ainda assim mostramos eventos otimistas se houver
      if (!jobEvents.value.length) jobsError.value = 'Monitor de fila indisponível neste ambiente.';
    } else {
      jobsError.value = e;
    }
  } finally {
    jobsLoading.value = false;
  }
}

// ---- modal: detalhe do job ----
const jobOpen = ref(false);
const currentJob = ref(null);
const jobModalTitle = computed(() => (currentJob.value ? ('Job ' + (currentJob.value.type || '')) : 'Detalhe do job'));
function openJob(j) { currentJob.value = j; jobOpen.value = true; }

// ---- AiAssistPanel ----
const aiVisible = ref(false);
const aiLoading = ref(false);
const aiError = ref(null);
const aiAnswer = ref('');
const aiCitations = ref([]);
const aiAvailable = ref(true);
const aiLastMode = ref('summary');
function toggleAi() {
  aiVisible.value = !aiVisible.value;
  if (aiVisible.value && !aiAnswer.value && !aiLoading.value) runAi('summary');
}
function buildAiPrompt(mode) {
  const t = ticket.value;
  const lines = [
    'Chamado #' + props.id + ': ' + (t.subject || ''),
    'Status: ' + statusLabelFor(t.status) + ' · Prioridade: ' + enumLabel(t.priority) + ' · Canal: ' + enumLabel(t.channel),
    'Descrição: ' + (t.description || '(sem descrição)'),
  ];
  const recent = ticketComments.value.slice(-5)
    .map((c) => '- [' + (isInternal(c) ? 'interno' : 'público') + '] ' + c.body).join('\n');
  if (recent) lines.push('Últimas interações:\n' + recent);
  if (mode === 'reply') lines.push('Tarefa: redija uma resposta cordial e objetiva ao solicitante.');
  else if (mode === 'triage') lines.push('Tarefa: sugira status, prioridade e próxima ação para triagem deste chamado.');
  else lines.push('Tarefa: resuma a situação atual e o próximo passo recomendado.');
  return lines.join('\n');
}
async function runAi(mode) {
  aiLastMode.value = mode || 'summary';
  if (!hasFn(tickets, 'assist')) {
    aiAvailable.value = false;
    aiError.value = 'Assistente de IA não está habilitado neste ambiente.';
    return;
  }
  aiLoading.value = true; aiError.value = null; aiAnswer.value = ''; aiCitations.value = [];
  try {
    const payload = { ticketId: Number(props.id), mode: aiLastMode.value, prompt: buildAiPrompt(aiLastMode.value) };
    const res = await tickets.assist(props.id, payload);
    const r = res && res.data !== undefined ? res.data : res;
    aiAnswer.value = (r && (r.answer || r.text || r.message || r.suggestion)) || 'Sem resposta do assistente.';
    aiCitations.value = (r && Array.isArray(r.citations))
      ? r.citations.map((c) => (typeof c === 'string' ? c : (c.title || c.id || ''))).filter(Boolean)
      : [];
    aiAvailable.value = true;
  } catch (e) {
    if (e.status === 503 || e.status === 501 || e.status === 404) {
      aiAvailable.value = false;
      aiError.value = 'Assistente indisponível (fail-closed): ' + (e.message || 'sem credencial de IA');
    } else {
      aiError.value = e.message || 'Falha ao consultar o assistente';
    }
  } finally {
    aiLoading.value = false;
  }
}
function useAiAsComment() {
  if (!aiAnswer.value) return;
  cf.values.body = aiAnswer.value;
  cf.values.visibility = aiLastMode.value === 'reply' ? 'public' : 'internal';
  toast.info('Rascunho copiado para a interação');
}

onMounted(() => {
  load();
  clockTimer = setInterval(() => { now.value = Date.now(); }, 30000);
});
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer); });
</script>

<style scoped>
/* ---------- banner ---------- */
.td-banner {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.10); border: 1px solid rgb(var(--ui-danger) / 0.35);
  border-radius: var(--ui-radius-md);
}
.td-banner-ico { font-size: var(--ui-text-lg); }
.td-banner-text { flex: 1 1 auto; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }
.td-banner-text strong { color: rgb(var(--ui-danger)); }

/* ---------- cabeçalho ---------- */
.th { display: flex; gap: var(--ui-space-5); align-items: stretch; flex-wrap: wrap; }
.th-main { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.th-badges { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; align-items: center; }
.th-desc { margin: 0; color: rgb(var(--ui-fg)); line-height: 1.6; white-space: pre-wrap; }
.th-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--ui-space-3) var(--ui-space-4); margin: var(--ui-space-2) 0 0; }
.th-meta dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.th-meta dd { margin: 2px 0 0; font-weight: 600; }

/* ---------- SLA countdown ---------- */
.sla {
  flex: 0 0 auto; width: 240px; display: flex; flex-direction: column; gap: 4px;
  padding: var(--ui-space-4); border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface-2));
  border-left: 4px solid rgb(var(--ui-faint));
}
.sla[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.sla[data-tone="warn"] { border-left-color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.08); }
.sla[data-tone="breach"] { border-left-color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.08); }
.sla-cap { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; }
.sla-clock { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; line-height: 1.15; }
.sla[data-tone="warn"] .sla-clock { color: rgb(var(--ui-warn)); }
.sla[data-tone="breach"] .sla-clock { color: rgb(var(--ui-danger)); }
.sla-due { font-size: var(--ui-text-sm); }
.sla-policy { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.sla-flag {
  margin-top: var(--ui-space-1); align-self: flex-start;
  font-size: var(--ui-text-xs); font-weight: 700; padding: 2px 8px; border-radius: var(--ui-radius-pill);
}
.sla[data-tone="warn"] .sla-flag { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.sla[data-tone="breach"] .sla-flag { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }

/* ---------- métricas ---------- */
.td-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--ui-space-4); }

/* ---------- layout em 2 colunas ---------- */
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--ui-space-4); align-items: start; }
.col-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: var(--ui-space-4); position: sticky; top: var(--ui-space-4); }

/* ---------- segmented filter ---------- */
.seg { display: inline-flex; border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-pill); overflow: hidden; }
.seg-btn {
  font: inherit; font-size: var(--ui-text-xs); font-weight: 600; cursor: pointer;
  padding: 5px 12px; border: none; background: transparent; color: rgb(var(--ui-muted));
  display: inline-flex; align-items: center; gap: 6px;
}
.seg-btn:hover { color: rgb(var(--ui-fg)); background: rgb(var(--ui-surface-2)); }
.seg-btn[data-active="true"] { background: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-fg)); }
.seg-n {
  font-size: 10px; min-width: 16px; text-align: center; padding: 0 4px; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18); color: inherit; line-height: 1.5;
}
.seg-btn[data-active="true"] .seg-n { background: rgb(255 255 255 / 0.25); }

/* ---------- thread ---------- */
.thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.msg { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.msg-avatar {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong));
  font-weight: 700; font-size: var(--ui-text-xs);
}
.msg[data-internal="true"] .msg-avatar { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.msg-body {
  flex: 1 1 auto; min-width: 0; border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4); background: rgb(var(--ui-surface));
}
.msg[data-internal="true"] .msg-body { background: rgb(var(--ui-warn) / 0.06); border-color: rgb(var(--ui-warn) / 0.35); }
.msg-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.msg-author { font-weight: 700; }
.msg-when { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); margin-left: auto; }
.msg-text { margin: 6px 0 0; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }

/* ---------- add comment ---------- */
.addc { display: flex; flex-direction: column; gap: var(--ui-space-3); width: 100%; }
.addc-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--ui-space-3); align-items: end; }
.addc-actions { display: flex; justify-content: flex-end; }

/* ---------- job timeline ---------- */
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.tl-item { display: flex; gap: var(--ui-space-3); position: relative; padding-left: var(--ui-space-1); }
.tl-dot { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; background: rgb(var(--ui-faint)); border: 2px solid rgb(var(--ui-surface)); box-shadow: 0 0 0 1px rgb(var(--ui-border)); }
.tl-item[data-tone="ok"] .tl-dot { background: rgb(var(--ui-ok)); }
.tl-item[data-tone="warn"] .tl-dot { background: rgb(var(--ui-warn)); }
.tl-item[data-tone="breach"] .tl-dot { background: rgb(var(--ui-danger)); }
.tl-content { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.tl-type { font-weight: 600; font-size: var(--ui-text-sm); }
.tl-attempts { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.tl-meta { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.tl-error { margin: 0; color: rgb(var(--ui-danger)); font-size: var(--ui-text-xs); word-break: break-word; }
.tl-foot { display: flex; align-items: center; gap: var(--ui-space-3); }
.tl-when { color: rgb(var(--ui-faint)); font-size: var(--ui-text-xs); }
.tl-link { font: inherit; font-size: var(--ui-text-xs); font-weight: 600; cursor: pointer; background: none; border: none; color: rgb(var(--ui-accent-strong)); padding: 0; }
.tl-link:hover { text-decoration: underline; }
.jobsum { display: flex; gap: var(--ui-space-4); flex-wrap: wrap; font-size: var(--ui-text-sm); }
.jobsum-cell { color: rgb(var(--ui-muted)); }
.jobsum-cell strong { color: rgb(var(--ui-fg)); font-family: var(--ui-font-display); }
.jobsum-cell[data-tone="ok"] strong { color: rgb(var(--ui-ok)); }
.jobsum-cell[data-tone="warn"] strong { color: rgb(var(--ui-warn)); }
.jobsum-cell[data-tone="breach"] strong { color: rgb(var(--ui-danger)); }

/* ---------- AI panel ---------- */
.ai-answer { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ai-mode { margin: 0; font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-accent-strong)); }
.ai-text { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.ai-cites { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.ai-cites-cap { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.ai-foot { display: flex; justify-content: flex-end; }

/* ---------- sidebar forms ---------- */
.props { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.props-actions { display: flex; justify-content: space-between; gap: var(--ui-space-2); }
.quick { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.side-dl { margin: 0; display: flex; flex-direction: column; }
.side-dl-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.side-dl-row:last-child { border-bottom: none; }
.side-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; flex-shrink: 0; }
.side-dl-row dd { margin: 0; text-align: right; min-width: 0; }
.side-strong { font-weight: 600; }
.side-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- modais ---------- */
.assign { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.jobd { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.jobd-head { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.jobd-type { font-weight: 700; }
.jobd-id { color: rgb(var(--ui-muted)); }
.jobd-dl { margin: 0; display: flex; flex-direction: column; }
.jobd-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4); padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.jobd-row:last-child { border-bottom: none; }
.jobd-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; flex-shrink: 0; }
.jobd-row dd { margin: 0; text-align: right; min-width: 0; }
.jobd-wrap { word-break: break-all; }
.jobd-err { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.jobd-err-title { margin: 0; font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--ui-danger)); }
.jobd-pre {
  margin: 0; padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm); line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  max-height: 40vh; overflow: auto;
}

/* ---------- utilidades ---------- */
.td-ico { font-weight: 700; }
.td-mono { font-family: var(--ui-font-mono); font-size: var(--ui-text-sm); }
.td-muted { color: rgb(var(--ui-muted)); }
.ui-btn[data-pressed="true"] { background: rgb(var(--ui-accent) / 0.22); }

/* ---------- responsivo ---------- */
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
  .col-side { position: static; }
  .sla { width: 100%; }
  .addc-row { grid-template-columns: 1fr; }
}
</style>
