<template>
  <UiPageLayout
    title="Nova Pessoa Física"
    eyebrow="Cadastro"
    subtitle="Preencha os dados para cadastrar uma nova Pessoa Física."
    width="narrow"
    :loading="saving"
    loading-message="Salvando cadastro…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" :to="'/pf'">Voltar para lista</UiButton>
    </template>

    <UiCard title="Identificação" subtitle="Dados pessoais e documentais obrigatórios.">
      <form novalidate @submit.prevent="submit">
        <UiFormSection title="Dados Pessoais" description="Nome completo e documento de identificação." :columns="2">
          <UiFormField label="Nome Completo" :required="true" :error="f.errors.nome" :full-width="true">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.nome"
                placeholder="Ex.: Maria Aparecida da Silva"
                autocomplete="name"
                :error="!!f.errors.nome"
                :required="true"
                @update:model-value="f.setField('nome', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="CPF"
            :required="true"
            :error="f.errors.cpf"
            hint="Somente números — máscara aplicada automaticamente."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="cpfMasked"
                placeholder="000.000.000-00"
                inputmode="numeric"
                autocomplete="off"
                maxlength="14"
                :error="!!f.errors.cpf"
                :required="true"
                @update:model-value="onCpfInput($event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Data de Nascimento" :error="f.errors.data_nascimento">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data_nascimento"
                :max="today"
                :error="!!f.errors.data_nascimento"
                @update:model-value="f.setField('data_nascimento', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Patrimônio Inicial (R$)"
            :error="f.errors.patrimonio_inicial"
            hint="Valor em reais. Use ponto ou vírgula para decimais."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.patrimonio_inicial"
                placeholder="0,00"
                inputmode="decimal"
                autocomplete="off"
                :error="!!f.errors.patrimonio_inicial"
                @update:model-value="f.setField('patrimonio_inicial', $event)"
                @change="onPatrimonioChange($event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Endereço" description="Informe o CEP para preenchimento automático." :columns="2">
          <UiFormField label="CEP" :error="f.errors.cep" hint="8 dígitos. Auto-preenchimento disponível.">
            <template #default="{ id, describedBy }">
              <div class="cep-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="cepMasked"
                  placeholder="00000-000"
                  inputmode="numeric"
                  maxlength="9"
                  :error="!!f.errors.cep"
                  :disabled="cepLoading"
                  @update:model-value="onCepInput($event)"
                  @change="lookupCep"
                />
                <span v-if="cepLoading" class="cep-spinner" aria-label="Buscando CEP…" />
              </div>
            </template>
          </UiFormField>

          <UiFormField label="Logradouro" :error="f.errors.logradouro" :full-width="false">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.logradouro"
                placeholder="Rua, Avenida, Praça…"
                autocomplete="street-address"
                :error="!!f.errors.logradouro"
                @update:model-value="f.setField('logradouro', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Número" :error="f.errors.numero">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.numero"
                placeholder="Ex.: 123 ou S/N"
                autocomplete="off"
                :error="!!f.errors.numero"
                @update:model-value="f.setField('numero', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Complemento" :error="f.errors.complemento">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.complemento"
                placeholder="Apto, Bloco, Casa…"
                autocomplete="off"
                :error="!!f.errors.complemento"
                @update:model-value="f.setField('complemento', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Bairro" :error="f.errors.bairro">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.bairro"
                placeholder="Bairro"
                autocomplete="off"
                :error="!!f.errors.bairro"
                @update:model-value="f.setField('bairro', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Cidade" :error="f.errors.cidade">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.cidade"
                placeholder="Cidade"
                autocomplete="address-level2"
                :error="!!f.errors.cidade"
                @update:model-value="f.setField('cidade', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="UF" :error="f.errors.uf">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.uf"
                :data-error="!!f.errors.uf"
                autocomplete="address-level1"
                @change="f.setField('uf', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option v-for="uf in UF_LIST" :key="uf" :value="uf">{{ uf }}</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <div class="form-actions">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton type="submit" :loading="f.submitting.value">
            Salvar Pessoa Física
          </UiButton>
        </div>
      </form>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
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
const pf = resourceFactory('pf');

// ── Router / Toast ───────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ─────────────────────────────────────────────────────────────
const saving = ref(false);
const submitError = ref(null);
const cepLoading = ref(false);

// ── Hoje para max do date picker ─────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

// ── UF list ──────────────────────────────────────────────────────────────────
const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

// ── CPF ──────────────────────────────────────────────────────────────────────
function maskCpf(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + '.' + digits.slice(3);
  if (digits.length <= 9) return digits.slice(0, 3) + '.' + digits.slice(3, 6) + '.' + digits.slice(6);
  return digits.slice(0, 3) + '.' + digits.slice(3, 6) + '.' + digits.slice(6, 9) + '-' + digits.slice(9, 11);
}

