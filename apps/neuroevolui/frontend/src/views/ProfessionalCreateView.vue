<template>
  <UiPageLayout
    eyebrow="Profissionais"
    title="Novo Profissional"
    subtitle="Cadastre um profissional da equipe e defina seu papel de acesso. Os campos marcados com * são obrigatórios."
    width="wide"
    :loading="session.loading"
    :error="session.error"
    @retry="loadSession"
  >
    <template #actions>
      <UiButton variant="ghost" to="/professionals">Voltar à lista</UiButton>
    </template>

    <!-- ESTADO: Sem permissão (acesso negado) -->
    <UiCard v-if="!session.loading && !session.error && !canCreate">
      <UiEmptyState
        icon="lock"
        title="Acesso restrito"
        description="Cadastrar profissionais é uma ação de gestão, disponível apenas para Gestores de clínica e Proprietários. Fale com um administrador para ajustar seu acesso."
      >
        <template #action>
          <UiButton to="/professionals">Voltar à lista de profissionais</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: Normal — layout de duas colunas (formulário + painel lateral rico) -->
    <div v-else-if="!session.loading && !session.error && canCreate" class="prc-layout">

      <!-- ── Coluna principal: formulário ─────────────────────────────────── -->
      <form class="prc-form-col" novalidate @submit.prevent="submit">

        <!-- Seção: Identidade do profissional -->
        <UiCard
          title="Identidade do profissional"
          subtitle="Dados de identificação e contato. O e-mail será usado para envio do convite de acesso."
        >
          <UiFormSection :columns="2">
            <!-- Nome completo (ocupa a largura inteira) -->
            <UiFormField
              label="Nome completo"
              :required="true"
              :error="f.errors.full_name"
              hint="Como aparecerá no prontuário e na agenda da clínica."
              :full-width="true"
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.full_name"
                  :error="!!f.errors.full_name"
                  :required="true"
                  autocomplete="name"
                  placeholder="Ex.: Dra. Mariana Costa Alves"
                  @update:model-value="f.setField('full_name', $event)"
                />
              </template>
            </UiFormField>

            <!-- E-mail -->
            <UiFormField
              label="E-mail"
              :required="true"
              :error="f.errors.email"
              hint="Endereço de contato — o convite de acesso será enviado aqui."
            >
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

            <!-- Telefone -->
            <UiFormField
              label="Telefone"
              :error="f.errors.phone"
              hint="Com DDD. Opcional."
            >
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
        </UiCard>

        <!-- Seção: Atuação clínica -->
        <UiCard
          title="Atuação clínica"
          subtitle="Especialidade e registro de conselho de classe — aparecem no perfil público e nos laudos."
        >
          <UiFormSection :columns="2">
            <!-- Especialidade -->
            <UiFormField
              label="Especialidade"
              :error="f.errors.specialty"
              hint="Ex.: Neuropediatria, Terapia Ocupacional, Psicopedagogia…"
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.specialty"
                  :error="!!f.errors.specialty"
                  placeholder="Ex.: Neuropediatria"
                  autocomplete="off"
                  @update:model-value="f.setField('specialty', $event)"
                />
              </template>
            </UiFormField>

            <!-- CRP / CRM -->
            <UiFormField
              label="CRP / CRM"
              :error="f.errors.crp_crm"
              hint="Número de registro no conselho de classe (CRP, CRM, CRFa etc.)."
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.crp_crm"
                  :error="!!f.errors.crp_crm"
                  placeholder="Ex.: CRP 06/123456"
                  autocomplete="off"
                  @update:model-value="f.setField('crp_crm', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- Seção: Papel de acesso (RoleSelector) -->
        <UiCard
          title="Controle de acesso"
          subtitle="O papel define o que este profissional poderá ver e fazer no sistema. As permissões são concedidas em cascata."
        >
          <UiFormSection :columns="1">
            <!-- Seletor de papel -->
            <UiFormField
              label="Papel"
              :required="true"
              :error="f.errors.role"
              hint="Você só pode conceder papéis até o nível do seu próprio acesso."
            >
              <template #default="{ id, describedBy }">
                <!-- Grade de cards de papel — mais rica que um select simples -->
                <div
                  :id="id"
                  class="prc-role-grid"
                  role="radiogroup"
                  aria-label="Selecione um papel"
                  :aria-describedby="describedBy || undefined"
                  :aria-invalid="f.errors.role ? 'true' : undefined"
                >
                  <label
                    v-for="roleOpt in roleOptions"
                    :key="roleOpt.value"
                    class="prc-role-card"
                    :data-selected="f.values.role === roleOpt.value ? 'true' : undefined"
                    :data-tone="roleOpt.tone"
                  >
                    <input
                      type="radio"
                      class="prc-role-radio"
                      name="professional-role"
                      :value="roleOpt.value"
                      :checked="f.values.role === roleOpt.value"
                      :aria-label="roleOpt.label + ' — ' + roleOpt.summary"
                      @change="f.setField('role', roleOpt.value)"
                    />
                    <!-- Ícone de papel -->
                    <span class="prc-role-icon" aria-hidden="true">{{ roleOpt.icon }}</span>
                    <!-- Conteúdo do card -->
                    <span class="prc-role-content">
                      <span class="prc-role-label">{{ roleOpt.label }}</span>
                      <span class="prc-role-summary">{{ roleOpt.summary }}</span>
                    </span>
                    <!-- Marcador de seleção -->
                    <span class="prc-role-check" aria-hidden="true">✓</span>
                  </label>
                </div>
              </template>
            </UiFormField>

            <!-- Alerta de papel sensível (owner) -->
            <div v-if="f.values.role === 'owner'" class="prc-owner-warn" role="alert">
              <span class="prc-warn-icon" aria-hidden="true">⚠</span>
              <span>
                O papel de <strong>Proprietário</strong> concede controle total da conta, incluindo
                faturamento, gerenciamento de unidades e revogação de papéis. Conceda somente a
                pessoas de confiança máxima.
              </span>
            </div>

            <!-- Status fixo do convite -->
            <UiFormField
              label="Situação inicial"
              hint="Todo convite começa como &quot;Convidado&quot;. O aceite do e-mail é que ativa o acesso."
            >
              <template #default="{ id, describedBy }">
                <div :id="id" :aria-describedby="describedBy || undefined" class="prc-locked-field" role="note">
                  <UiStatusBadge status="invited" label="Convidado" with-dot />
                  <span class="prc-locked-hint">definido automaticamente ao enviar o convite</span>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- Rodapé de ações -->
        <div class="prc-actions">
          <p class="prc-actions-hint">
            Os campos marcados com <span class="prc-req-star" aria-hidden="true">*</span> são obrigatórios.
          </p>
          <div class="prc-actions-btns">
            <UiButton
              variant="ghost"
              type="button"
              :disabled="f.submitting.value"
              @click="cancel"
            >
              Cancelar
            </UiButton>
            <UiButton
              variant="primary"
              type="submit"
              :loading="f.submitting.value"
            >
              Enviar convite
            </UiButton>
          </div>
        </div>
      </form>

      <!-- ── Coluna lateral: prévia em tempo real + permissões ───────────── -->
      <aside class="prc-side-col" aria-label="Resumo do convite">

        <!-- Card: prévia ao vivo -->
        <UiCard title="Prévia do convite" subtitle="Confira antes de enviar.">
          <!-- Avatar gerado das iniciais -->
          <div class="prc-avatar-row">
            <div class="prc-avatar" aria-hidden="true">{{ initials }}</div>
            <div class="prc-avatar-meta">
              <p class="prc-avatar-name">{{ f.values.full_name || 'Nome não preenchido' }}</p>
              <p class="prc-avatar-email">{{ f.values.email || 'E-mail não preenchido' }}</p>
            </div>
          </div>

          <!-- Linha divisória -->
          <div class="prc-divider" role="separator" />

          <!-- Detalhes do convite -->
          <dl class="prc-summary">
            <div class="prc-summary-row">
              <dt>Papel</dt>
              <dd>
                <UiStatusBadge
                  v-if="selectedRole"
                  :status="f.values.role"
                  :label="selectedRole.label"
                  :tone="selectedRole.tone"
                />
                <span v-else class="prc-faint">A definir</span>
              </dd>
            </div>
            <div class="prc-summary-row">
              <dt>Especialidade</dt>
              <dd>{{ f.values.specialty || '—' }}</dd>
            </div>
            <div class="prc-summary-row">
              <dt>CRP / CRM</dt>
              <dd>{{ f.values.crp_crm || '—' }}</dd>
            </div>
            <div class="prc-summary-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge status="invited" label="Convidado" /></dd>
            </div>
          </dl>
        </UiCard>

        <!-- Card: permissões do papel selecionado -->
        <UiCard
          title="Permissões concedidas"
          :subtitle="selectedRole ? selectedRole.permSummary : 'Escolha um papel para ver as permissões em cascata.'"
        >
          <div v-if="selectedRole" class="prc-perms">
            <p class="prc-perms-intro">Este papel concede, em cascata, acesso a:</p>
            <ul class="prc-perms-list" aria-label="Lista de permissões">
              <li
                v-for="(perm, idx) in selectedRole.permissions"
                :key="idx"
                class="prc-perm-item"
              >
                <span class="prc-perm-mark" aria-hidden="true">✓</span>
                <span>{{ perm }}</span>
              </li>
            </ul>
            <p v-if="selectedRole.sensitive" class="prc-perms-warn" role="note">
              Papel com permissões amplas — conceda somente a pessoas de plena confiança.
            </p>
          </div>
          <UiEmptyState
            v-else
            title="Nenhum papel selecionado"
            description="As permissões aparecem aqui após a escolha do papel no formulário."
          />
        </UiCard>

        <!-- Card: progresso de preenchimento -->
        <UiCard title="Progresso do formulário">
          <div class="prc-progress-list" role="list" aria-label="Campos obrigatórios">
            <div
              v-for="check in formChecks"
              :key="check.key"
              class="prc-progress-item"
              :data-done="check.done ? 'true' : undefined"
              role="listitem"
            >
              <span class="prc-progress-mark" aria-hidden="true">{{ check.done ? '✓' : '○' }}</span>
              <span class="prc-progress-label">{{ check.label }}</span>
            </div>
          </div>
          <!-- Barra de progresso visual: largura via data-pct (sem :style) -->
          <div class="prc-progress-bar-wrap" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100" :aria-label="progressPct + '% preenchido'">
            <div
              class="prc-progress-bar"
              :class="'prc-progress-bar--' + progressPct"
            />
          </div>
          <p class="prc-progress-caption">{{ progressPct }}% dos campos obrigatórios preenchidos</p>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { professionals, me } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── Catálogo de papéis com permissões em cascata ────────────────────────────
