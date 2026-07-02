<template>
  <UiPageLayout
    title="Auditoria de Integrações"
    eyebrow="Administração"
    subtitle="Monitoramento e operações manuais dos gateways fiscais externos (SEFAZ, RFB, e-Social)."
    width="wide"
    :error="auditError"
    @retry="loadAudit"
  >
    <!-- ── ações do cabeçalho ── -->
    <template #actions>
      <UiButton variant="ghost" :loading="refreshingHealth" @click="loadHealth">
        Atualizar Status
      </UiButton>
      <UiButton variant="primary" :loading="refreshingAudit" @click="loadAudit">
        Recarregar Log
      </UiButton>
    </template>

    <!-- ── filtros ── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── cards de status dos gateways ── -->
    <section class="ga-health-section" aria-label="Status dos gateways fiscais">
      <h2 class="ga-section-title">Status dos Gateways</h2>
      <div
        v-if="healthError"
        class="ga-health-error-banner"
        role="alert"
        aria-live="assertive"
      >
        <span class="ga-health-error-icon" aria-hidden="true">⚠</span>
        <span class="ga-health-error-text">
          Falha ao carregar status dos gateways: {{ healthError.message || 'Erro desconhecido' }}
        </span>
        <button
          type="button"
          class="ga-health-error-dismiss"
          aria-label="Fechar aviso de erro"
          @click="healthError = null"
        >
          ×
        </button>
      </div>
      <div class="ga-health-grid">
        <!-- SEFAZ -->
        <div
          class="ga-health-card"
          :data-tone="gatewayTone(health.sefaz)"
          role="status"
          aria-label="Status do gateway SEFAZ"
        >
          <div class="ga-health-card-header">
            <span class="ga-health-icon" aria-hidden="true">
              <span class="ga-icon-nf" aria-hidden="true">NF</span>
            </span>
            <div class="ga-health-meta">
              <span class="ga-health-name">SEFAZ</span>
              <span class="ga-health-desc">Nota Fiscal Eletrônica</span>
            </div>
            <UiStatusBadge
              v-if="!healthLoading"
              :status="health.sefaz ? health.sefaz.status : 'unknown'"
              :label="health.sefaz ? (health.sefaz.status === 'ok' ? 'Online' : health.sefaz.status === 'degraded' ? 'Degradado' : 'Offline') : 'Desconhecido'"
              with-dot
            />
            <span v-else class="ga-badge-sk" aria-hidden="true" />
          </div>
          <dl class="ga-health-details">
            <div class="ga-health-row">
              <dt>Ambiente</dt>
              <dd>
                <span
                  class="ga-env-tag"
                  :data-env="health.sefaz ? health.sefaz.environment : ''"
                >{{ health.sefaz ? (health.sefaz.environment === 'sandbox' ? 'Sandbox' : 'Produção') : '—' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Certificado</dt>
              <dd>
                <span
                  class="ga-cert-tag"
                  :data-ok="health.sefaz && health.sefaz.certificate_configured ? 'true' : 'false'"
                >{{ health.sefaz && health.sefaz.certificate_configured ? 'Configurado' : 'Ausente' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Último check</dt>
              <dd>{{ health.sefaz ? format.formatDateTime(health.sefaz.checked_at) : '—' }}</dd>
            </div>
          </dl>
          <div class="ga-health-actions">
            <button
              type="button"
              class="ga-op-btn"
              aria-label="Consultar NF na SEFAZ"
              @click="openModal('consultar-nf')"
            >
              Consultar NF
            </button>
            <button
              type="button"
              class="ga-op-btn ga-op-btn--warn"
              aria-label="Inutilizar série na SEFAZ"
              @click="openModal('inutilizar-serie')"
            >
              Inutilizar Série
            </button>
          </div>
        </div>

        <!-- RFB -->
        <div
          class="ga-health-card"
          :data-tone="gatewayTone(health.rfb)"
          role="status"
          aria-label="Status do gateway RFB"
        >
          <div class="ga-health-card-header">
            <span class="ga-health-icon" aria-hidden="true">
              <span class="ga-icon-rfb" aria-hidden="true">RF</span>
            </span>
            <div class="ga-health-meta">
              <span class="ga-health-name">RFB</span>
              <span class="ga-health-desc">Receita Federal do Brasil</span>
            </div>
            <UiStatusBadge
              v-if="!healthLoading"
              :status="health.rfb ? health.rfb.status : 'unknown'"
              :label="health.rfb ? (health.rfb.status === 'ok' ? 'Online' : health.rfb.status === 'degraded' ? 'Degradado' : 'Offline') : 'Desconhecido'"
              with-dot
            />
            <span v-else class="ga-badge-sk" aria-hidden="true" />
          </div>
          <dl class="ga-health-details">
            <div class="ga-health-row">
              <dt>Ambiente</dt>
              <dd>
                <span
                  class="ga-env-tag"
                  :data-env="health.rfb ? health.rfb.environment : ''"
                >{{ health.rfb ? (health.rfb.environment === 'sandbox' ? 'Sandbox' : 'Produção') : '—' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Certificado</dt>
              <dd>
                <span
                  class="ga-cert-tag"
                  :data-ok="health.rfb && health.rfb.certificate_configured ? 'true' : 'false'"
                >{{ health.rfb && health.rfb.certificate_configured ? 'Configurado' : 'Ausente' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Último check</dt>
              <dd>{{ health.rfb ? format.formatDateTime(health.rfb.checked_at) : '—' }}</dd>
            </div>
          </dl>
          <div class="ga-health-actions">
            <button
              type="button"
              class="ga-op-btn"
              aria-label="Consultar CNPJ na RFB"
              @click="openModal('consultar-cnpj')"
            >
              Consultar CNPJ
            </button>
          </div>
        </div>

        <!-- e-Social -->
        <div
          class="ga-health-card"
          :data-tone="gatewayTone(health.esocial)"
          role="status"
          aria-label="Status do gateway e-Social"
        >
          <div class="ga-health-card-header">
            <span class="ga-health-icon" aria-hidden="true">
              <span class="ga-icon-esocial" aria-hidden="true">eS</span>
            </span>
            <div class="ga-health-meta">
              <span class="ga-health-name">e-Social</span>
              <span class="ga-health-desc">eSocial — Eventos trabalhistas</span>
            </div>
            <UiStatusBadge
              v-if="!healthLoading"
              :status="health.esocial ? health.esocial.status : 'unknown'"
              :label="health.esocial ? (health.esocial.status === 'ok' ? 'Online' : health.esocial.status === 'degraded' ? 'Degradado' : 'Offline') : 'Desconhecido'"
              with-dot
            />
            <span v-else class="ga-badge-sk" aria-hidden="true" />
          </div>
          <dl class="ga-health-details">
            <div class="ga-health-row">
              <dt>Ambiente</dt>
              <dd>
                <span
                  class="ga-env-tag"
                  :data-env="health.esocial ? health.esocial.environment : ''"
                >{{ health.esocial ? (health.esocial.environment === 'sandbox' ? 'Sandbox' : 'Produção') : '—' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Certificado</dt>
              <dd>
                <span
                  class="ga-cert-tag"
                  :data-ok="health.esocial && health.esocial.certificate_configured ? 'true' : 'false'"
                >{{ health.esocial && health.esocial.certificate_configured ? 'Configurado' : 'Ausente' }}</span>
              </dd>
            </div>
            <div class="ga-health-row">
              <dt>Último check</dt>
              <dd>{{ health.esocial ? format.formatDateTime(health.esocial.checked_at) : '—' }}</dd>
            </div>
          </dl>
          <div class="ga-health-actions">
            <button
              type="button"
              class="ga-op-btn"
              aria-label="Enviar evento ao e-Social"
              @click="openModal('enviar-esocial')"
            >
              Enviar Evento
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── KPI de auditoria ── -->
    <section class="ga-kpi-row" role="region" aria-label="Resumo do log de auditoria">
      <div class="ga-kpi-card ga-kpi-card--total" role="presentation">
        <span class="ga-kpi-count">{{ kpis.total }}</span>
        <span class="ga-kpi-label">Total de chamadas</span>
      </div>
      <div class="ga-kpi-card ga-kpi-card--ok" role="presentation">
        <span class="ga-kpi-count">{{ kpis.ok }}</span>
        <span class="ga-kpi-label">Sucesso (2xx)</span>
      </div>
      <div class="ga-kpi-card ga-kpi-card--error" role="presentation">
        <span class="ga-kpi-count">{{ kpis.errors }}</span>
        <span class="ga-kpi-label">Erros (4xx/5xx)</span>
      </div>
      <div class="ga-kpi-card ga-kpi-card--retry" role="presentation">
        <span class="ga-kpi-count">{{ kpis.retried }}</span>
        <span class="ga-kpi-label">Com retentativas</span>
      </div>
      <div class="ga-kpi-card ga-kpi-card--avg" role="presentation">
        <span class="ga-kpi-count">{{ kpis.avgMs }}<span class="ga-kpi-unit">ms</span></span>
        <span class="ga-kpi-label">Latência média</span>
      </div>
    </section>

    <!-- ── tabela de auditoria ── -->
    <UiCard title="Log de Chamadas" subtitle="Histórico completo das integrações com gateways externos.">
      <template #actions>
        <span class="ga-log-count" aria-live="polite">
          {{ r.total.value > 0 ? r.total.value + ' registro(s)' : '' }}
        </span>
      </template>
      <UiDataTable
        :columns="columns"
        :rows="r.items.value"
        :loading="r.loading.value"
        row-key="id"
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        density="compact"
        :empty="{ title: 'Nenhum registro de auditoria', description: 'Ainda não há chamadas registradas para os gateways fiscais com os filtros aplicados.' }"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @retry="loadAudit"
      >
        <!-- gateway badge -->
        <template #cell-gateway="{ value }">
          <span class="ga-gw-tag" :data-gw="value">{{ gwLabel(value) }}</span>
        </template>

        <!-- método HTTP -->
        <template #cell-method="{ value }">
          <span class="ga-method-tag" :data-method="value">{{ value || '—' }}</span>
        </template>

        <!-- endpoint truncado com tooltip -->
        <template #cell-endpoint="{ value }">
          <span class="ga-endpoint" :title="value || ''">{{ value || '—' }}</span>
        </template>

        <!-- status HTTP com tonalidade -->
        <template #cell-response_status="{ value }">
          <span
            class="ga-status-chip"
            :data-tone="httpTone(value)"
            :aria-label="'Status HTTP ' + (value || '—')"
          >{{ value || '—' }}</span>
        </template>

        <!-- duração com barra visual -->
        <template #cell-duration_ms="{ value }">
          <span class="ga-duration">
            <span
              class="ga-duration-bar"
              :data-level="durationLevel(value)"
              aria-hidden="true"
            />
            <span class="ga-duration-val">{{ value != null ? value + ' ms' : '—' }}</span>
          </span>
        </template>

        <!-- tentativas -->
        <template #cell-attempts="{ value }">
          <span
            class="ga-attempts"
            :data-retried="value != null && value > 1 ? 'true' : 'false'"
          >{{ value != null ? value : '—' }}</span>
        </template>

        <!-- erro -->
        <template #cell-error_code="{ value }">
          <span v-if="value" class="ga-error-code" :title="value">{{ value }}</span>
          <span v-else class="ga-muted">—</span>
        </template>

        <!-- data/hora -->
        <template #cell-created_at="{ value }">
          <span class="ga-datetime">{{ value ? format.formatDateTime(value) : '—' }}</span>
        </template>

        <!-- ação de ver detalhe -->
        <template #cell-_detail="{ row }">
          <button
            type="button"
            class="ga-detail-btn"
            :aria-label="'Ver detalhe da chamada ' + (row.id || '')"
            @click.stop="openDetail(row)"
          >
            Ver
          </button>
        </template>

        <!-- empty-action -->
        <template #empty-action>
          <UiButton variant="ghost" @click="clearFilters">
            Limpar filtros
          </UiButton>
        </template>
      </UiDataTable>
    </UiCard>
  </UiPageLayout>

  <!-- ── modal: detalhe de chamada ── -->
  <UiModal
    :open="modalDetail.open"
    title="Detalhe da Chamada"
    width="lg"
    @update:open="modalDetail.open = false"
  >
    <dl v-if="modalDetail.row" class="ga-detail-dl">
      <div class="ga-detail-row">
        <dt>Gateway</dt>
        <dd><span class="ga-gw-tag" :data-gw="modalDetail.row.gateway">{{ gwLabel(modalDetail.row.gateway) }}</span></dd>
      </div>
      <div class="ga-detail-row">
        <dt>Método</dt>
        <dd><span class="ga-method-tag" :data-method="modalDetail.row.method">{{ modalDetail.row.method || '—' }}</span></dd>
      </div>
      <div class="ga-detail-row ga-detail-row--full">
        <dt>Endpoint</dt>
        <dd class="ga-detail-endpoint">{{ modalDetail.row.endpoint || '—' }}</dd>
      </div>
      <div class="ga-detail-row">
        <dt>Status HTTP</dt>
        <dd><span class="ga-status-chip" :data-tone="httpTone(modalDetail.row.response_status)">{{ modalDetail.row.response_status || '—' }}</span></dd>
      </div>
      <div class="ga-detail-row">
        <dt>Duração</dt>
        <dd>{{ modalDetail.row.duration_ms != null ? modalDetail.row.duration_ms + ' ms' : '—' }}</dd>
      </div>
      <div class="ga-detail-row">
        <dt>Tentativas</dt>
        <dd>{{ modalDetail.row.attempts != null ? modalDetail.row.attempts : '—' }}</dd>
      </div>
      <div class="ga-detail-row ga-detail-row--full">
        <dt>Código de erro</dt>
        <dd>{{ modalDetail.row.error_code || '—' }}</dd>
      </div>
      <div class="ga-detail-row">
        <dt>Data/Hora</dt>
        <dd>{{ format.formatDateTime(modalDetail.row.created_at) }}</dd>
      </div>
    </dl>
    <template #footer>
      <UiButton variant="ghost" @click="modalDetail.open = false">Fechar</UiButton>
    </template>
  </UiModal>

  <!-- ── modal: consultar NF na SEFAZ ── -->
  <UiModal
    :open="modals.consultarNf"
    title="Consultar NF na SEFAZ"
    width="md"
    @update:open="modals.consultarNf = false"
  >
    <UiFormField label="Chave de Acesso da NF-e" required :error="nfForm.errors.chave_acesso">
      <template #default="{ id, describedBy }">
        <input
          :id="id"
          :aria-describedby="describedBy"
          :value="nfForm.values.chave_acesso"
          type="text"
          placeholder="44 dígitos da chave de acesso"
          maxlength="44"
          :aria-invalid="!!nfForm.errors.chave_acesso"
          @input="nfForm.setField('chave_acesso', $event.target.value)"
        />
      </template>
    </UiFormField>
    <div v-if="opResult.consultarNf" class="ga-op-result" :data-ok="opResult.consultarNf.ok ? 'true' : 'false'">
      <pre class="ga-op-pre">{{ opResult.consultarNf.body }}</pre>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="modals.consultarNf = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="opLoading.consultarNf" @click="submitConsultarNf">
        Consultar
      </UiButton>
    </template>
  </UiModal>

  <!-- ── modal: inutilizar série ── -->
  <UiModal
    :open="modals.inutilizarSerie"
    title="Inutilizar Série na SEFAZ"
    width="md"
    @update:open="modals.inutilizarSerie = false"
  >
    <div class="ga-warn-banner" role="alert">
      Esta operação inutiliza uma faixa de numeração de NF na SEFAZ. Confirme os dados antes de prosseguir.
    </div>
    <div class="ga-form-grid">
      <UiFormField label="CNPJ do Emitente" required :error="serieForm.errors.cnpj">
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.cnpj"
            type="text"
            placeholder="00.000.000/0001-00"
            maxlength="18"
            :aria-invalid="!!serieForm.errors.cnpj"
            @input="serieForm.setField('cnpj', $event.target.value)"
          />
        </template>
      </UiFormField>
      <UiFormField label="Modelo" required :error="serieForm.errors.modelo">
        <template #default="{ id, describedBy }">
          <select
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.modelo"
            :aria-invalid="!!serieForm.errors.modelo"
            @change="serieForm.setField('modelo', $event.target.value)"
          >
            <option value="">Selecione</option>
            <option value="55">55 - NF-e</option>
            <option value="65">65 - NFC-e</option>
          </select>
        </template>
      </UiFormField>
      <UiFormField label="Série" required :error="serieForm.errors.serie">
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.serie"
            type="number"
            min="1"
            max="999"
            placeholder="001"
            :aria-invalid="!!serieForm.errors.serie"
            @input="serieForm.setField('serie', $event.target.value)"
          />
        </template>
      </UiFormField>
      <UiFormField label="Nro Inicial" required :error="serieForm.errors.nro_ini">
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.nro_ini"
            type="number"
            min="1"
            placeholder="1"
            :aria-invalid="!!serieForm.errors.nro_ini"
            @input="serieForm.setField('nro_ini', $event.target.value)"
          />
        </template>
      </UiFormField>
      <UiFormField label="Nro Final" required :error="serieForm.errors.nro_fin">
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.nro_fin"
            type="number"
            min="1"
            placeholder="1"
            :aria-invalid="!!serieForm.errors.nro_fin"
            @input="serieForm.setField('nro_fin', $event.target.value)"
          />
        </template>
      </UiFormField>
      <UiFormField label="Justificativa" required :error="serieForm.errors.justificativa" :full-width="true">
        <template #default="{ id, describedBy }">
          <textarea
            :id="id"
            :aria-describedby="describedBy"
            :value="serieForm.values.justificativa"
            placeholder="Mínimo 15 caracteres"
            maxlength="255"
            :aria-invalid="!!serieForm.errors.justificativa"
            @input="serieForm.setField('justificativa', $event.target.value)"
          />
        </template>
      </UiFormField>
    </div>
    <div v-if="opResult.inutilizarSerie" class="ga-op-result" :data-ok="opResult.inutilizarSerie.ok ? 'true' : 'false'">
      <pre class="ga-op-pre">{{ opResult.inutilizarSerie.body }}</pre>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="modals.inutilizarSerie = false">Cancelar</UiButton>
      <UiButton variant="danger" :loading="opLoading.inutilizarSerie" @click="submitInutilizarSerie">
        Inutilizar Série
      </UiButton>
    </template>
  </UiModal>

  <!-- ── modal: consultar CNPJ na RFB ── -->
  <UiModal
    :open="modals.consultarCnpj"
    title="Consultar CNPJ na RFB"
    width="md"
    @update:open="modals.consultarCnpj = false"
  >
    <UiFormField label="CNPJ" required :error="cnpjForm.errors.cnpj">
      <template #default="{ id, describedBy }">
        <input
          :id="id"
          :aria-describedby="describedBy"
          :value="cnpjForm.values.cnpj"
          type="text"
          placeholder="00.000.000/0001-00"
          maxlength="18"
          :aria-invalid="!!cnpjForm.errors.cnpj"
          @input="cnpjForm.setField('cnpj', $event.target.value)"
        />
      </template>
    </UiFormField>
    <div v-if="opResult.consultarCnpj" class="ga-op-result" :data-ok="opResult.consultarCnpj.ok ? 'true' : 'false'">
      <pre class="ga-op-pre">{{ opResult.consultarCnpj.body }}</pre>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="modals.consultarCnpj = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="opLoading.consultarCnpj" @click="submitConsultarCnpj">
        Consultar
      </UiButton>
    </template>
  </UiModal>

  <!-- ── modal: enviar evento e-Social ── -->
  <UiModal
    :open="modals.enviarEsocial"
    title="Enviar Evento e-Social"
    width="md"
    @update:open="modals.enviarEsocial = false"
  >
    <div class="ga-form-grid">
      <UiFormField label="Tipo de Evento" required :error="esocialForm.errors.tipo_evento">
        <template #default="{ id, describedBy }">
          <select
            :id="id"
            :aria-describedby="describedBy"
            :value="esocialForm.values.tipo_evento"
            :aria-invalid="!!esocialForm.errors.tipo_evento"
            @change="esocialForm.setField('tipo_evento', $event.target.value)"
          >
            <option value="">Selecione o tipo</option>
            <option value="S-1000">S-1000 — Informações do Empregador</option>
            <option value="S-1200">S-1200 — Remuneração de Trabalhador</option>
            <option value="S-2200">S-2200 — Cadastramento Inicial do Vínculo</option>
            <option value="S-2206">S-2206 — Alteração de Contrato</option>
            <option value="S-2299">S-2299 — Desligamento</option>
            <option value="S-2400">S-2400 — Cadastro de Benefício</option>
            <option value="S-2500">S-2500 — Processo Trabalhista</option>
            <option value="S-3000">S-3000 — Exclusão de Eventos</option>
          </select>
        </template>
      </UiFormField>
      <UiFormField label="Referência (AAAA-MM)" required :error="esocialForm.errors.referencia">
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :aria-describedby="describedBy"
            :value="esocialForm.values.referencia"
            type="text"
            placeholder="2024-01"
            maxlength="7"
            :aria-invalid="!!esocialForm.errors.referencia"
            @input="esocialForm.setField('referencia', $event.target.value)"
          />
        </template>
      </UiFormField>
      <UiFormField label="Payload XML (simplificado)" :full-width="true" :error="esocialForm.errors.payload">
        <template #default="{ id, describedBy }">
          <textarea
            :id="id"
            :aria-describedby="describedBy"
            :value="esocialForm.values.payload"
            placeholder="Conteúdo XML do evento (opcional — o backend usa template padrão se omitido)"
            :aria-invalid="!!esocialForm.errors.payload"
            @input="esocialForm.setField('payload', $event.target.value)"
          />
        </template>
      </UiFormField>
    </div>
    <div v-if="opResult.enviarEsocial" class="ga-op-result" :data-ok="opResult.enviarEsocial.ok ? 'true' : 'false'">
      <pre class="ga-op-pre">{{ opResult.enviarEsocial.body }}</pre>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="modals.enviarEsocial = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="opLoading.enviarEsocial" @click="submitEnviarEsocial">
        Enviar Evento
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  UiFormField,
  useResource,
  useToast,
  useConfirm,
  useForm,
  format,
  validators,
} from '../ui/index.js';
import {
  resourceFactory,
  gatewayHealth,
  sefazConsultar,
  sefazInutilizar,
  rfbCadastral,
  esocialEventos,
} from '../api.js';

// ─── recursos REST ─────────────────────────────────────────────────────────────
const gatewayAudit = resourceFactory('gateways/audit');
const r = useResource(gatewayAudit);

// ─── composables ───────────────────────────────────────────────────────────────
const toast = useToast();
const ask = useConfirm();

// ─── estado de saúde dos gateways ─────────────────────────────────────────────
const healthLoading = ref(false);
const healthError = ref(null);
const health = reactive({ sefaz: null, rfb: null, esocial: null });

async function loadHealth() {
  healthLoading.value = true;
  healthError.value = null;
  try {
    const data = await gatewayHealth();
    health.sefaz = data.sefaz || null;
    health.rfb = data.rfb || null;
    health.esocial = data.esocial || null;
  } catch (e) {
    healthError.value = e;
    toast.warning('Não foi possível carregar o status dos gateways: ' + (e.message || 'erro desconhecido'));
  } finally {
    healthLoading.value = false;
  }
}

// ─── controle de carregamento ─────────────────────────────────────────────────
const refreshingHealth = computed(() => healthLoading.value);
const refreshingAudit = computed(() => r.loading.value);
const auditError = computed(() => r.error.value ? (r.error.value.message || 'Erro ao carregar log de auditoria') : null);

async function loadAudit() {
  await r.load();
}

// ─── colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'gateway',         label: 'Gateway',       sortable: true },
  { key: 'method',          label: 'Método',        sortable: false },
  { key: 'endpoint',        label: 'Endpoint',      sortable: false },
  { key: 'response_status', label: 'Status HTTP',   sortable: true, align: 'center' },
  { key: 'duration_ms',     label: 'Duração',       sortable: true, align: 'right' },
  { key: 'attempts',        label: 'Tentativas',    sortable: true, align: 'center' },
  { key: 'error_code',      label: 'Erro',          sortable: false },
  { key: 'created_at',      label: 'Data/Hora',     sortable: true },
  { key: '_detail',         label: '',              align: 'right' },
];

// ─── filtros ──────────────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'gateway',
    label: 'Gateway',
    type: 'select',
    options: [
      { value: 'sefaz',      label: 'SEFAZ' },
      { value: 'rfb',        label: 'RFB' },
      { value: 'esocial',    label: 'e-Social' },
      { value: 'prefeitura', label: 'Prefeitura' },
    ],
  },
  {
    key: 'status_range',
    label: 'Resultado',
    type: 'select',
    options: [
      { value: '2xx', label: 'Sucesso (2xx)' },
      { value: '4xx', label: 'Erro cliente (4xx)' },
      { value: '5xx', label: 'Erro servidor (5xx)' },
    ],
  },
  { key: 'desde', label: 'Desde', type: 'date' },
  { key: 'ate',   label: 'Até',   type: 'date' },
];

const filters = ref({ gateway: '', status_range: '', desde: '', ate: '' });

function applyFilters() {
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  filters.value = { gateway: '', status_range: '', desde: '', ate: '' };
  r.setFilters({});
}

// ─── KPIs calculados a partir dos itens carregados ───────────────────────────
const kpis = computed(() => {
  const items = r.items.value || [];
  const total = items.length;
  const ok = items.filter((i) => i.response_status >= 200 && i.response_status < 300).length;
  const errors = items.filter((i) => i.response_status >= 400).length;
  const retried = items.filter((i) => i.attempts != null && i.attempts > 1).length;
  const durations = items.map((i) => i.duration_ms).filter((d) => d != null && isFinite(d));
  const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return { total, ok, errors, retried, avgMs };
});

// ─── helpers de formatação ────────────────────────────────────────────────────
function gwLabel(gw) {
  const labels = { sefaz: 'SEFAZ', rfb: 'RFB', esocial: 'e-Social', prefeitura: 'Prefeitura' };
  return labels[String(gw).toLowerCase()] || (gw || '—');
}

function httpTone(status) {
  const s = Number(status);
  if (!isFinite(s) || s === 0) return 'neutral';
  if (s >= 200 && s < 300) return 'success';
  if (s >= 300 && s < 400) return 'warning';
  if (s >= 400) return 'error';
  return 'neutral';
}

function durationLevel(ms) {
  const n = Number(ms);
  if (!isFinite(n)) return 'none';
  if (n < 500) return 'fast';
  if (n < 2000) return 'medium';
  return 'slow';
}

function gatewayTone(gw) {
  if (!gw) return 'neutral';
  if (gw.status === 'ok') return 'success';
  if (gw.status === 'degraded') return 'warning';
  return 'error';
}

// ─── modal de detalhe ─────────────────────────────────────────────────────────
const modalDetail = reactive({ open: false, row: null });
function openDetail(row) {
  modalDetail.row = row;
  modalDetail.open = true;
}

// ─── modais de operação ───────────────────────────────────────────────────────
const modals = reactive({
  consultarNf: false,
  inutilizarSerie: false,
  consultarCnpj: false,
  enviarEsocial: false,
});

const opLoading = reactive({
  consultarNf: false,
  inutilizarSerie: false,
  consultarCnpj: false,
  enviarEsocial: false,
});

const opResult = reactive({
  consultarNf: null,
  inutilizarSerie: null,
  consultarCnpj: null,
  enviarEsocial: null,
});

function openModal(which) {
  if (which === 'consultar-nf') {
    opResult.consultarNf = null;
    nfForm.reset();
    modals.consultarNf = true;
  } else if (which === 'inutilizar-serie') {
    opResult.inutilizarSerie = null;
    serieForm.reset();
    modals.inutilizarSerie = true;
  } else if (which === 'consultar-cnpj') {
    opResult.consultarCnpj = null;
    cnpjForm.reset();
    modals.consultarCnpj = true;
  } else if (which === 'enviar-esocial') {
    opResult.enviarEsocial = null;
    esocialForm.reset();
    modals.enviarEsocial = true;
  }
}

// ─── formulário: consultar NF ─────────────────────────────────────────────────
const nfForm = useForm({
  initial: { chave_acesso: '' },
  rules: {
    chave_acesso: [
      validators.required('Informe a chave de acesso'),
      validators.minLen(44, 'A chave de acesso tem 44 dígitos'),
    ],
  },
});

async function submitConsultarNf() {
  await nfForm.handleSubmit(async (values) => {
    opLoading.consultarNf = true;
    opResult.consultarNf = null;
    try {
      const data = await sefazConsultar({ chave_acesso: values.chave_acesso });
      opResult.consultarNf = { ok: true, body: JSON.stringify(data, null, 2) };
      toast.success('Consulta à SEFAZ realizada com sucesso.');
      r.load();
    } catch (e) {
      opResult.consultarNf = { ok: false, body: e.message || 'Erro de rede' };
      toast.error('Falha na consulta à SEFAZ: ' + (e.message || 'Tente novamente.'));
    } finally {
      opLoading.consultarNf = false;
    }
  });
}

// ─── formulário: inutilizar série ─────────────────────────────────────────────
const serieForm = useForm({
  initial: { cnpj: '', modelo: '', serie: '', nro_ini: '', nro_fin: '', justificativa: '' },
  rules: {
    cnpj:          [validators.required('Informe o CNPJ do emitente')],
    modelo:        [validators.required('Selecione o modelo')],
    serie:         [validators.required('Informe a série')],
    nro_ini:       [validators.required('Informe o número inicial')],
    nro_fin:       [validators.required('Informe o número final')],
    justificativa: [validators.required('Informe a justificativa'), validators.minLen(15, 'Mínimo 15 caracteres')],
  },
});

async function submitInutilizarSerie() {
  const confirmed = await ask({
    title: 'Inutilizar Série na SEFAZ',
    message: 'Esta operação não pode ser desfeita. Confirma a inutilização da faixa de numeração?',
    confirmLabel: 'Sim, inutilizar',
    danger: true,
  });
  if (!confirmed) return;

  await serieForm.handleSubmit(async (values) => {
    opLoading.inutilizarSerie = true;
    opResult.inutilizarSerie = null;
    try {
      const data = await sefazInutilizar({
        cnpj: values.cnpj,
        modelo: values.modelo,
        serie: Number(values.serie),
        nro_ini: Number(values.nro_ini),
        nro_fin: Number(values.nro_fin),
        justificativa: values.justificativa,
      });
      opResult.inutilizarSerie = { ok: true, body: JSON.stringify(data, null, 2) };
      toast.success('Série inutilizada com sucesso na SEFAZ.');
      r.load();
    } catch (e) {
      opResult.inutilizarSerie = { ok: false, body: e.message || 'Erro de rede' };
      toast.error('Falha ao inutilizar série: ' + (e.message || 'Tente novamente.'));
    } finally {
      opLoading.inutilizarSerie = false;
    }
  });
}

// ─── formulário: consultar CNPJ na RFB ───────────────────────────────────────
const cnpjForm = useForm({
  initial: { cnpj: '' },
  rules: {
    cnpj: [validators.required('Informe o CNPJ')],
  },
});

async function submitConsultarCnpj() {
  await cnpjForm.handleSubmit(async (values) => {
    opLoading.consultarCnpj = true;
    opResult.consultarCnpj = null;
    // limpa máscara para montar URL
    const cnpjRaw = String(values.cnpj).replace(/\D/g, '');
    try {
      const data = await rfbCadastral(cnpjRaw);
      opResult.consultarCnpj = { ok: true, body: JSON.stringify(data, null, 2) };
      toast.success('Consulta cadastral na RFB realizada com sucesso.');
      r.load();
    } catch (e) {
      opResult.consultarCnpj = { ok: false, body: e.message || 'Erro de rede' };
      toast.error('Falha na consulta RFB: ' + (e.message || 'Tente novamente.'));
    } finally {
      opLoading.consultarCnpj = false;
    }
  });
}

// ─── formulário: enviar evento e-Social ──────────────────────────────────────
const esocialForm = useForm({
  initial: { tipo_evento: '', referencia: '', payload: '' },
  rules: {
    tipo_evento: [validators.required('Selecione o tipo de evento')],
    referencia:  [validators.required('Informe a referência (AAAA-MM)')],
  },
});

async function submitEnviarEsocial() {
  await esocialForm.handleSubmit(async (values) => {
    opLoading.enviarEsocial = true;
    opResult.enviarEsocial = null;
    try {
      const body = {
        tipo_evento: values.tipo_evento,
        referencia: values.referencia,
      };
      if (values.payload && values.payload.trim()) body.payload = values.payload.trim();
      const data = await esocialEventos(body);
      opResult.enviarEsocial = { ok: true, body: JSON.stringify(data, null, 2) };
      toast.success('Evento e-Social enviado com sucesso.');
      r.load();
    } catch (e) {
      opResult.enviarEsocial = { ok: false, body: e.message || 'Erro de rede' };
      toast.error('Falha ao enviar evento e-Social: ' + (e.message || 'Tente novamente.'));
    } finally {
      opLoading.enviarEsocial = false;
    }
  });
}

// ─── init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadHealth();
  r.load();
});
</script>

<style scoped>
/* ── seção de saúde ── */
.ga-health-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.ga-section-title {
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  margin: 0;
}

.ga-health-error-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.07);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.ga-health-error-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.ga-health-error-text {
  flex: 1;
  min-width: 0;
}

.ga-health-error-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: rgb(var(--ui-danger));
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  border-radius: var(--ui-radius-sm);
  flex-shrink: 0;
  font-family: inherit;
  padding: 0;
  transition: background 0.12s;
}

.ga-health-error-dismiss:hover {
  background: rgb(var(--ui-danger) / 0.12);
}

.ga-health-error-dismiss:focus-visible {
  outline: 2px solid rgb(var(--ui-danger));
  outline-offset: 2px;
}

.ga-health-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

@media (max-width: 860px) {
  .ga-health-grid {
    grid-template-columns: 1fr;
  }
}

.ga-health-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
  transition: box-shadow 0.15s;
}

.ga-health-card[data-tone="success"] {
  border-left: 3px solid rgb(var(--ui-ok));
}

.ga-health-card[data-tone="warning"] {
  border-left: 3px solid rgb(var(--ui-warn));
}

.ga-health-card[data-tone="error"] {
  border-left: 3px solid rgb(var(--ui-danger));
}

.ga-health-card[data-tone="neutral"] {
  border-left: 3px solid rgb(var(--ui-border));
}

.ga-health-card-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.ga-health-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius-md);
  flex-shrink: 0;
  font-weight: 900;
  font-size: var(--ui-text-xs);
  letter-spacing: -0.03em;
}

