<template>
  <UiPageLayout
    eyebrow="Profissionais"
    title="Convidar profissional"
    subtitle="Cadastre um profissional e atribua um papel — o acesso é concedido em cascata conforme o papel escolhido."
    width="wide"
    :loading="session.loading"
    :error="session.error"
    @retry="loadSession"
  >
    <template #actions>
      <UiButton variant="ghost" to="/professionals">Voltar à lista</UiButton>
    </template>

    <!-- ACCESS CONTROL: convidar profissionais é restrito a clinic_manager+ -->
    <UiCard v-if="!canInvite">
      <UiEmptyState
        icon="lock"
        title="Acesso restrito"
        description="Convidar profissionais é uma ação de gestão, disponível apenas para Gestores de clínica e Proprietários. Seu papel atual não permite emitir convites."
      >
        <template #action>
          <UiButton to="/professionals">Voltar à lista de profissionais</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- NORMAL STATE -->
    <div v-else class="layout">
      <form class="form-col" novalidate @submit.prevent="submit">
        <UiCard title="Dados do profissional" subtitle="Identificação e contato de quem você está convidando.">
          <UiFormSection title="Identificação" :columns="2">
            <UiFormField label="Nome completo" :required="true" :error="f.errors.full_name" :full-width="true">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.full_name"
                  :error="!!f.errors.full_name"
                  :required="true"
                  autocomplete="name"
                  placeholder="Ex.: Dra. Mariana Costa"
                  @update:model-value="f.setField('full_name', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="E-mail" :required="true" :error="f.errors.email" hint="O convite de acesso será enviado para este endereço.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  type="email"
                  :model-value="f.values.email"
                  :error="!!f.errors.email"
                  :required="true"
                  autocomplete="email"
                  placeholder="profissional@clinica.com"
                  @update:model-value="f.setField('email', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Telefone" :error="f.errors.phone" hint="Opcional. Apenas números, com DDD.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  type="tel"
                  :model-value="f.values.phone"
                  :error="!!f.errors.phone"
                  autocomplete="tel"
                  placeholder="(11) 99999-0000"
                  @update:model-value="f.setField('phone', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection title="Atuação profissional" description="Dados de registro do conselho de classe (opcional)." :columns="2">
            <UiFormField label="Especialidade" :error="f.errors.specialty">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.specialty"
                  placeholder="Ex.: Neuropediatria"
                  @update:model-value="f.setField('specialty', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Registro de conselho" :error="f.errors.council_number" hint="Ex.: CRM, CRP, CRFa.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.council_number"
                  placeholder="Ex.: CRP 06/123456"
                  @update:model-value="f.setField('council_number', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection title="Controle de acesso" description="O papel define o que o profissional poderá ver e fazer. A permissão é concedida em cascata." :columns="2">
            <UiFormField label="Papel" :required="true" :error="f.errors.role">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="native-select"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.role ? 'true' : undefined"
                  aria-required="true"
                  :value="f.values.role"
                  @change="f.setField('role', $event.target.value)"
                >
                  <option value="" disabled>Selecione um papel…</option>
                  <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Situação inicial" hint="Todo convite entra como “Convidado”. O aceite do profissional é que ativa o acesso — ativar ou suspender é feito depois, na edição.">
              <template #default="{ id, describedBy }">
                <div :id="id" :aria-describedby="describedBy" class="locked-field" role="note">
                  <UiStatusBadge status="invited" label="Convidado" />
                  <span class="locked-hint">definido automaticamente</span>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <template #footer>
            <div class="form-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value">Enviar convite</UiButton>
            </div>
          </template>
        </UiCard>
      </form>

      <!-- COLUNA LATERAL: prévia do acesso em cascata + situação -->
      <aside class="side-col">
        <UiCard title="Resumo do convite" subtitle="Confira antes de enviar.">
          <dl class="summary">
            <div class="summary-row">
              <dt>Profissional</dt>
              <dd>{{ f.values.full_name || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>E-mail</dt>
              <dd class="mono">{{ f.values.email || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Papel</dt>
              <dd>
                <UiStatusBadge v-if="selectedRole" :status="f.values.role" :label="selectedRole.label" :tone="selectedRole.tone" />
                <span v-else class="faint">A definir</span>
              </dd>
            </div>
            <div class="summary-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge status="invited" :label="statusLabelFor()" /></dd>
            </div>
          </dl>
        </UiCard>

        <UiCard title="Acesso concedido" :subtitle="selectedRole ? selectedRole.summary : 'Escolha um papel para visualizar as permissões.'">
          <div v-if="selectedRole" class="perms">
            <p class="perms-intro">Este papel concede, em cascata, os seguintes acessos:</p>
            <ul class="perms-list">
              <li v-for="(perm, i) in selectedRole.permissions" :key="i" class="perm-item">
                <span class="perm-mark" aria-hidden="true">✓</span>
                <span>{{ perm }}</span>
              </li>
            </ul>
            <p v-if="selectedRole.sensitive" class="perms-warn" role="note">
              Atenção: papel com permissões amplas. Conceda apenas a pessoas de confiança.
            </p>
          </div>
          <UiEmptyState
            v-else
            title="Nenhum papel selecionado"
            description="As permissões aparecem aqui conforme o papel escolhido no formulário."
          />
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiFormSection, UiFormField, UiInput, UiButton,
  UiStatusBadge, UiEmptyState, useForm, useToast, useConfirm, validators,
} from '../ui/index.js';
import { professionals, me } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// --- Catálogo COMPLETO de papéis: permissões em CASCATA (cada papel mais alto herda o anterior).
//     `rank` define a hierarquia para o controle de acesso em cascata (maior = mais poder). ---
const ALL_ROLES = [
  {
    value: 'professional',
    rank: 1,
    label: 'Profissional',
    tone: 'neutral',
    summary: 'Atendimento clínico do dia a dia.',
    sensitive: false,
    permissions: [
      'Acessar a própria agenda de atendimentos',
      'Registrar evoluções e sessões dos seus pacientes',
      'Consultar prontuários atribuídos a ele',
    ],
  },
  {
    value: 'clinic_manager',
    rank: 2,
    label: 'Gestor de clínica',
    tone: 'running',
    summary: 'Gestão da unidade + tudo do Profissional.',
    sensitive: false,
    permissions: [
      'Tudo que o Profissional pode fazer',
      'Convidar e gerenciar profissionais da unidade',
      'Visualizar agendas e indicadores de toda a clínica',
      'Configurar serviços, salas e horários',
    ],
  },
  {
    value: 'owner',
    rank: 3,
    label: 'Proprietário',
    tone: 'warning',
    summary: 'Controle total da conta + tudo do Gestor.',
    sensitive: true,
    permissions: [
      'Tudo que o Gestor de clínica pode fazer',
      'Gerenciar todas as unidades da conta',
      'Administrar faturamento e plano de assinatura',
      'Conceder ou revogar o papel de Proprietário',
    ],
  },
];

// Papel mínimo para CONVIDAR (gestão de equipe). Abaixo disso → acesso negado.
const MIN_INVITER_RANK = 2; // clinic_manager
const rankOf = (value) => (ALL_ROLES.find((r) => r.value === value) || {}).rank || 0;

// --- Sessão / RBAC: lê o papel do usuário corrente para o controle de acesso real ---
const session = reactive({ loading: true, error: '', role: '' });

const inviterRank = computed(() => rankOf(session.role));
// Pode convidar? clinic_manager+ . Sem identidade confiável → fail-safe nega.
const canInvite = computed(() => !session.loading && !session.error && inviterRank.value >= MIN_INVITER_RANK);

// Catálogo EFETIVO: o convidador só pode conceder papéis até o seu próprio teto.
// clinic_manager (rank 2) NÃO oferece owner (rank 3); só owner concede owner. Cascata de verdade.
const roleOptions = computed(() => ALL_ROLES.filter((r) => r.rank <= inviterRank.value));

async function loadSession() {
  session.loading = true;
  session.error = '';
  try {
    const who = await me();
    session.role = (who && (who.role || who.user?.role)) || '';
    // Se o papel atual não está mais no catálogo efetivo, limpa a seleção pendente.
    if (f.values.role && !roleOptions.value.some((r) => r.value === f.values.role)) {
      f.setField('role', '');
    }
  } catch (e) {
    // Sem identidade confiável: não derruba a tela inteira; canInvite trata como negado (fail-safe).
    if (e && (e.status === 401 || e.status === 403)) {
      session.role = '';
    } else {
      session.error = (e && e.message) || 'Não foi possível confirmar sua identidade.';
    }
  } finally {
    session.loading = false;
  }
}

const f = useForm({
  initial: {
    full_name: '',
    email: '',
    phone: '',
    specialty: '',
    council_number: '',
    role: '',
    // Situação fixa do convite: o aceite do profissional é que ativa. Não é editável aqui
    // (active/suspended pertencem à tela de edição/gestão — ver ProfessionalEditView).
    status: 'invited',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    phone: [validators.maxLen(20)],
    specialty: [validators.maxLen(80)],
    council_number: [validators.maxLen(40)],
    role: [validators.required('Selecione um papel')],
  },
});

const selectedRole = computed(() => ALL_ROLES.find((r) => r.value === f.values.role) || null);

function statusLabelFor() {
  return 'Convidado';
}

async function submit() {
  // Reforço do controle de acesso no envio (defesa em profundidade, além do gate da view).
  if (!canInvite.value) {
    toast.error('Seu papel atual não permite convidar profissionais.');
    return;
  }
  await f.handleSubmit(async (vals) => {
    // Não confiar só na UI: o papel escolhido nunca pode exceder o teto do convidador.
    if (rankOf(vals.role) > inviterRank.value) {
      toast.error('Você não pode conceder um papel superior ao seu.');
      return;
    }
    // Papel sensível (owner) exige confirmação explícita — ação de alto impacto (UX, não controle).
    if (vals.role === 'owner') {
      const ok = await askConfirm({
        title: 'Conceder papel de Proprietário?',
        message: 'O Proprietário tem controle total da conta, incluindo faturamento e gestão de papéis. Deseja continuar?',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      // Convite sempre nasce como 'invited' — o aceite é que ativa. Status não vem do form.
      await professionals.create({ ...vals, status: 'invited' });
      toast.success('Convite enviado para ' + vals.email);
      router.push('/professionals');
    } catch (e) {
      toast.error((e && e.message) || 'Não foi possível enviar o convite.');
    }
  });
}

function cancel() {
  router.push('/professionals');
}

onMounted(loadSession);
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.form-col { min-width: 0; }
.side-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

.native-select {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.native-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.native-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

/* Campo somente-leitura (situação fixa do convite) — paridade visual com inputs, sem afetar a11y */
.locked-field {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: 38px;
}
.locked-hint {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
  padding-bottom: var(--ui-space-2);
}
.summary-row:last-child { border-bottom: none; padding-bottom: 0; }
.summary dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.summary dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); text-align: right; min-width: 0; word-break: break-word; }
.mono { font-family: var(--ui-font-mono); font-size: var(--ui-text-xs); }
.faint { color: rgb(var(--ui-faint)); font-size: var(--ui-text-sm); }

.perms-intro { margin: 0 0 var(--ui-space-3); color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.perms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.perm-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.45;
}
.perm-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--ui-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
  margin-top: 1px;
}
.perms-warn {
  margin: var(--ui-space-4) 0 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warn) / 0.12);
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .side-col { position: static; }
}
@media (max-width: 640px) {
  .form-actions { flex-direction: column-reverse; }
}
</style>