// Hierarquia: professional (1) < clinic_manager (2) < owner (3).
// O convidador só pode conceder papéis até o seu próprio teto (anti-escalada).
const ALL_ROLES = [
  {
    value: 'professional',
    rank: 1,
    label: 'Profissional',
    tone: 'neutral',
    icon: '👩‍⚕️',
    summary: 'Atendimento clínico do dia a dia.',
    permSummary: 'Acesso clínico básico — agenda própria e prontuários atribuídos.',
    sensitive: false,
    permissions: [
      'Acessar a própria agenda de atendimentos',
      'Registrar evoluções e notas dos seus pacientes',
      'Consultar prontuários atribuídos a este profissional',
      'Emitir laudos e relatórios dos seus atendimentos',
    ],
  },
  {
    value: 'clinic_manager',
    rank: 2,
    label: 'Gestor de clínica',
    tone: 'running',
    icon: '🏥',
    summary: 'Gestão da unidade + tudo do Profissional.',
    permSummary: 'Gestão completa da unidade — equipe, agenda e indicadores.',
    sensitive: false,
    permissions: [
      'Tudo que o Profissional pode fazer',
      'Convidar e gerenciar profissionais da unidade',
      'Visualizar agendas e indicadores de toda a clínica',
      'Configurar serviços, salas e horários de atendimento',
      'Acessar relatórios financeiros da unidade',
    ],
  },
  {
    value: 'owner',
    rank: 3,
    label: 'Proprietário',
    tone: 'warning',
    icon: '⭐',
    summary: 'Controle total da conta + tudo do Gestor.',
    permSummary: 'Controle total — inclui faturamento, todas as unidades e gestão de papéis.',
    sensitive: true,
    permissions: [
      'Tudo que o Gestor de clínica pode fazer',
      'Gerenciar todas as unidades da conta',
      'Administrar faturamento e plano de assinatura',
      'Conceder ou revogar qualquer papel, incluindo Proprietário',
      'Excluir a conta e todos os dados',
    ],
  },
];