.ga-icon-nf {
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.ga-icon-rfb {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.ga-icon-esocial {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.ga-health-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.ga-health-name {
  font-size: var(--ui-text-md);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  line-height: 1.2;
}

.ga-health-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ga-badge-sk {
  display: inline-block;
  width: 72px;
  height: 22px;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  flex-shrink: 0;
}

.ga-health-details {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-3);
  margin: 0;
}

.ga-health-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.ga-health-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ga-health-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}

.ga-env-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ga-env-tag[data-env="sandbox"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.ga-env-tag[data-env="production"],
.ga-env-tag[data-env="real"],
.ga-env-tag:not([data-env="sandbox"]):not([data-env=""]) {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.ga-env-tag[data-env=""] {
  background: rgb(var(--ui-muted) / 0.1);
  color: rgb(var(--ui-muted));
}

.ga-cert-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
}

.ga-cert-tag[data-ok="true"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.ga-cert-tag[data-ok="false"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
}

.ga-health-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-3);
}

.ga-op-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 5px 12px;
  cursor: pointer;
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.07);
  color: rgb(var(--ui-accent-strong));
  transition: background 0.12s, border-color 0.12s;
  font-family: inherit;
  outline: none;
  white-space: nowrap;
}

.ga-op-btn:hover {
  background: rgb(var(--ui-accent) / 0.16);
  border-color: rgb(var(--ui-accent) / 0.6);
}

