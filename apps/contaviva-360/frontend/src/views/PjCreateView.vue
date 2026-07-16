<template>
  <UiPageLayout
    title="Nova Pessoa Jurídica"
    eyebrow="Cadastro"
    subtitle="Preencha os dados da empresa. Campos marcados com * são obrigatórios."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/pj">Voltar à lista</UiButton>
    </template>

    <!-- Banner de sucesso pós-consulta RFB ou erro de submit persistente -->
    <template #banner>
      <!-- Erro persistente de submit -->
      <div
        v-if="submitError"
        class="rfb-banner"
        data-tone="danger"
        role="alert"
        aria-live="assertive"
      >
        <span class="rfb-banner-icon" aria-hidden="true">✗</span>
        <span>{{ submitError }}</span>
      </div>
      <!-- Sucesso da consulta RFB -->
      <div
        v-else-if="rfbStatus === 'ok'"
        class="rfb-banner"
        data-tone="success"
        role="status"
        aria-live="polite"
      >
        <span class="rfb-banner-icon" aria-hidden="true">✓</span>
        <span>Dados obtidos da Receita Federal — confira e complete as informações abaixo.</span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Identificação ── -->
      <UiCard title="Identificação" subtitle="Dados cadastrais principais da empresa.">
        <UiFormSection :columns="2">

          <!-- CNPJ com máscara e consulta RFB -->
          <UiFormField
            label="CNPJ"
            :required="true"
            :error="f.errors.cnpj"
            hint="Digite o CNPJ para consultar automaticamente na RFB."
          >
            <template #default="{ id, describedBy }">
              <div class="cnpj-wrapper">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="cnpjDisplay"
                  :error="f.errors.cnpj"
                  :required="true"
                  :data-state="cnpjInputState"
                  inputmode="numeric"
                  autocomplete="off"
                  placeholder="00.000.000/0000-00"
                  @update:model-value="onCnpjInput"
                  @change="onCnpjBlur"
                />
                <span v-if="rfbStatus === 'loading'" class="cnpj-spinner" aria-label="Consultando RFB…" role="status" />
                <span v-else-if="rfbStatus === 'ok'" class="cnpj-badge" data-tone="success" aria-label="CNPJ válido">✓</span>
                <span v-else-if="rfbStatus === 'error'" class="cnpj-badge" data-tone="danger" aria-label="CNPJ não encontrado">✗</span>
              </div>
            </template>
          </UiFormField>

          <!-- Razão Social -->
          <UiFormField label="Razão Social" :required="true" :error="f.errors.razao_social">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.razao_social"
                :error="f.errors.razao_social"
                :required="true"
                :data-loading="rfbStatus === 'loading' ? 'true' : null"
                type="text"
                autocomplete="organization"
                placeholder="Nome empresarial conforme registro"
                @update:model-value="f.setField('razao_social', $event)"
              />
            </template>
          </UiFormField>

          <!-- Inscrição Estadual -->
          <UiFormField label="Inscrição Estadual" :error="f.errors.inscricao_estadual" hint="Opcional — deixe em branco se isento.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_estadual"
                :error="f.errors.inscricao_estadual"
                type="text"
                placeholder="Ex.: 123.456.789.000"
                @update:model-value="f.setField('inscricao_estadual', $event)"
              />
            </template>
          </UiFormField>

          <!-- Inscrição Municipal -->
          <UiFormField label="Inscrição Municipal" :error="f.errors.inscricao_municipal" hint="Opcional — preenchida pela Prefeitura.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_municipal"
                :error="f.errors.inscricao_municipal"
                type="text"
                placeholder="Ex.: 12345/001"
                @update:model-value="f.setField('inscricao_municipal', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Atividade Fiscal ── -->
      <UiCard title="Atividade Fiscal" subtitle="Regime tributário e código de atividade econômica.">
        <UiFormSection :columns="2">

          <!-- Regime Tributário — não há UiSelect no kit; aria-* aplicados manualmente -->
          <UiFormField label="Regime Tributário" :required="true" :error="f.errors.regime_tributario">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-required="true"
                :aria-invalid="!!f.errors.regime_tributario || undefined"
                :value="f.values.regime_tributario"
                @change="f.setField('regime_tributario', $event.target.value)"
              >
                <option value="">Selecione o regime…</option>
                <option value="simples">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
              </select>
            </template>
          </UiFormField>

          <!-- CNAE -->
          <UiFormField
            label="CNAE Principal"
            :error="f.errors.cnae"
            hint="Código de Atividade Econômica — preenchido automaticamente via RFB."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.cnae"
                :error="f.errors.cnae"
                :data-loading="rfbStatus === 'loading' ? 'true' : null"
                type="text"
                inputmode="numeric"
                placeholder="Ex.: 6201-5/01"
                @update:model-value="f.setField('cnae', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Dados Bancários ── -->
      <UiCard title="Dados Bancários" subtitle="Informe a conta para cobrança e repasses fiscais.">
        <UiFormSection :columns="3">

          <!-- Banco — opcional, sem regra obrigatória -->
          <UiFormField label="Banco" :error="f.errors.banco" hint="Nome ou código do banco.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.banco"
                :error="f.errors.banco"
                type="text"
                placeholder="Ex.: Itaú / 341"
                @update:model-value="f.setField('banco', $event)"
              />
            </template>
          </UiFormField>

          <!-- Agência — opcional, máximo 10 caracteres -->
          <UiFormField label="Agência" :error="f.errors.agencia" hint="Com ou sem dígito verificador.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.agencia"
                :error="f.errors.agencia"
                type="text"
                inputmode="numeric"
                placeholder="Ex.: 0001-5"
                @update:model-value="f.setField('agencia', $event)"
              />
            </template>
          </UiFormField>

          <!-- Conta — opcional, máximo 15 caracteres -->
          <UiFormField label="Conta" :error="f.errors.conta" hint="Número da conta com dígito.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.conta"
                :error="f.errors.conta"
                type="text"
                inputmode="numeric"
                placeholder="Ex.: 12345-6"
                @update:model-value="f.setField('conta', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Ações ── -->
      <div class="form-footer">
        <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
          Cancelar
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="f.submitting.value"
          :disabled="rfbStatus === 'loading'"
        >
          Cadastrar Empresa
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
  UiInput,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ── API ──────────────────────────────────────────────────────────────────────
