<!--
  PatientDetailView — Prontuário completo do paciente (REQ-NEUROEVOLUI-0004 / 0005 / 0006).
  Hub central: cabeçalho rico com avatar/status, métricas, abas e painel lateral do Assistente IA.
  Abas: Dados cadastrais · Linha do tempo de evoluções (filtros por tipo/profissional) ·
        Agendamentos · Relatórios.
  Painel lateral: AssistantSidebar com contexto do paciente.
  Ações: editar, nova evolução, nova consulta, gerar relatório, abrir/fechar assistente.

  Endpoints REAIS (api.js):
    GET  /v1/patients/:id
    GET  /v1/patients/:patientId/evolution-notes
    GET  /v1/patients/:patientId/reports
    POST /v1/patients/:patientId/reports
    GET  /v1/consultations          (filtra por patient_id)
    POST /v1/consultations/schedule (via consultations.schedule)
    GET  /v1/professionals          (seletor + mapa id→nome)
    POST /v1/assistant              (via assistant())

  Kit-only (../ui/index.js) · Tokens --ui-* · CSP-safe (sem style= / v-html).
  Estados: loading (skeleton) · empty (CTA) · error (retry) · normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Prontuário"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="loadPatient"
  >
    <!-- ── Ações globais ──────────────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" to="/patients">← Voltar</UiButton>
      <UiButton variant="subtle" :to="'/patients/' + id + '/edit'">Editar cadastro</UiButton>
      <UiButton variant="ghost" @click="openNewNote">Nova evolução</UiButton>
      <UiButton variant="ghost" @click="scheduleOpen = true">Nova consulta</UiButton>
      <UiButton :data-assistant-active="assistantOpen ? 'true' : null" @click="toggleAssistant">
        {{ assistantOpen ? 'Fechar assistente' : 'Assistente IA' }}
      </UiButton>
    </template>

    <!-- ── Cabeçalho do paciente (banner) ─────────────────────────────────────── -->
    <template v-if="patient" #banner>
      <div class="pd-banner">
        <div class="pd-avatar-wrap">
          <span class="pd-avatar" aria-hidden="true">{{ initials }}</span>
          <span class="pd-avatar-status" :data-status-tone="statusTone" aria-hidden="true" />
        </div>
        <div class="pd-banner-main">
          <div class="pd-banner-top">
            <h2 class="pd-banner-name">{{ patient.full_name }}</h2>
            <UiStatusBadge :status="patient.status" size="lg" with-dot />
          </div>
          <p class="pd-banner-meta">
            <span v-if="ageLabel" class="pd-meta-chip">{{ ageLabel }}</span>
            <span v-if="patient.gender && patient.gender !== 'nao_informado'" class="pd-meta-chip">{{ genderLabel }}</span>
            <span v-if="patient.document" class="pd-meta-chip">CPF {{ patient.document }}</span>
            <span v-if="patient.guardian_name" class="pd-meta-chip">Resp.: {{ patient.guardian_name }}</span>
            <span class="pd-meta-chip pd-meta-muted">Cadastro: {{ fmt.formatDate(patient.created_at) }}</span>
          </p>
          <p v-if="patient.external_ref" class="pd-banner-ref">Ref. externa: {{ patient.external_ref }}</p>
        </div>
        <div class="pd-banner-contacts">
          <a v-if="patient.phone" class="pd-contact" :href="'tel:' + patient.phone" aria-label="Ligar para paciente">
            <span class="pd-contact-ic" aria-hidden="true">☎</span>{{ patient.phone }}
          </a>
          <a v-if="patient.email" class="pd-contact" :href="'mailto:' + patient.email" aria-label="Enviar e-mail ao paciente">
            <span class="pd-contact-ic" aria-hidden="true">✉</span>{{ patient.email }}
          </a>
        </div>
      </div>
    </template>

    <!-- ── Layout de conteúdo (main + sidebar) ───────────────────────────────── -->
    <div class="pd-layout" :data-sidebar="assistantOpen ? 'open' : 'closed'">

      <!-- ── Coluna principal ──────────────────────────────────────────────────── -->
      <div class="pd-main">

        <!-- Métricas rápidas -->
        <div class="pd-metrics">
          <UiMetricCard
            label="Evoluções"
            :value="notes.length"
            tone="primary"
            hint="notas registradas"
            clickable
            @click="activeTab = 'timeline'"
          />
          <UiMetricCard
            label="Consultas"
            :value="consultationRows.length"
            tone="neutral"
            hint="agendamentos"
            clickable
            @click="activeTab = 'schedule'"
          />
          <UiMetricCard
            label="Relatórios"
            :value="reports.length"
            tone="neutral"
            hint="gerados"
            clickable
            @click="activeTab = 'reports'"
          />
          <UiMetricCard
            label="Última evolução"
            :value="lastNoteLabel"
            tone="success"
            hint="data"
          />
        </div>

        <!-- Abas de navegação -->
        <div ref="tabsRef" class="pd-tabs" role="tablist" aria-label="Seções do prontuário">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="pd-tab"
            type="button"
            role="tab"
            :data-active="activeTab === t.key ? 'true' : null"
            :aria-selected="activeTab === t.key"
            :tabindex="activeTab === t.key ? 0 : -1"
            @click="activeTab = t.key"
            @keydown="onTabKey($event, t.key)"
          >
            <span class="pd-tab-ic" aria-hidden="true">{{ t.icon }}</span>
            {{ t.label }}
            <span v-if="t.count !== null && t.count > 0" class="pd-tab-count" aria-label="quantidade">{{ t.count }}</span>
          </button>
        </div>

        <!-- ── Aba: Dados cadastrais ──────────────────────────────────────────── -->
        <section
          v-show="activeTab === 'profile'"
          class="pd-pane"
          role="tabpanel"
          aria-label="Dados cadastrais"
        >
          <UiCard title="Dados cadastrais" subtitle="Informações do prontuário do paciente.">
            <template #actions>
              <UiButton variant="ghost" size="sm" :to="'/patients/' + id + '/edit'">Editar</UiButton>
            </template>
            <dl class="pd-kv">
              <div class="pd-kv-row">
                <dt>Nome completo</dt>
                <dd>{{ fmt.formatValue(patient && patient.full_name) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="patient && patient.status" /></dd>
              </div>
              <div class="pd-kv-row">
                <dt>Data de nascimento</dt>
                <dd>{{ fmt.formatDate(patient && patient.birth_date) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Idade</dt>
                <dd>{{ ageLabel || '—' }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Gênero</dt>
                <dd>{{ genderLabel || '—' }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>CPF</dt>
                <dd>{{ fmt.formatValue(patient && patient.document) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>E-mail</dt>
                <dd>{{ fmt.formatValue(patient && patient.email) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Telefone / WhatsApp</dt>
                <dd>{{ fmt.formatValue(patient && patient.phone) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Responsável legal</dt>
                <dd>{{ fmt.formatValue(patient && patient.guardian_name) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Referência externa</dt>
                <dd>{{ fmt.formatValue(patient && patient.external_ref) }}</dd>
              </div>
              <div class="pd-kv-row">
                <dt>Cadastrado em</dt>
                <dd>{{ fmt.formatDateTime(patient && patient.created_at) }}</dd>
              </div>
            </dl>
            <template v-if="patient && patient.notes">
              <h4 class="pd-notes-title">Observações gerais</h4>
              <p class="pd-notes-body">{{ patient.notes }}</p>
            </template>
          </UiCard>
        </section>

        <!-- ── Aba: Linha do tempo de evoluções ──────────────────────────────── -->
        <section
          v-show="activeTab === 'timeline'"
          class="pd-pane"
          role="tabpanel"
          aria-label="Linha do tempo de evoluções"
        >
          <UiCard title="Linha do tempo de evoluções" subtitle="Histórico clínico cronológico do paciente.">
            <template #actions>
              <UiButton variant="ghost" size="sm" :loading="notesLoading" @click="loadNotes">Atualizar</UiButton>
              <UiButton size="sm" @click="openNewNote">+ Nova evolução</UiButton>
            </template>

            <!-- Filtros de evolução -->
            <div v-if="!notesLoading && notes.length" class="pd-timeline-filters">
              <div class="pd-filter-group">
                <label class="pd-filter-label" for="filter-note-type">Tipo</label>
                <select id="filter-note-type" class="pd-filter-select" :value="noteFilter.type" @change="noteFilter.type = $event.target.value">
                  <option value="">Todos</option>
                  <option value="session">Sessão</option>
                  <option value="assessment">Avaliação</option>
                  <option value="follow_up">Acompanhamento</option>
                  <option value="discharge_note">Nota de alta</option>
                </select>
              </div>
              <div class="pd-filter-group">
                <label class="pd-filter-label" for="filter-note-prof">Profissional</label>
                <select id="filter-note-prof" class="pd-filter-select" :value="noteFilter.professional_id" @change="noteFilter.professional_id = $event.target.value">
                  <option value="">Todos</option>
                  <option v-for="p in professionalRows" :key="p.id" :value="String(p.id)">{{ p.full_name }}</option>
                </select>
              </div>
              <span class="pd-filter-count">{{ filteredNotes.length }} de {{ notes.length }} evolução(ões)</span>
            </div>

            <UiLoadingState v-if="notesLoading" variant="skeleton" :skeleton-lines="5" />
            <UiErrorState v-else-if="notesError" :message="notesError" retryable @retry="loadNotes" />
            <UiEmptyState
              v-else-if="!notes.length"
              icon="clock"
              title="Sem evoluções registradas"
              description="Registre a primeira nota de evolução clínica deste paciente."
            >
              <template #action>
                <UiButton @click="openNewNote">+ Nova evolução</UiButton>
              </template>
            </UiEmptyState>
            <UiEmptyState
              v-else-if="!filteredNotes.length"
              icon="search"
              title="Nenhuma evolução encontrada"
              description="Nenhuma nota corresponde aos filtros selecionados."
            >
              <template #action>
                <UiButton variant="ghost" @click="clearNoteFilters">Limpar filtros</UiButton>
              </template>
            </UiEmptyState>

            <ol v-else class="pd-timeline">
              <li v-for="n in filteredNotes" :key="n.id" class="pd-tl-item">
                <span class="pd-tl-dot" :data-note-type="n.type || 'session'" aria-hidden="true" />
                <div class="pd-tl-card">
                  <div class="pd-tl-head">
                    <UiStatusBadge :status="n.type" :label="noteTypeLabel(n.type)" tone="running" size="sm" />
                    <time class="pd-tl-date" :datetime="n.note_date || n.created_at">
                      {{ fmt.formatDateTime(n.note_date || n.created_at) }}
                    </time>
                  </div>
                  <p class="pd-tl-text">{{ n.text || 'Nota sem descrição textual.' }}</p>
                  <div class="pd-tl-foot">
                    <span v-if="n.professional_id" class="pd-tl-prof">
                      <span aria-hidden="true">{{ resolveGlyph('user') }}</span> Por {{ professionalName(n.professional_id) }}
                    </span>
                    <span v-if="attachmentCount(n) > 0" class="pd-tl-attach">
                      <span aria-hidden="true">{{ resolveGlyph('inbox') }}</span> {{ attachmentCount(n) }} anexo(s)
                    </span>
                  </div>
                </div>
              </li>
            </ol>
          </UiCard>
        </section>

        <!-- ── Aba: Agendamentos ──────────────────────────────────────────────── -->
        <section
          v-show="activeTab === 'schedule'"
          class="pd-pane"
          role="tabpanel"
          aria-label="Agendamentos e consultas"
        >
          <UiCard title="Agendamentos" subtitle="Consultas marcadas para este paciente.">
            <template #actions>
              <UiButton variant="ghost" size="sm" :loading="consultLoading" @click="loadConsultations">Atualizar</UiButton>
              <UiButton size="sm" @click="scheduleOpen = true">+ Nova consulta</UiButton>
            </template>
            <UiDataTable
              :columns="consultColumns"
              :rows="consultationRows"
              :loading="consultLoading"
              :error="consultError"
              row-key="id"
              density="compact"
              :empty="{ title: 'Nenhuma consulta agendada', description: 'Agende a primeira consulta deste paciente.' }"
              @retry="loadConsultations"
            >
              <template #cell-scheduled_at="{ value }">{{ fmt.formatDateTime(value) }}</template>
              <template #cell-professional_id="{ row, value }">{{ row.professional_name || professionalName(value) }}</template>
              <template #cell-amount_cents="{ value }">{{ fmt.formatCurrency((Number(value) || 0) / 100) }}</template>
              <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
              <template #cell-payment_status="{ value }"><UiStatusBadge :status="value || 'pending'" size="sm" /></template>
              <template #empty-action>
                <UiButton size="sm" @click="scheduleOpen = true">+ Nova consulta</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </section>

        <!-- ── Aba: Relatórios ────────────────────────────────────────────────── -->
        <section
          v-show="activeTab === 'reports'"
          class="pd-pane"
          role="tabpanel"
          aria-label="Relatórios gerados"
        >
          <UiCard title="Relatórios" subtitle="Relatórios de evolução gerados (processamento assíncrono via fila).">
            <template #actions>
              <UiButton variant="ghost" size="sm" :loading="reportsLoading" @click="loadReports">Atualizar</UiButton>
              <UiButton size="sm" :loading="reportForm.submitting.value" @click="openReport">Gerar relatório</UiButton>
            </template>
            <UiDataTable
              :columns="reportColumns"
              :rows="reports"
              :loading="reportsLoading"
              :error="reportsError"
              row-key="id"
              density="compact"
              :empty="{ title: 'Nenhum relatório gerado', description: 'Gere um relatório consolidando as evoluções deste paciente.' }"
              @retry="loadReports"
            >
              <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
              <template #cell-created_at="{ value }">{{ fmt.formatDateTime(value) }}</template>
              <template #cell-completed_at="{ value }">{{ value ? fmt.formatDateTime(value) : '—' }}</template>
              <template #cell-error_message="{ value }">{{ value || '—' }}</template>
              <template #empty-action>
                <UiButton size="sm" :loading="reportForm.submitting.value" @click="openReport">Gerar relatório</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </section>

      </div><!-- /pd-main -->

      <!-- ── Painel lateral — Assistente IA ──────────────────────────────────── -->
      <aside
        v-if="assistantOpen"
        class="pd-sidebar"
        aria-label="Assistente IA"
        role="complementary"
      >
        <div class="pd-sidebar-head">
          <span class="pd-sidebar-title">Assistente IA</span>
          <span class="pd-sidebar-ctx">Contexto: {{ patient ? patient.full_name : 'paciente' }}</span>
          <button class="pd-sidebar-close" type="button" aria-label="Fechar painel do assistente" @click="assistantOpen = false">✕</button>
        </div>

        <!-- Histórico de conversa -->
        <div class="pd-chat-log" aria-live="polite" aria-label="Histórico da conversa com o assistente">
          <div v-if="!chatHistory.length" class="pd-chat-empty">
            <p class="pd-chat-empty-title">Como posso ajudar?</p>
            <p class="pd-chat-empty-sub">Faça perguntas sobre o histórico clínico, evoluções ou orientações para este paciente.</p>
            <div class="pd-chat-suggestions">
              <button
                v-for="s in chatSuggestions"
                :key="s"
                class="pd-chat-suggestion"
                type="button"
                @click="sendSuggestion(s)"
              >{{ s }}</button>
            </div>
          </div>
          <template v-else>
            <div
              v-for="msg in chatHistory"
              :key="msg.id"
              class="pd-chat-msg"
              :data-role="msg.role"
            >
              <span class="pd-chat-msg-role" aria-hidden="true">{{ msg.role === 'user' ? 'Você' : 'IA' }}</span>
              <p class="pd-chat-msg-text">{{ msg.text }}</p>
              <span v-if="msg.sources && msg.sources.length" class="pd-chat-sources">
                Fontes: {{ msg.sources.join(', ') }}
              </span>
            </div>
          </template>

          <div v-if="assistantLoading" class="pd-chat-msg" data-role="assistant">
            <span class="pd-chat-msg-role" aria-hidden="true">IA</span>
            <div class="pd-chat-typing" aria-label="Assistente digitando">
              <span /><span /><span />
            </div>
          </div>
        </div>

        <!-- Campo de entrada da mensagem -->
        <div class="pd-chat-input-wrap">
          <UiErrorState
            v-if="assistantError"
            :message="assistantError"
            retryable
            @retry="retryAssistant"
          />
          <form class="pd-chat-form" @submit.prevent="sendQuestion">
            <label for="assistant-input" class="pd-sr-only">Mensagem para o assistente</label>
            <textarea
              id="assistant-input"
              class="pd-chat-textarea"
              rows="2"
              placeholder="Ex.: Resuma as últimas 3 sessões deste paciente…"
              :disabled="assistantLoading"
              :value="chatQuestion"
              @input="chatQuestion = $event.target.value"
              @keydown.enter.exact.prevent="sendQuestion"
              @keydown.enter.shift.exact.stop
            ></textarea>
            <UiButton
              type="submit"
              size="sm"
              :loading="assistantLoading"
              :disabled="!chatQuestion.trim()"
              block
            >Enviar</UiButton>
          </form>
        </div>
      </aside>

    </div><!-- /pd-layout -->

    <!-- ── Modal: Nova evolução ──────────────────────────────────────────────── -->
    <UiModal v-model:open="noteOpen" title="Nova evolução clínica" width="md">
      <form class="pd-form" @submit.prevent="submitNote">
        <UiFormSection title="Registro da evolução" :columns="1">
          <UiFormField label="Tipo de evolução" :error="noteForm.errors.type">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :value="noteForm.values.type"
                @change="noteForm.setField('type', $event.target.value)"
              >
                <option value="session">Sessão</option>
                <option value="assessment">Avaliação</option>
                <option value="follow_up">Acompanhamento</option>
                <option value="discharge_note">Nota de alta</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField
            label="Descrição da evolução"
            :required="true"
            :error="noteForm.errors.text"
            hint="Descreva a sessão, observações, conduta e intercorrências."
          >
            <template #default="{ id: fid, describedBy }">
              <textarea
                :id="fid"
                :aria-describedby="describedBy"
                rows="6"
                :value="noteForm.values.text"
                placeholder="Ex.: Paciente apresentou evolução positiva na coordenação motora fina…"
                @input="noteForm.setField('text', $event.target.value)"
              ></textarea>
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="noteOpen = false">Cancelar</UiButton>
        <UiButton :loading="noteForm.submitting.value" @click="submitNote">Salvar evolução</UiButton>
      </template>
    </UiModal>

    <!-- ── Modal: Agendar consulta ────────────────────────────────────────────── -->
    <UiModal v-model:open="scheduleOpen" title="Agendar consulta" width="md">
      <UiErrorState v-if="profError" :message="profError" retryable @retry="loadProfessionals" />
      <form v-else class="pd-form" @submit.prevent="submitSchedule">
        <UiFormSection title="Detalhes da consulta" :columns="2">
          <UiFormField label="Profissional" :required="true" :error="schedForm.errors.professional_id">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :disabled="profLoading"
                :value="schedForm.values.professional_id"
                @change="schedForm.setField('professional_id', $event.target.value)"
              >
                <option value="">{{ profLoading ? 'Carregando…' : 'Selecione um profissional' }}</option>
                <option v-for="p in professionalRows" :key="p.id" :value="p.id">
                  {{ p.full_name }}<template v-if="p.specialty"> — {{ p.specialty }}</template>
                </option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Data e hora" :required="true" :error="schedForm.errors.scheduled_at">
            <template #default="{ id: fid, describedBy }">
              <input
                type="datetime-local"
                :id="fid"
                :aria-describedby="describedBy"
                :value="schedForm.values.scheduled_at"
                @input="schedForm.setField('scheduled_at', $event.target.value)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Duração (minutos)" :error="schedForm.errors.duration_minutes">
            <template #default="{ id: fid, describedBy }">
              <input
                type="number"
                min="15"
                step="5"
                :id="fid"
                :aria-describedby="describedBy"
                :value="schedForm.values.duration_minutes"
                @input="schedForm.setField('duration_minutes', $event.target.value)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Valor (R$)" :required="true" :error="schedForm.errors.amount" hint="Valor da consulta em reais.">
            <template #default="{ id: fid, describedBy }">
              <input
                type="number"
                min="0"
                step="0.01"
                :id="fid"
                :aria-describedby="describedBy"
                :value="schedForm.values.amount"
                placeholder="Ex.: 250.00"
                @input="schedForm.setField('amount', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="scheduleOpen = false">Cancelar</UiButton>
        <UiButton
          :loading="schedForm.submitting.value"
          :disabled="profLoading || !!profError"
          @click="submitSchedule"
        >Agendar</UiButton>
      </template>
    </UiModal>

    <!-- ── Modal: Gerar relatório ─────────────────────────────────────────────── -->
    <UiModal v-model:open="reportOpen" title="Gerar relatório" width="md">
      <form class="pd-form" @submit.prevent="submitReport">
        <UiFormSection
          title="Parâmetros do relatório"
          description="Defina o tipo e, se quiser, o período. Sem período = todas as evoluções."
          :columns="2"
        >
          <UiFormField label="Tipo de relatório" :error="reportForm.errors.type">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :value="reportForm.values.type"
                @change="reportForm.setField('type', $event.target.value)"
              >
                <option value="evolucao">Evolução clínica</option>
                <option value="resumo">Resumo do período</option>
                <option value="alta">Relatório de alta</option>
                <option value="encaminhamento">Encaminhamento</option>
              </select>
            </template>
          </UiFormField>
          <div></div>
          <UiFormField label="Período — de" :error="reportForm.errors.date_from" hint="Opcional.">
            <template #default="{ id: fid, describedBy }">
              <input
                type="date"
                :id="fid"
                :aria-describedby="describedBy"
                :value="reportForm.values.date_from"
                @input="reportForm.setField('date_from', $event.target.value)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Período — até" :error="reportForm.errors.date_to" hint="Opcional.">
            <template #default="{ id: fid, describedBy }">
              <input
                type="date"
                :id="fid"
                :aria-describedby="describedBy"
                :value="reportForm.values.date_to"
                @input="reportForm.setField('date_to', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="reportOpen = false">Cancelar</UiButton>
        <UiButton :loading="reportForm.submitting.value" @click="submitReport">Gerar relatório</UiButton>
      </template>
    </UiModal>

  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiDataTable, UiButton,
  UiEmptyState, UiLoadingState, UiErrorState, UiModal, UiFormSection, UiFormField,
  useForm, useToast, validators, format as fmt, resolveTone, resolveGlyph,
} from '../ui/index.js';
import { patients, professionals, consultations, resourceFactory, assistant } from '../api.js';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const toast = useToast();

// ── Clientes de recurso (endpoints REAIS) ──────────────────────────────────────
// Recursos principais → exports nomeados do integrador.
// Coleções aninhadas do paciente (sem export próprio) → resourceFactory /v1/<name>.
const patientsApi = patients;
const professionalsApi = professionals;
const consultationsApi = consultations;
const notesApi = computed(() => resourceFactory('patients/' + props.id + '/evolution-notes'));
const reportsApi = computed(() => resourceFactory('patients/' + props.id + '/reports'));

// ── Estado: ficha ───────────────────────────────────────────────────────────────
const loading = ref(true);
const pageError = ref(null);
const patient = ref(null);

// ── Estado: coleções ────────────────────────────────────────────────────────────
const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref(null);
const noteFilter = reactive({ type: '', professional_id: '' });

const consultationRows = ref([]);
const consultLoading = ref(false);
const consultError = ref(null);

const reports = ref([]);
const reportsLoading = ref(false);
const reportsError = ref(null);

const professionalRows = ref([]);
const profLoading = ref(false);
const profError = ref(null);

// ── Abas ────────────────────────────────────────────────────────────────────────
const activeTab = ref('profile');
const tabs = computed(() => [
  { key: 'profile', label: 'Dados cadastrais', icon: resolveGlyph('user'), count: null },
  { key: 'timeline', label: 'Evoluções', icon: resolveGlyph('history'), count: notes.value.length },
  { key: 'schedule', label: 'Agendamentos', icon: resolveGlyph('bell'), count: consultationRows.value.length },
  { key: 'reports', label: 'Relatórios', icon: resolveGlyph('doc'), count: reports.value.length },
]);
const tabsRef = ref(null);
function onTabKey(e, key) {
  const order = tabs.value.map((t) => t.key);
  const i = order.indexOf(key);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const next = e.key === 'ArrowRight'
      ? (i + 1) % order.length
      : (i - 1 + order.length) % order.length;
    activeTab.value = order[next];
    requestAnimationFrame(() => {
      const container = tabsRef.value;
      if (!container) return;
      const els = container.querySelectorAll('[role=tab]');
      if (els && els[next] && els[next].focus) els[next].focus();
    });
  }
}

// ── Assistente IA (lateral) ─────────────────────────────────────────────────────
const assistantOpen = ref(false);
const chatQuestion = ref('');
const chatHistory = ref([]);
const assistantLoading = ref(false);
const assistantError = ref(null);
let chatSeq = 0;
const chatSuggestions = [
  'Resuma as últimas evoluções deste paciente',
  'Quais foram as principais intercorrências?',
  'Sugira pontos de atenção para a próxima sessão',
  'Houve melhora no quadro clínico?',
];
function toggleAssistant() { assistantOpen.value = !assistantOpen.value; }
async function sendQuestion() {
  const q = chatQuestion.value.trim();
  if (!q || assistantLoading.value) return;
  assistantError.value = null;
  const userMsg = { id: ++chatSeq, role: 'user', text: q };
  chatHistory.value.push(userMsg);
  chatQuestion.value = '';
  assistantLoading.value = true;
  try {
    const res = await assistant(q, [], { contextType: 'patient' });
    chatHistory.value.push({
      id: ++chatSeq,
      role: 'assistant',
      text: res.answer || 'Sem resposta.',
      sources: res.sources || [],
    });
  } catch (e) {
    assistantError.value = e.message || 'Falha ao consultar o assistente.';
    chatHistory.value.pop(); // remove user msg sem resposta
    chatHistory.value.push({ id: ++chatSeq, role: 'user', text: q }); // re-add for context
  } finally {
    assistantLoading.value = false;
  }
}
function sendSuggestion(s) { chatQuestion.value = s; sendQuestion(); }
function retryAssistant() { assistantError.value = null; if (chatHistory.value.length) { const last = chatHistory.value.filter((m) => m.role === 'user').pop(); if (last) { chatQuestion.value = last.text; } } }

// ── Derivados ────────────────────────────────────────────────────────────────────
const pageTitle = computed(() => (patient.value ? patient.value.full_name : 'Paciente #' + props.id));
const pageSubtitle = computed(() => 'Prontuário · Evoluções · Agendamentos · Relatórios');
const initials = computed(() => {
  const name = (patient.value && patient.value.full_name) || '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
});
const statusTone = computed(() => resolveTone(patient.value && patient.value.status));
const ageLabel = computed(() => {
  const bd = patient.value && patient.value.birth_date;
  if (!bd) return '';
  const d = new Date(bd);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age + ' anos' : '';
});
const genderLabel = computed(() => {
  const g = patient.value && patient.value.gender;
  return ({ masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: 'Não informado' })[g] || (g ? fmt.humanize(g) : '—');
});
const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) =>
    new Date(b.note_date || b.created_at || 0) - new Date(a.note_date || a.created_at || 0)
  )
);
const filteredNotes = computed(() => {
  let list = sortedNotes.value;
  if (noteFilter.type) list = list.filter((n) => n.type === noteFilter.type);
  if (noteFilter.professional_id) list = list.filter((n) => String(n.professional_id) === noteFilter.professional_id);
  return list;
});
function clearNoteFilters() { noteFilter.type = ''; noteFilter.professional_id = ''; }
const professionalById = computed(() => {
  const m = {};
  for (const p of professionalRows.value) m[String(p.id)] = p.full_name || p.name;
  return m;
});
function professionalName(id) {
  if (id === null || id === undefined || id === '') return '—';
  return professionalById.value[String(id)] || String(id);
}
const lastNoteLabel = computed(() => {
  const first = sortedNotes.value[0];
  return first ? fmt.formatDate(first.note_date || first.created_at) : '—';
});
function noteAttachments(n) {
  if (!n) return [];
  if (Array.isArray(n.attachments)) return n.attachments;
  const sf = n.structured_fields;
  if (sf && Array.isArray(sf.attachments)) return sf.attachments;
  return [];
}
function attachmentCount(n) { return noteAttachments(n).length; }
function noteTypeLabel(t) {
  return ({ session: 'Sessão', assessment: 'Avaliação', follow_up: 'Acompanhamento', discharge_note: 'Nota de alta' }[t])
    || fmt.humanize(t || 'session');
}

// ── Colunas das tabelas ─────────────────────────────────────────────────────────
const consultColumns = [
  { key: 'scheduled_at', label: 'Data e hora', sortable: true },
  { key: 'professional_id', label: 'Profissional' },
  { key: 'status', label: 'Situação' },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'amount_cents', label: 'Valor', align: 'right' },
];
const reportColumns = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'status', label: 'Situação' },
  { key: 'created_at', label: 'Solicitado em', sortable: true },
  { key: 'completed_at', label: 'Concluído em' },
  { key: 'error_message', label: 'Observação' },
];

// ── Carregamento ──────────────────────────────────────────────────────────────────
async function loadPatient() {
  loading.value = true; pageError.value = null;
  try {
    patient.value = await patientsApi.get(props.id);
  } catch (e) {
    pageError.value = e && e.status === 404
      ? 'Paciente não encontrado.'
      : (e.message || 'Falha ao carregar o paciente.');
  } finally {
    loading.value = false;
  }
}
async function loadNotes() {
  notesLoading.value = true; notesError.value = null;
  try {
    const r = await notesApi.value.list();
    notes.value = (r && r.data) || [];
  } catch (e) {
    notesError.value = e.message || 'Falha ao carregar as evoluções.';
  } finally {
    notesLoading.value = false;
  }
}
async function loadConsultations() {
  consultLoading.value = true; consultError.value = null;
  try {
    const r = await consultationsApi.list({ patient_id: props.id });
    consultationRows.value = (r && r.data) || [];
  } catch (e) {
    consultError.value = e.message || 'Falha ao carregar os agendamentos.';
  } finally {
    consultLoading.value = false;
  }
}
async function loadReports() {
  reportsLoading.value = true; reportsError.value = null;
  try {
    const r = await reportsApi.value.list();
    reports.value = (r && r.data) || [];
  } catch (e) {
    reportsError.value = e.message || 'Falha ao carregar os relatórios.';
  } finally {
    reportsLoading.value = false;
  }
}
async function loadProfessionals() {
  if (professionalRows.value.length && !profError.value) return;
  profLoading.value = true; profError.value = null;
  try {
    const r = await professionalsApi.list({ pageSize: 200 });
    professionalRows.value = (r && r.data) || [];
  } catch (e) {
    profError.value = e.message || 'Falha ao carregar os profissionais.';
  } finally {
    profLoading.value = false;
  }
}

// ── Ação: nova evolução ────────────────────────────────────────────────────────
const noteOpen = ref(false);
const noteForm = useForm({
  initial: { type: 'session', text: '' },
  rules: { text: [validators.required('Descreva a evolução.'), validators.minLen(3)] },
});
function openNewNote() { noteForm.reset(); noteOpen.value = true; }
function submitNote() {
  noteForm.handleSubmit(async (vals) => {
    try {
      await notesApi.value.create({ type: vals.type, text: vals.text });
      toast.success('Evolução registrada com sucesso.');
      noteOpen.value = false;
      await loadNotes();
      activeTab.value = 'timeline';
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar a evolução.');
    }
  });
}

// ── Ação: agendar consulta ─────────────────────────────────────────────────────
const scheduleOpen = ref(false);
const schedForm = useForm({
  initial: { professional_id: '', scheduled_at: '', duration_minutes: '60', amount: '' },
  rules: {
    professional_id: [validators.required('Selecione um profissional.')],
    scheduled_at: [validators.required('Informe a data e hora.')],
    amount: [validators.required('Informe o valor.'), validators.numeric(), validators.min(0)],
  },
});
watch(scheduleOpen, (open) => { if (open) { schedForm.reset(); loadProfessionals(); } });
function submitSchedule() {
  schedForm.handleSubmit(async (vals) => {
    const amountCents = Math.round((Number(vals.amount) || 0) * 100);
    const when = new Date(vals.scheduled_at);
    if (isNaN(when.getTime())) { schedForm.errors.scheduled_at = 'Data inválida.'; return; }
    try {
      await consultationsApi.schedule({
        patient_id: props.id,
        professional_id: vals.professional_id,
        scheduled_at: when.toISOString(),
        duration_minutes: Number(vals.duration_minutes) || 60,
        amount_cents: amountCents,
        currency: 'BRL',
      });
      toast.success('Consulta agendada com sucesso.');
      scheduleOpen.value = false;
      await loadConsultations();
      activeTab.value = 'schedule';
    } catch (e) {
      if (e && e.status === 409) { toast.error('Conflito de horário para este profissional.'); return; }
      toast.error(e.message || 'Não foi possível agendar a consulta.');
    }
  });
}

// ── Ação: gerar relatório (async 202) ─────────────────────────────────────────
const reportOpen = ref(false);
const reportForm = useForm({
  initial: { type: 'evolucao', date_from: '', date_to: '' },
  rules: { type: [validators.required('Selecione o tipo de relatório.')] },
});
function openReport() { reportForm.reset(); reportOpen.value = true; }
function submitReport() {
  reportForm.handleSubmit(async (vals) => {
    if (vals.date_from && vals.date_to && new Date(vals.date_from) > new Date(vals.date_to)) {
      reportForm.errors.date_to = 'A data final deve ser posterior à inicial.';
      return;
    }
    const body = { type: vals.type };
    if (vals.date_from) body.date_from = vals.date_from;
    if (vals.date_to) body.date_to = vals.date_to;
    try {
      await reportsApi.value.create(body);
      toast.success('Relatório solicitado. Processamento assíncrono — atualize em instantes.');
      reportOpen.value = false;
      await loadReports();
      activeTab.value = 'reports';
    } catch (e) {
      toast.error(e.message || 'Não foi possível solicitar o relatório.');
    }
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────────
function loadAll() {
  loadPatient();
  loadNotes();
  loadConsultations();
  loadReports();
  loadProfessionals(); // popula mapa id→nome (banner, timeline, tabela)
}
watch(() => props.id, loadAll);
onMounted(loadAll);
</script>

<style scoped>
/* ── Layout principal (main + sidebar) ──────────────────────────────────────── */
.pd-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ui-space-4);
  transition: grid-template-columns .2s ease;
}
.pd-layout[data-sidebar="open"] {
  grid-template-columns: 1fr max(var(--ui-space-80, 320px), 28%);
}
.pd-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* ── Banner cabeçalho do paciente ────────────────────────────────────────────── */
.pd-banner {
  display: flex; align-items: center; gap: var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4) var(--ui-space-5);
  box-shadow: var(--ui-shadow-sm);
  flex-wrap: wrap;
}
.pd-avatar-wrap { position: relative; flex-shrink: 0; }
.pd-avatar {
  width: var(--ui-space-16); height: var(--ui-space-16);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-weight: 800; font-size: 1.35rem;
  letter-spacing: .02em;
}
.pd-avatar-status {
  position: absolute; bottom: 2px; right: 2px;
  width: var(--ui-space-4); height: var(--ui-space-4); border-radius: 50%;
  border: 2px solid rgb(var(--ui-surface));
  background: rgb(var(--ui-muted));
}
.pd-avatar-status[data-status-tone="success"] { background: rgb(var(--ui-ok)); }
.pd-avatar-status[data-status-tone="error"] { background: rgb(var(--ui-danger)); }
.pd-avatar-status[data-status-tone="warning"] { background: rgb(var(--ui-warn)); }
.pd-avatar-status[data-status-tone="running"] { background: rgb(var(--ui-accent)); }

.pd-banner-main { flex: 1 1 max(var(--ui-space-60, 15rem), 30%); min-width: 0; }
.pd-banner-top { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; margin-bottom: var(--ui-space-2); }
.pd-banner-name { margin: 0; font-size: var(--ui-text-xl); font-weight: 700; }
.pd-banner-meta {
  display: flex; gap: var(--ui-space-2); flex-wrap: wrap;
  margin: 0;
}
.pd-meta-chip {
  display: inline-flex; align-items: center;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-3);
  font-size: var(--ui-text-xs); font-weight: 500;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}
.pd-meta-muted { color: rgb(var(--ui-muted)); }
.pd-banner-ref { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

.pd-banner-contacts { display: flex; flex-direction: column; gap: var(--ui-space-1); align-items: flex-end; flex-shrink: 0; }
.pd-contact {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-size: var(--ui-text-sm); font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  transition: background .12s ease;
}
.pd-contact:hover { background: rgb(var(--ui-accent) / 0.08); text-decoration: underline; }
.pd-contact:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.pd-contact-ic { font-size: .9rem; opacity: .75; }

/* ── Métricas ────────────────────────────────────────────────────────────────── */
.pd-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--ui-space-40, 10rem), 1fr)); gap: var(--ui-space-3); }

/* ── Abas ────────────────────────────────────────────────────────────────────── */
.pd-tabs {
  display: flex; gap: 0;
  border-bottom: 2px solid rgb(var(--ui-border));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.pd-tab {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  background: none; border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  color: rgb(var(--ui-muted));
  font: inherit; font-weight: 600; font-size: var(--ui-text-sm);
  padding: var(--ui-space-3) var(--ui-space-4);
  cursor: pointer; white-space: nowrap;
  transition: color .15s ease, border-color .15s ease;
}
.pd-tab:hover { color: rgb(var(--ui-fg)); }
.pd-tab[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent));
}
.pd-tab:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: -2px;
  border-radius: var(--ui-radius-sm);
}
.pd-tab-ic { font-size: 1rem; line-height: 1; }
.pd-tab-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: var(--ui-space-5); height: var(--ui-space-5); padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs); font-weight: 700;
}
.pd-tab[data-active="true"] .pd-tab-count {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}