.ga-op-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.ga-op-btn--warn {
  border-color: rgb(var(--ui-danger) / 0.3);
  background: rgb(var(--ui-danger) / 0.06);
  color: rgb(var(--ui-danger));
}

.ga-op-btn--warn:hover {
  background: rgb(var(--ui-danger) / 0.14);
  border-color: rgb(var(--ui-danger) / 0.55);
}

/* ── KPI cards de auditoria ── */
.ga-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-3);
}

@media (max-width: 860px) {
  .ga-kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 540px) {
  .ga-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.ga-kpi-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-3);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  text-align: center;
}

.ga-kpi-card--ok {
  border-bottom: 3px solid rgb(var(--ui-ok) / 0.4);
}

.ga-kpi-card--error {
  border-bottom: 3px solid rgb(var(--ui-danger) / 0.4);
}

.ga-kpi-card--retry {
  border-bottom: 3px solid rgb(var(--ui-warn) / 0.4);
}

.ga-kpi-card--avg {
  border-bottom: 3px solid rgb(var(--ui-accent) / 0.4);
}

.ga-kpi-count {
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: rgb(var(--ui-fg));
}

.ga-kpi-unit {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--ui-muted));
  margin-left: 2px;
}

.ga-kpi-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── contagem no header do card ── */
.ga-log-count {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── células da tabela ── */
.ga-gw-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
  white-space: nowrap;
}