// Papel mínimo para cadastrar profissionais — clinic_manager+
const MIN_CREATOR_RANK = 2;
const rankOf = (value) => (ALL_ROLES.find((r) => r.value === value) || {}).rank || 0;

// ── Sessão / RBAC ───────────────────────────────────────────────────────────
const session = reactive({ loading: true, error: '', role: '' });

const inviterRank = computed(() => rankOf(session.role));

// Pode cadastrar? Apenas clinic_manager+. Sem identidade confiável → nega.
const canCreate = computed(
  () => !session.loading && !session.error && inviterRank.value >= MIN_CREATOR_RANK,
);

// Catálogo efetivo: nunca mostra papéis acima do teto do invitador.
const roleOptions = computed(() => ALL_ROLES.filter((r) => r.rank <= inviterRank.value));

async function loadSession() {
  session.loading = true;
  session.error = '';
  try {
    const who = await me();
    session.role = (who && (who.role || (who.user && who.user.role))) || '';
    // Se o papel selecionado ficou fora do catálogo efetivo após refresh, limpa.
    if (f.values.role && !roleOptions.value.some((r) => r.value === f.values.role)) {
      f.setField('role', '');
    }
  } catch (e) {
    // 401/403 → sem identidade: canCreate = false (fail-safe nega).
    if (e && (e.status === 401 || e.status === 403)) {
      session.role = '';
    } else {
      session.error = (e && e.message) || 'Não foi possível confirmar sua identidade.';
    }
  } finally {
    session.loading = false;
  }
}