.pd-pane { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* ── Dados cadastrais (dt/dd) ────────────────────────────────────────────────── */
.pd-kv {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-4); margin: 0;
}
.pd-kv-row { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.pd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .05em;
  font-weight: 600;
}
.pd-kv dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-md); overflow-wrap: anywhere; }
.pd-notes-title {
  margin: var(--ui-space-5) 0 var(--ui-space-2);
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  text-transform: uppercase; letter-spacing: .05em; font-weight: 600;
}
.pd-notes-body { margin: 0; white-space: pre-wrap; color: rgb(var(--ui-fg)); line-height: 1.6; }

/* ── Filtros da timeline ─────────────────────────────────────────────────────── */
.pd-timeline-filters {
  display: flex; align-items: center; gap: var(--ui-space-4); flex-wrap: wrap;
  padding: var(--ui-space-3) 0 var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  margin-bottom: var(--ui-space-2);
}
.pd-filter-group { display: flex; align-items: center; gap: var(--ui-space-2); }
.pd-filter-label { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); font-weight: 600; white-space: nowrap; }
.pd-filter-select {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  font: inherit; font-size: var(--ui-text-sm);
  padding: var(--ui-space-1) var(--ui-space-3);
  outline-offset: 2px;
}
.pd-filter-select:focus { outline: 2px solid rgb(var(--ui-accent)); }
.pd-filter-count { margin-left: auto; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ── Linha do tempo ──────────────────────────────────────────────────────────── */
.pd-timeline {
  list-style: none; margin: 0; padding: 0 0 0 var(--ui-space-5);
  position: relative;
  display: flex; flex-direction: column; gap: var(--ui-space-4);
}
.pd-timeline::before {
  content: "";
  position: absolute; left: 5px; top: 8px; bottom: 8px;
  width: 2px;
  background: linear-gradient(to bottom, rgb(var(--ui-accent) / 0.5), rgb(var(--ui-border)));
}
.pd-tl-item { position: relative; }
.pd-tl-dot {
  position: absolute;
  left: calc(-1 * var(--ui-space-5) + 2px); top: 8px;
  width: 10px; height: 10px; border-radius: 50%;
  background: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.18);
}
.pd-tl-dot[data-note-type="assessment"] { background: rgb(var(--ui-warn)); }
.pd-tl-dot[data-note-type="discharge_note"] { background: rgb(var(--ui-ok)); }
.pd-tl-card {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  transition: box-shadow .15s ease;
}
.pd-tl-card:hover { box-shadow: var(--ui-shadow-sm); }
.pd-tl-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--ui-space-2); flex-wrap: wrap;
}
.pd-tl-date { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); white-space: nowrap; }
.pd-tl-text { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-fg)); line-height: 1.55; white-space: pre-wrap; }
.pd-tl-foot {
  margin: var(--ui-space-2) 0 0;
  display: flex; gap: var(--ui-space-3);
  color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs);
  flex-wrap: wrap;
}
/* icon glyphs rendered in template (aria-hidden span) — no ::before needed */

