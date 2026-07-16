<template>
  <UiPageLayout
    title="Novo Cliente NF"
    eyebrow="Notas Fiscais"
    subtitle="Preencha os dados do cliente para emissão de notas fiscais. Campos marcados com * são obrigatórios."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/nf-clients">Voltar à lista</UiButton>
    </template>

    <!-- Banner de auto-preenchimento RFB -->
    <template v-if="rfbStatus === 'ok'" #banner>
      <div class="rfb-banner" data-tone="success" role="status" aria-live="polite">
        <span class="rfb-banner-icon" aria-hidden="true">✓</span>
        <span>Dados obtidos da Receita Federal — confira e complete as informações abaixo.</span>
      </div>
    </template>

    <template v-else-if="rfbStatus === 'error'" #banner>
      <div class="rfb-banner" data-tone="danger" role="alert" aria-live="assertive">
        <span class="rfb-banner-icon" aria-hidden="true">✗</span>
        <span>{{ rfbError || 'Não foi possível consultar a Receita Federal. Preencha os campos manualmente.' }}</span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Identificação ── -->
      <UiCard title="Identificação" subtitle="Dados cadastrais do cliente perante a Receita Federal.">
        <UiFormSection :columns="2">

          <!-- CNPJ com máscara e consulta automática RFB -->
          <UiFormField
            label="CNPJ"
            :required="true"
            :error="f.errors.cnpj"
            hint="Digite o CNPJ para consulta automática na Receita Federal."
          >
            <template #default="{ id, describedBy }">
              <div class="cnpj-wrapper">
                <input
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="cnpjDisplay"
                  :data-state="cnpjInputState"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="18"
                  placeholder="00.000.000/0000-00"
                  @input="onCnpjInput"
                  @blur="onCnpjBlur"
                />
                <span v-if="rfbStatus === 'loading'" class="cnpj-spinner" aria-label="Consultando Receita Federal…" role="status" />
                <span v-else-if="rfbStatus === 'ok'" class="cnpj-badge" data-tone="success" aria-label="CNPJ válido e localizado">✓</span>
                <span v-else-if="rfbStatus === 'error'" class="cnpj-badge" data-tone="danger" aria-label="CNPJ não localizado">✗</span>
              </div>
            </template>
          </UiFormField>

          <!-- Razão Social -->
          <UiFormField label="Razão Social" :required="true" :error="f.errors.razao_social">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.razao_social"
                :data-loading="rfbStatus === 'loading' ? 'true' : null"
                type="text"
                autocomplete="organization"
                placeholder="Nome empresarial conforme registro na Receita Federal"
                @input="f.setField('razao_social', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Inscrição Estadual -->
          <UiFormField
            label="Inscrição Estadual"
            :error="f.errors.inscricao_estadual"
            hint="Opcional — deixe em branco se isento ou não contribuinte."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.inscricao_estadual"
                type="text"
                inputmode="numeric"
                placeholder="Ex.: 123.456.789.000"
                @input="f.setField('inscricao_estadual', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Inscrição Municipal -->
          <UiFormField
            label="Inscrição Municipal"
            :error="f.errors.inscricao_municipal"
            hint="Opcional — fornecida pela Prefeitura do município."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.inscricao_municipal"
                type="text"
                inputmode="numeric"
                placeholder="Ex.: 12345/001"
                @input="f.setField('inscricao_municipal', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Tipo de Cliente -->
          <UiFormField
            label="Tipo de Cliente"
            :error="f.errors.tipo_cliente"
            hint="Define o enquadramento fiscal para emissão da NF."
            :full-width="false"
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.tipo_cliente"
                @change="f.setField('tipo_cliente', $event.target.value)"
              >
                <option value="">Selecione o tipo…</option>
                <option value="empresa">Empresa</option>
                <option value="consumidor_final">Consumidor Final</option>
                <option value="orgao_publico">Órgão Público</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Endereço ── -->
      <UiCard title="Endereço" subtitle="Localização do cliente para emissão de documentos fiscais.">
        <UiFormSection :columns="1">

          <UiFormField
            label="Endereço"
            :error="f.errors.endereco"
            hint="Logradouro, número, complemento, bairro, cidade, UF e CEP."
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :data-loading="rfbStatus === 'loading' ? 'true' : null"
                rows="3"
                placeholder="Ex.: Av. Paulista, 1000, Sala 101 — Bela Vista — São Paulo/SP — CEP 01310-100"
                @input="f.setField('endereco', $event.target.value)"
              >{{ f.values.endereco }}</textarea>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Contato ── -->
      <UiCard title="Contato" subtitle="Informações de contato para comunicação e envio de notas fiscais.">
        <UiFormSection :columns="1">

          <UiFormField
            label="Contato"
            :error="f.errors.contato"
            hint="Pessoa responsável, telefone, e-mail — um contato por linha."
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                rows="3"
                placeholder="Ex.: João Silva&#10;(11) 91234-5678&#10;joao.silva@empresa.com.br"
                @input="f.setField('contato', $event.target.value)"
              >{{ f.values.contato }}</textarea>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Ações ── -->
      <div class="form-footer">
        <UiButton
          variant="ghost"
          type="button"
          :disabled="f.submitting.value"
          @click="cancel"
        >
          Cancelar
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="f.submitting.value"
          :disabled="rfbStatus === 'loading'"
        >
          Cadastrar Cliente
        </UiButton>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ── API ───────────────────────────────────────────────────────────────────────