// ── Formulário ──────────────────────────────────────────────────────────────
const phonePattern = /^[\d\s()\-+]{8,20}$/;

const f = useForm({
  initial: {
    full_name: '',
    email: '',
    phone: '',
    specialty: '',
    crp_crm: '',
    role: '',
    status: 'invited',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo.'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail.'), validators.email()],
    phone: [validators.pattern(phonePattern, 'Telefone inválido. Use DDD + número (8 a 20 dígitos).')],
    specialty: [validators.maxLen(80, 'Especialidade com no máximo 80 caracteres.')],
    crp_crm: [validators.maxLen(40, 'Registro com no máximo 40 caracteres.')],
    role: [validators.required('Selecione um papel.')],
  },
});

// ── Derivados ───────────────────────────────────────────────────────────────
const selectedRole = computed(
  () => ALL_ROLES.find((r) => r.value === f.values.role) || null,
);

// Iniciais para o avatar gerado (até 2 letras maiúsculas)
const initials = computed(() => {
  const name = (f.values.full_name || '').trim();
  if (!name) return '?';
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase());
  return parts.length >= 2 ? parts[0] + parts[parts.length - 1] : parts[0] || '?';
});

// Checklist de progresso dos campos obrigatórios
const formChecks = computed(() => [
  { key: 'full_name', label: 'Nome completo', done: (f.values.full_name || '').trim().length >= 2 },
  { key: 'email', label: 'E-mail', done: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.values.email || '') },
  { key: 'role', label: 'Papel de acesso', done: !!f.values.role },
]);

// Retorna valores que casam com as classes CSS .prc-progress-bar--N definidas no scoped style.
// Com 3 campos: 0 → 0, 1 → 33, 2 → 67, 3 → 100.
const PCT_MAP = [0, 33, 67, 100];
const progressPct = computed(() => {
  const done = formChecks.value.filter((c) => c.done).length;
  return PCT_MAP[done] ?? 100;
});

// ── Idempotência ─────────────────────────────────────────────────────────────
function newKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'prof-' + crypto.randomUUID();
  } catch (_) { /* fallback */ }
  return 'prof-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