const pjApi = resourceFactory('pj');

const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';

async function fetchRfbCadastral(cnpjDigits) {
  const res = await fetch(`${BASE}/v1/gateways/rfb/cadastral/${cnpjDigits}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

// ── Router & Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── CNPJ state ────────────────────────────────────────────────────────────────
// rfbStatus: idle | loading | ok | error
const rfbStatus = ref('idle');
const rfbError = ref('');

// ── Submit error (persistente no banner) ──────────────────────────────────────
const submitError = ref('');

// ── Form ──────────────────────────────────────────────────────────────────────
const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

const f = useForm({
  initial: {
    cnpj: '',
    razao_social: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    regime_tributario: '',
    cnae: '',
    banco: '',
    agencia: '',
    conta: '',
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
    // Regime tributário é obrigatório — campo fiscal de PJ não pode ser enviado vazio
    regime_tributario: [
      validators.required('Regime Tributário é obrigatório'),
    ],
    // Campos bancários são opcionais; maxLen protege contra payloads malformados
    banco: [validators.maxLen(100, 'Banco: máximo 100 caracteres')],
    agencia: [validators.maxLen(10, 'Agência: máximo 10 caracteres')],
    conta: [validators.maxLen(15, 'Conta: máximo 15 caracteres')],
  },
});

// ── CNPJ mask helpers ─────────────────────────────────────────────────────────
function maskCnpj(digits) {
  const d = digits.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const cnpjDisplay = computed(() => maskCnpj(f.values.cnpj));

const cnpjInputState = computed(() => {
  if (rfbStatus.value === 'loading') return 'loading';
  if (rfbStatus.value === 'ok') return 'success';
  if (rfbStatus.value === 'error') return 'error';
  return 'idle';
});

// ── RFB consultation ──────────────────────────────────────────────────────────
let rfbDebounceTimer = null;

async function consultRfb(digits) {
  if (digits.length !== 14) return;
  rfbStatus.value = 'loading';
  rfbError.value = '';
  try {
    const data = await fetchRfbCadastral(digits);
    // Usa f.setField para que campos já com erro tenham o erro limpo ao receber dados da RFB
    if (data.razao_social) f.setField('razao_social', data.razao_social);
    if (data.cnae_principal) f.setField('cnae', data.cnae_principal);
    if (data.situacao && data.situacao !== 'ATIVA') {
      toast.warning(`CNPJ com situação cadastral: ${data.situacao}`);
    }
    rfbStatus.value = 'ok';
    toast.success('Dados obtidos da Receita Federal com sucesso.');
  } catch (e) {
    rfbStatus.value = 'error';
    rfbError.value = e.message;
    if (e.status === 404) {
      toast.error('CNPJ não encontrado na base da Receita Federal.');
    } else {
      toast.error(`Falha ao consultar RFB: ${e.message}`);
    }
  }
}

// onCnpjInput recebe a string do modelo (UiInput emite update:modelValue com string)
function onCnpjInput(val) {
  const raw = String(val).replace(/\D/g, '').slice(0, 14);
  f.setField('cnpj', maskCnpj(raw));

  // Reseta status se o CNPJ mudou
  if (rfbStatus.value !== 'idle') rfbStatus.value = 'idle';

  // Debounce da consulta RFB: dispara apenas com 14 dígitos
  clearTimeout(rfbDebounceTimer);
  if (raw.length === 14) {
    rfbDebounceTimer = setTimeout(() => consultRfb(raw), 600);
  }
}

function onCnpjBlur() {
  f.validateField('cnpj');
  const raw = f.values.cnpj.replace(/\D/g, '');
  if (raw.length === 14 && rfbStatus.value === 'idle') {
    consultRfb(raw);
  }
}

// ── Idempotency key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `pj-create-${Date.now()}-${rand}`;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  // Limpa erro anterior a cada nova tentativa
  submitError.value = '';

  f.handleSubmit(async (vals) => {
    const idempotencyKey = generateIdempotencyKey();

    // dados_bancarios enviado como objeto aninhado (não JSON.stringify)
    // para que o schema Fastify receba { banco, agencia, conta } corretamente
    const { banco, agencia, conta, ...rest } = vals;
    const dadosBancarios = (banco || agencia || conta)
      ? { banco: banco || '', agencia: agencia || '', conta: conta || '' }
      : undefined;

    const payload = {
      ...rest,
      ...(dadosBancarios !== undefined ? { dados_bancarios: dadosBancarios } : {}),
    };

    try {
      // Idempotency-Key enviado como header HTTP (convenção RFC / padrão Fastify)
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';
      const res = await fetch(`${apiBase}/v1/pj`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error((result && result.error && result.error.message) || `HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }

      const id = result.id || (result.data && result.data.id);
      toast.success('Empresa cadastrada com sucesso!');
      if (id) {
        router.push(`/pj/${id}`);
      } else {
        router.push('/pj');
      }
    } catch (e) {
      // Erro persistente no banner + toast transitório
      submitError.value = `Erro ao cadastrar empresa: ${e.message}`;
      toast.error(`Erro ao cadastrar empresa: ${e.message}`);
    }
  });
}