/* ── Painel lateral — Assistente IA ─────────────────────────────────────────── */
.pd-sidebar {
  display: flex; flex-direction: column;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
  height: fit-content;
  position: sticky; top: var(--ui-space-5);
  max-height: calc(100vh - var(--ui-space-10, 80px));
}
.pd-sidebar-head {
  display: flex; align-items: center; gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-accent) / 0.06);
}
.pd-sidebar-title {
  font-weight: 700; font-size: var(--ui-text-sm);
  color: rgb(var(--ui-accent-strong));
}
.pd-sidebar-ctx {
  flex: 1; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pd-sidebar-close {
  background: none; border: none;
  color: rgb(var(--ui-muted)); cursor: pointer;
  font-size: 1rem; font: inherit;
  padding: var(--ui-space-1); border-radius: var(--ui-radius-sm);
  line-height: 1;
}
.pd-sidebar-close:hover { color: rgb(var(--ui-fg)); background: rgb(var(--ui-surface-2)); }
.pd-sidebar-close:focus-visible { outline: 2px solid rgb(var(--ui-accent)); }

/* chat log */
.pd-chat-log {
  flex: 1; overflow-y: auto;
  padding: var(--ui-space-4);
  display: flex; flex-direction: column; gap: var(--ui-space-3);
  min-height: 30vh; max-height: 45vh;
}
.pd-chat-empty { text-align: center; padding: var(--ui-space-4) 0; }
.pd-chat-empty-title { font-weight: 700; color: rgb(var(--ui-fg)); margin: 0 0 var(--ui-space-1); font-size: var(--ui-text-sm); }
.pd-chat-empty-sub { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); margin: 0 0 var(--ui-space-3); line-height: 1.5; }
.pd-chat-suggestions { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.pd-chat-suggestion {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-accent-strong));
  font: inherit; font-size: var(--ui-text-xs); font-weight: 500;
  padding: var(--ui-space-2) var(--ui-space-3);
  cursor: pointer; text-align: left;
  transition: background .12s ease, border-color .12s ease;
}
.pd-chat-suggestion:hover { background: rgb(var(--ui-accent) / 0.08); border-color: rgb(var(--ui-accent)); }
.pd-chat-suggestion:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.pd-chat-msg { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.pd-chat-msg[data-role="user"] { align-items: flex-end; }
.pd-chat-msg[data-role="assistant"] { align-items: flex-start; }
.pd-chat-msg-role {
  font-size: var(--ui-text-xs); font-weight: 700;
  color: rgb(var(--ui-muted)); padding: 0 var(--ui-space-1);
}
.pd-chat-msg-text {
  margin: 0; line-height: 1.55; font-size: var(--ui-text-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-3);
  max-width: 88%;
  white-space: pre-wrap;
}
.pd-chat-msg[data-role="user"] .pd-chat-msg-text {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent) / 0.25);
  color: rgb(var(--ui-fg));
}
.pd-chat-sources {
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  padding: 0 var(--ui-space-1);
}