let idempotencyKey = newKey();

// ── Detecta formulário sujo para confirmar descarte ─────────────────────────
function isDirty() {
  return !!(
    f.values.full_name || f.values.email || f.values.phone ||
    f.values.specialty || f.values.crp_crm || f.values.role
  );
}

// ── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
  // Reforço server-side do controle de escalada de papel (defesa em profundidade).
  if (!canCreate.value) {
    toast.error('Seu papel atual não permite cadastrar profissionais.');
    return;
  }

  await f.handleSubmit(async (vals) => {
    // Anti-escalada: o papel concedido nunca pode exceder o teto do invitador.
    if (rankOf(vals.role) > inviterRank.value) {
      toast.error('Você não pode conceder um papel superior ao seu.');
      return;
    }

    // Papel sensível (owner) exige confirmação explícita.
    if (vals.role === 'owner') {
      const ok = await askConfirm({
        title: 'Conceder papel de Proprietário?',
        message:
          'O Proprietário tem controle total da conta, incluindo faturamento e gestão de papéis. ' +
          'Essa é uma ação de alto impacto. Deseja continuar?',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const payload = {
        full_name: vals.full_name.trim(),
        email: vals.email.trim().toLowerCase(),
        phone: vals.phone ? vals.phone.trim() : null,
        specialty: vals.specialty ? vals.specialty.trim() : null,
        crp_crm: vals.crp_crm ? vals.crp_crm.trim() : null,
        role: vals.role,
        status: 'invited',
      };
      await professionals.create(payload, { idempotencyKey });
      toast.success('Convite enviado para ' + payload.email + '. Aguardando aceite.');
      router.push('/professionals');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        toast.error('Sem permissão para cadastrar profissionais. Recarregue a página.');
        return;
      }
      if (e && e.status === 409) {
        // Regenera a chave para a próxima tentativa (conflito de idempotência ou duplicata).
        idempotencyKey = newKey();
        toast.error(
          (e.message) ||
          'Já existe um profissional com este e-mail. Verifique os dados e tente novamente.',
        );
        return;
      }
      toast.error((e && e.message) || 'Não foi possível enviar o convite. Tente novamente.');
    }
  });
}

// ── Cancelar ─────────────────────────────────────────────────────────────────
async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar cadastro?',
      message: 'As informações preenchidas serão perdidas. Deseja continuar?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/professionals');
}

onMounted(loadSession);
</script>

<style scoped>
/* ── Layout principal: form + lateral ─────────────────────────────────────── */
.prc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.prc-form-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.prc-side-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* ── Seletor de papel em cards ─────────────────────────────────────────────── */
.prc-role-grid {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.prc-role-card {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  background: rgb(var(--ui-bg));
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}
.prc-role-card:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  background: rgb(var(--ui-accent) / 0.04);
}
.prc-role-card[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.12);
}
/* Tone: warning (owner) */
.prc-role-card[data-tone="warning"][data-selected="true"] {
  border-color: rgb(var(--ui-warning));
  background: rgb(var(--ui-warning) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-warning) / 0.12);
}
/* Radio nativo oculto — navegação por teclado funcionando via label */
.prc-role-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.prc-role-radio:focus-visible + .prc-role-icon {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}
.prc-role-icon {
  font-size: 1.5rem;
  flex: 0 0 auto;
  line-height: 1;
  user-select: none;
}
.prc-role-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}
.prc-role-label {
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  line-height: 1.2;
}
.prc-role-summary {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.35;
}
/* Check de seleção — aparece só quando selecionado */
.prc-role-check {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-bg));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 800;
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.prc-role-card[data-selected="true"] .prc-role-check {
  opacity: 1;
  transform: scale(1);
}
.prc-role-card[data-tone="warning"][data-selected="true"] .prc-role-check {
  background: rgb(var(--ui-warning));
}

/* ── Alerta de papel sensível (owner) ──────────────────────────────────────── */
.prc-owner-warn {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warning) / 0.1);
  border: 1px solid rgb(var(--ui-warning) / 0.35);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.prc-warn-icon {
  flex: 0 0 auto;
  font-size: 1.1em;
  color: rgb(var(--ui-warning));
  margin-top: 1px;
}