const nfClientsApi = resourceFactory('nf-clients');

async function fetchRfbCadastral(cnpjDigits) {
  const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';
  const res = await fetch(BASE + '/v1/gateways/rfb/cadastral/' + cnpjDigits, {
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.error && data.error.message) || 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return data;
}

// ── Router & Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado da consulta RFB: idle | loading | ok | error ──────────────────────
const rfbStatus = ref('idle');
const rfbError = ref('');

// ── Formulário ────────────────────────────────────────────────────────────────
const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

const f = useForm({
  initial: {
    cnpj: '',
    razao_social: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    tipo_cliente: '',
    endereco: '',
    contato: '',
  },
  rules: {
    cnpj: [
      validators.required('CNPJ é obrigatório'),
      validators.pattern(CNPJ_REGEX, 'CNPJ inválido — use o formato 00.000.000/0000-00'),
    ],
    razao_social: [
      validators.required('Razão Social é obrigatória'),
      validators.minLen(2, 'Razão Social deve ter ao menos 2 caracteres'),
    ],
  },
});

// ── Máscara CNPJ ──────────────────────────────────────────────────────────────
function maskCnpj(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return d.slice(0, 2) + '.' + d.slice(2);
  if (d.length <= 8) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5);
  if (d.length <= 12) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
}

const cnpjDisplay = computed(() => maskCnpj(f.values.cnpj));

const cnpjInputState = computed(() => {
  if (rfbStatus.value === 'loading') return 'loading';
  if (rfbStatus.value === 'ok') return 'success';
  if (rfbStatus.value === 'error') return 'error';
  return 'idle';
});

// ── Consulta RFB com debounce ─────────────────────────────────────────────────
let rfbTimer = null;

async function consultRfb(digits) {
  if (digits.length !== 14) return;
  rfbStatus.value = 'loading';
  rfbError.value = '';
  try {
    const data = await fetchRfbCadastral(digits);
    // Preenche campos automaticamente com dados da RFB
    if (data.razao_social) f.values.razao_social = data.razao_social;
    if (data.endereco) f.values.endereco = data.endereco;
    if (data.situacao && data.situacao !== 'ATIVA') {
      toast.warning('CNPJ com situação cadastral: ' + data.situacao);
    }
    rfbStatus.value = 'ok';
    toast.success('Dados da Receita Federal preenchidos automaticamente.');
  } catch (e) {
    rfbStatus.value = 'error';
    rfbError.value = e.status === 404
      ? 'CNPJ não encontrado na Receita Federal. Preencha os campos manualmente.'
      : 'Falha ao consultar RFB: ' + e.message;
    if (e.status === 404) {
      toast.error('CNPJ não encontrado na base da Receita Federal.');
    } else {
      toast.error('Falha ao consultar a Receita Federal: ' + e.message);
    }
  }
}