/* typing dots */
.pd-chat-typing {
  display: flex; align-items: center; gap: var(--ui-space-1);
  padding: var(--ui-space-2) var(--ui-space-3);
}
.pd-chat-typing span {
  width: var(--ui-space-2); height: var(--ui-space-2); border-radius: 50%;
  background: rgb(var(--ui-accent));
  animation: pd-bounce 1.2s ease-in-out infinite;
}
.pd-chat-typing span:nth-child(2) { animation-delay: .2s; }
.pd-chat-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes pd-bounce {
  0%, 80%, 100% { transform: scale(.7); opacity: .5; }
  40% { transform: scale(1); opacity: 1; }
}

/* input área */
.pd-chat-input-wrap {
  border-top: 1px solid rgb(var(--ui-border));
  padding: var(--ui-space-3);
  display: flex; flex-direction: column; gap: var(--ui-space-2);
}
.pd-chat-form { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.pd-chat-textarea {
  width: 100%;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  font: inherit; font-size: var(--ui-text-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  resize: vertical; min-height: var(--ui-space-14);
  box-sizing: border-box;
}
.pd-chat-textarea:focus { outline: 2px solid rgb(var(--ui-accent)); border-color: transparent; }
.pd-chat-textarea:disabled { opacity: .6; cursor: not-allowed; }

/* ── Formulários (modais) ────────────────────────────────────────────────────── */
.pd-form { display: flex; flex-direction: column; }

/* ── Acessibilidade ────────────────────────────────────────────────────────────── */
.pd-sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* ── Responsivo ──────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pd-layout[data-sidebar="open"] { grid-template-columns: 1fr; }
  .pd-sidebar { position: static; max-height: 40vh; }
  .pd-kv { grid-template-columns: 1fr; }
  .pd-banner-contacts { align-items: flex-start; }
  .pd-banner { flex-direction: column; align-items: flex-start; }
  .pd-metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