function validateCpfDigits(cpf) {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === Number(d[10]);
}

const cpfRaw = ref('');
const cpfMasked = computed(() => maskCpf(cpfRaw.value));

function onCpfInput(val) {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  cpfRaw.value = digits;
  f.setField('cpf', digits);
}

// ── CEP ──────────────────────────────────────────────────────────────────────
function maskCep(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + '-' + digits.slice(5);
}

const cepRaw = ref('');
const cepMasked = computed(() => maskCep(cepRaw.value));

function onCepInput(val) {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  cepRaw.value = digits;
  f.setField('cep', digits);
}

async function lookupCep() {
  const digits = cepRaw.value.replace(/\D/g, '');
  if (digits.length !== 8) return;
  cepLoading.value = true;
  try {
    const res = await fetch('https://viacep.com.br/ws/' + digits + '/json/');
    if (!res.ok) throw new Error('CEP não encontrado');
    const data = await res.json();
    if (data.erro) { toast.warning('CEP não encontrado.'); return; }
    f.setField('logradouro', data.logradouro || '');
    f.setField('bairro', data.bairro || '');
    f.setField('cidade', data.localidade || '');
    f.setField('uf', data.uf || '');
  } catch {
    toast.warning('Não foi possível buscar o CEP. Preencha o endereço manualmente.');
  } finally {
    cepLoading.value = false;
  }
}

// ── Patrimônio (currency) ─────────────────────────────────────────────────────
function onPatrimonioChange(val) {
  // Normaliza vírgula para ponto para parse numérico
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (isFinite(n)) {
    f.setField('patrimonio_inicial', String(n));
  }
}

// ── Validador CPF inline ──────────────────────────────────────────────────────
const cpfValidator = () => (v) => {
  if (!v) return 'CPF é obrigatório';
  const digits = String(v).replace(/\D/g, '');
  if (digits.length !== 11) return 'CPF deve ter 11 dígitos';
  if (!validateCpfDigits(digits)) return 'CPF inválido';
  return '';
};

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    nome: '',
    cpf: '',
    data_nascimento: '',
    patrimonio_inicial: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  },
  rules: {
    nome: [validators.required('Nome completo é obrigatório'), validators.minLen(3, 'Nome deve ter ao menos 3 caracteres')],
    cpf: [cpfValidator()],
    patrimonio_inicial: [validators.numeric('Informe um valor numérico válido'), validators.min(0, 'O patrimônio não pode ser negativo')],
  },
});

// ── Idempotency key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    saving.value = true;
    const idempotencyKey = generateIdempotencyKey();
    try {
      const payload = {
        nome: vals.nome.trim(),
        cpf: vals.cpf.replace(/\D/g, ''),
        ...(vals.data_nascimento ? { data_nascimento: vals.data_nascimento } : {}),
        ...(vals.patrimonio_inicial !== '' && vals.patrimonio_inicial !== undefined
          ? { patrimonio_inicial: Number(String(vals.patrimonio_inicial).replace(',', '.')) }
          : {}),
        endereco: buildEndereco(vals),
      };

      const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';
      const res = await fetch(BASE + '/v1/pf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || ('Erro ' + res.status);
        throw new Error(msg);
      }

      toast.success('Pessoa Física cadastrada com sucesso!');
      const id = data.id || (data.data && data.data.id);
      if (id) {
        router.push('/pf/' + id);
      } else {
        router.push('/pf');
      }
    } catch (e) {
      submitError.value = e.message || 'Erro ao salvar. Tente novamente.';
      toast.error(submitError.value);
    } finally {
      saving.value = false;
    }
  });
}

function buildEndereco(vals) {
  const parts = [
    vals.logradouro,
    vals.numero ? ', ' + vals.numero : '',
    vals.complemento ? ' - ' + vals.complemento : '',
    vals.bairro ? ', ' + vals.bairro : '',
    vals.cidade ? ' - ' + vals.cidade : '',
    vals.uf ? '/' + vals.uf : '',
    vals.cep ? ', CEP ' + maskCep(vals.cep) : '',
  ];
  return parts.join('').replace(/^,\s*/, '').trim() || undefined;
}

function cancel() {
  router.push('/pf');
}

onMounted(() => {
  // nada a carregar — tela de criação
});
</script>

<style scoped>
form {
  padding: var(--ui-space-5);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}

/* CEP row com spinner embutido */
.cep-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.cep-row .ui-input {
  flex: 1;
}

.cep-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent));
  border-radius: 50%;
  flex-shrink: 0;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* UF select herda estilos do kit via UiFormField :deep */
select[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

@media (max-width: 640px) {
  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