/* ── Campo somente-leitura (status fixo do convite) ──────────────────────── */
.prc-locked-field {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: 38px;
}
.prc-locked-hint {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

/* ── Rodapé de ações ─────────────────────────────────────────────────────── */
.prc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.prc-actions-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.prc-req-star {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.prc-actions-btns {
  display: flex;
  gap: var(--ui-space-2);
}

/* ── Avatar gerado de iniciais ───────────────────────────────────────────── */
.prc-avatar-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}
.prc-avatar {
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.15);
  color: rgb(var(--ui-accent));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: var(--ui-text-lg);
  font-family: var(--ui-font-display, inherit);
  letter-spacing: 0.02em;
  user-select: none;
}
.prc-avatar-meta {
  min-width: 0;
  flex: 1 1 auto;
}
.prc-avatar-name {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prc-avatar-email {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Divisória ───────────────────────────────────────────────────────────── */
.prc-divider {
  height: 1px;
  background: rgb(var(--ui-border));
  margin: var(--ui-space-1) 0 var(--ui-space-3);
}

/* ── Tabela de resumo (dl) ───────────────────────────────────────────────── */
.prc-summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.prc-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.prc-summary-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.prc-summary dt {
  flex: 0 0 auto;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
}
.prc-summary dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
  min-width: 0;
  word-break: break-word;
}
.prc-faint {
  color: rgb(var(--ui-faint));
  font-size: var(--ui-text-sm);
}

/* ── Bloco de permissões ─────────────────────────────────────────────────── */
.prc-perms {
  display: flex;
  flex-direction: column;
}
.prc-perms-intro {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.prc-perms-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.prc-perm-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.45;
}
.prc-perm-mark {
  flex: 0 0 18px;
  height: 18px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok, var(--ui-accent)) / 0.15);
  color: rgb(var(--ui-ok, var(--ui-accent)));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  margin-top: 1px;
}
.prc-perms-warn {
  margin: var(--ui-space-4) 0 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warning) / 0.1);
  border: 1px solid rgb(var(--ui-warning) / 0.25);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

/* ── Checklist de progresso ──────────────────────────────────────────────── */
.prc-progress-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}
.prc-progress-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  transition: color 0.15s ease;
}
.prc-progress-item[data-done="true"] {
  color: rgb(var(--ui-fg));
}
.prc-progress-mark {
  flex: 0 0 18px;
  height: 18px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border));
  color: rgb(var(--ui-muted));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  transition: background 0.15s ease, color 0.15s ease;
}
.prc-progress-item[data-done="true"] .prc-progress-mark {
  background: rgb(var(--ui-ok, var(--ui-accent)) / 0.18);
  color: rgb(var(--ui-ok, var(--ui-accent)));
}
.prc-progress-label {
  flex: 1 1 auto;
}
/* Barra de progresso */
.prc-progress-bar-wrap {
  height: 6px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border));
  overflow: hidden;
  margin-bottom: var(--ui-space-2);
}
.prc-progress-bar {
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent));
  transition: width 0.3s ease;
  width: 0%;
}
/* Largura por classe (3 campos obrigatórios → 0, 33, 67, 100) */
.prc-progress-bar--0   { width: 0%; }
.prc-progress-bar--33  { width: 33%; }
.prc-progress-bar--67  { width: 67%; }
.prc-progress-bar--100 { width: 100%; }
.prc-progress-caption {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: right;
}

/* ── Responsivo ──────────────────────────────────────────────────────────── */
@media (max-width: 960px) {
  .prc-layout {
    grid-template-columns: 1fr;
  }
  .prc-side-col {
    position: static;
    /* Painel lateral abaixo do form em telas menores */
    order: 2;
  }
  .prc-form-col {
    order: 1;
  }
}
@media (max-width: 640px) {
  .prc-actions {
    flex-direction: column;
    align-items: stretch;
    gap: var(--ui-space-3);
  }
  .prc-actions-btns {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--ui-space-2);
  }
  .prc-role-card {
    padding: var(--ui-space-3);
  }
}
</style>