function cancel() {
  router.push('/pj');
}
</script>

<style scoped>
/* ── Layout do formulário ── */
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
}

/* ── Banner de status RFB / erro de submit ── */
.rfb-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 500;
}

.rfb-banner[data-tone="success"] {
  background: rgb(var(--ui-success) / 0.12);
  color: rgb(var(--ui-success));
  border: 1px solid rgb(var(--ui-success) / 0.3);
}

.rfb-banner[data-tone="danger"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
  border: 1px solid rgb(var(--ui-danger) / 0.3);
}

.rfb-banner-icon {
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
}

/* ── CNPJ input wrapper ── */
.cnpj-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.cnpj-wrapper .ui-input {
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
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

/* Badge de status RFB */
.cnpj-badge {
  position: absolute;
  right: 10px;
  font-size: var(--ui-text-sm);
  font-weight: 700;
  flex-shrink: 0;
}

.cnpj-badge[data-tone="success"] {
  color: rgb(var(--ui-success));
}

.cnpj-badge[data-tone="danger"] {
  color: rgb(var(--ui-danger));
}

/* Estado visual do UiInput do CNPJ via data-state (aplicado no elemento raiz do componente) */
.cnpj-wrapper .ui-input[data-state="success"] {
  border-color: rgb(var(--ui-success));
}

.cnpj-wrapper .ui-input[data-state="error"] {
  border-color: rgb(var(--ui-danger));
}

.cnpj-wrapper .ui-input[data-state="loading"] {
  border-color: rgb(var(--ui-accent-strong));
}

/* Input em auto-preenchimento via RFB */
.ui-input[data-loading="true"] {
  opacity: 0.6;
  pointer-events: none;
}

@keyframes spin {
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