function onCnpjInput(evt) {
  const raw = evt.target.value.replace(/\D/g, '').slice(0, 14);
  const masked = maskCnpj(raw);
  f.setField('cnpj', masked);
  evt.target.value = masked;

  if (rfbStatus.value !== 'idle') rfbStatus.value = 'idle';

  clearTimeout(rfbTimer);
  if (raw.length === 14) {
    rfbTimer = setTimeout(() => consultRfb(raw), 600);
  }
}

function onCnpjBlur() {
  f.validateField('cnpj');
  const raw = f.values.cnpj.replace(/\D/g, '');
  if (raw.length === 14 && rfbStatus.value === 'idle') {
    consultRfb(raw);
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  f.handleSubmit(async (vals) => {
    try {
      const result = await nfClientsApi.create(vals);
      const id = result.id || (result.data && result.data.id);
      toast.success('Cliente cadastrado com sucesso!');
      if (id) {
        router.push('/nf-clients/' + id);
      } else {
        router.push('/nf-clients');
      }
    } catch (e) {
      toast.error('Erro ao cadastrar cliente: ' + e.message);
    }
  });
}

function cancel() {
  router.push('/nf-clients');
}
</script>

<style scoped>
/* ── Formulário ── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Footer de ações ── */
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── Banner de status RFB ── */
.rfb-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 500;
  line-height: 1.5;
}

.rfb-banner[data-tone="success"] {
  background: rgb(var(--ui-success) / 0.1);
  color: rgb(var(--ui-success));
  border: 1px solid rgb(var(--ui-success) / 0.25);
}

.rfb-banner[data-tone="danger"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
  border: 1px solid rgb(var(--ui-danger) / 0.25);
}

.rfb-banner-icon {
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ── Wrapper do CNPJ com indicador RFB ── */
.cnpj-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.cnpj-wrapper input {
  padding-right: 2.4rem;
}

/* Spinner de consulta RFB */
.cnpj-spinner {
  position: absolute;
  right: 10px;
  width: 16px;
  height: 16px;
  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent-strong));
  border-radius: 50%;
  animation: ui-spin 0.7s linear infinite;
  flex-shrink: 0;
  pointer-events: none;
}

/* Badge de resultado RFB */
.cnpj-badge {
  position: absolute;
  right: 10px;
  font-size: var(--ui-text-sm);
  font-weight: 700;
  flex-shrink: 0;
  pointer-events: none;
  line-height: 1;
}

.cnpj-badge[data-tone="success"] {
  color: rgb(var(--ui-success));
}

.cnpj-badge[data-tone="danger"] {
  color: rgb(var(--ui-danger));
}

/* Estado visual do input de CNPJ via data-state (sem style inline) */
.cnpj-wrapper input[data-state="success"] {
  border-color: rgb(var(--ui-success));
  outline-color: rgb(var(--ui-success) / 0.3);
}

.cnpj-wrapper input[data-state="error"] {
  border-color: rgb(var(--ui-danger));
  outline-color: rgb(var(--ui-danger) / 0.3);
}

.cnpj-wrapper input[data-state="loading"] {
  border-color: rgb(var(--ui-accent-strong));
}

/* Campos preenchidos automaticamente: leve opacidade durante o carregamento */
input[data-loading="true"],
textarea[data-loading="true"] {
  opacity: 0.55;
  pointer-events: none;
}

@keyframes ui-spin {
  to { transform: rotate(360deg); }
}

/* ── Responsivo ── */
@media (max-width: 860px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .form-footer > * {
    width: 100%;
  }
}
</style>