.ga-gw-tag[data-gw="sefaz"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}

.ga-gw-tag[data-gw="rfb"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.ga-gw-tag[data-gw="esocial"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.ga-gw-tag[data-gw="prefeitura"] {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}

.ga-method-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  font-family: monospace;
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
}

.ga-method-tag[data-method="GET"] { color: rgb(var(--ui-ok)); background: rgb(var(--ui-ok) / 0.1); }
.ga-method-tag[data-method="POST"] { color: rgb(var(--ui-accent-strong)); background: rgb(var(--ui-accent) / 0.1); }
.ga-method-tag[data-method="PUT"] { color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.1); }
.ga-method-tag[data-method="DELETE"] { color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.1); }
.ga-method-tag[data-method="PATCH"] { color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.08); }

.ga-endpoint {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-text-xs);
  font-family: monospace;
  color: rgb(var(--ui-fg));
  vertical-align: middle;
}

.ga-status-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: var(--ui-radius-sm);
  padding: 3px 8px;
  letter-spacing: 0.03em;
}

.ga-status-chip[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.ga-status-chip[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.ga-status-chip[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
}

.ga-status-chip[data-tone="neutral"] {
  background: rgb(var(--ui-muted) / 0.1);
  color: rgb(var(--ui-muted));
}

.ga-duration {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  white-space: nowrap;
}

.ga-duration-bar {
  display: inline-block;
  width: 36px;
  height: 5px;
  border-radius: var(--ui-radius-pill);
  flex-shrink: 0;
}

.ga-duration-bar[data-level="fast"] { background: rgb(var(--ui-ok)); width: 12px; }
.ga-duration-bar[data-level="medium"] { background: rgb(var(--ui-warn)); width: 24px; }
.ga-duration-bar[data-level="slow"] { background: rgb(var(--ui-danger)); width: 36px; }
.ga-duration-bar[data-level="none"] { background: rgb(var(--ui-muted) / 0.2); width: 12px; }

.ga-duration-val {
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

.ga-attempts {
  display: inline-block;
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

.ga-attempts[data-retried="true"] {
  color: rgb(var(--ui-warn));
  font-weight: 700;
}

.ga-error-code {
  display: inline-block;
  font-family: monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.ga-muted { color: rgb(var(--ui-muted)); }

.ga-datetime {
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

.ga-detail-btn {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 3px 10px;
  cursor: pointer;
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  transition: background 0.12s, color 0.12s;
  font-family: inherit;
  outline: none;
}

.ga-detail-btn:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.ga-detail-btn:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* ── modal de detalhe ── */
.ga-detail-dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3) var(--ui-space-5);
  margin: 0;
}

.ga-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ga-detail-row--full {
  grid-column: 1 / -1;
}

.ga-detail-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}

.ga-detail-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

.ga-detail-endpoint {
  font-family: monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

/* ── modais de operação ── */
.ga-warn-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.07);
  border: 1px solid rgb(var(--ui-danger) / 0.25);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  margin-bottom: var(--ui-space-4);
}

.ga-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}

@media (max-width: 540px) {
  .ga-form-grid { grid-template-columns: 1fr; }
}

.ga-op-result {
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  overflow: auto;
  max-height: 240px;
}

.ga-op-result[data-ok="true"] {
  border-color: rgb(var(--ui-ok) / 0.35);
  background: rgb(var(--ui-ok) / 0.04);
}

.ga-op-result[data-ok="false"] {
  border-color: rgb(var(--ui-danger) / 0.35);
  background: rgb(var(--ui-danger) / 0.04);
}

.ga-op-pre {
  margin: 0;
  font-family: monospace;
  font-size: var(--ui-text-xs);
  white-space: pre-wrap;
  word-break: break-all;
  color: rgb(var(--ui-fg));
}
</style>
