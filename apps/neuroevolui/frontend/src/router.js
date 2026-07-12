import DashboardView from './views/DashboardView.vue';
import NotFoundView from './views/NotFoundView.vue';

// ── Pacientes ────────────────────────────────────────────────────────────────
import PatientListView from './views/PatientListView.vue';
import PatientCreateView from './views/PatientCreateView.vue';
import PatientDetailView from './views/PatientDetailView.vue';
import PatientEditView from './views/PatientEditView.vue';

// ── Evoluções clínicas ───────────────────────────────────────────────────────
import EvolutionNoteListView from './views/EvolutionNoteListView.vue';
import EvolutionNoteCreateView from './views/EvolutionNoteCreateView.vue';
import EvolutionNoteEditView from './views/EvolutionNoteEditView.vue';
import EvolutionNoteDetailView from './views/EvolutionNoteDetailView.vue';

// ── Consultas ────────────────────────────────────────────────────────────────
import ConsultationListView from './views/ConsultationListView.vue';
import ConsultationCreateView from './views/ConsultationCreateView.vue';
import ConsultationDetailView from './views/ConsultationDetailView.vue';

// ── Profissionais ────────────────────────────────────────────────────────────
import ProfessionalListView from './views/ProfessionalListView.vue';
import ProfessionalCreateView from './views/ProfessionalCreateView.vue';
import ProfessionalEditView from './views/ProfessionalEditView.vue';
import ProfessionalDetailView from './views/ProfessionalDetailView.vue';

// ── Relatórios de pacientes ───────────────────────────────────────────────────
import PatientReportListView from './views/PatientReportListView.vue';
import PatientReportCreateView from './views/PatientReportCreateView.vue';
import PatientReportDetailView from './views/PatientReportDetailView.vue';

// ── Financeiro ───────────────────────────────────────────────────────────────
import FinancialOverviewView from './views/FinancialOverviewView.vue';
import PaymentTransactionListView from './views/PaymentTransactionListView.vue';
import PaymentTransactionDetailView from './views/PaymentTransactionDetailView.vue';

// ── Assistente IA e Base de conhecimento ─────────────────────────────────────
import AssistantView from './views/AssistantView.vue';
import KnowledgeSourceListView from './views/KnowledgeSourceListView.vue';
import KnowledgeSourceCreateView from './views/KnowledgeSourceCreateView.vue';
import KnowledgeSourceEditView from './views/KnowledgeSourceEditView.vue';
import KnowledgeSourceDetailView from './views/KnowledgeSourceDetailView.vue';

// ── Preferências de notificação ───────────────────────────────────────────────
import NotificationPreferenceListView from './views/NotificationPreferenceListView.vue';
import NotificationPreferenceCreateView from './views/NotificationPreferenceCreateView.vue';
import NotificationPreferenceEditView from './views/NotificationPreferenceEditView.vue';

// ── Auditoria, Jobs e Configurações ──────────────────────────────────────────
import AuditLogListView from './views/AuditLogListView.vue';
import AuditLogDetailView from './views/AuditLogDetailView.vue';
import AsyncJobListView from './views/AsyncJobListView.vue';
import AsyncJobDetailView from './views/AsyncJobDetailView.vue';
import SettingsView from './views/SettingsView.vue';

export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },

  // Pacientes
  { path: '/patients', name: 'patient-list', component: PatientListView },
  { path: '/patients/new', name: 'patient-create', component: PatientCreateView },
  { path: '/patients/:id', name: 'patient-detail', component: PatientDetailView, props: true },
  { path: '/patients/:id/edit', name: 'patient-edit', component: PatientEditView, props: true },

  // Evoluções clínicas
  { path: '/evolution-notes', name: 'evolution-note-list', component: EvolutionNoteListView },
  { path: '/evolution-notes/new', name: 'evolution-note-create', component: EvolutionNoteCreateView },
  { path: '/evolution-notes/:id/edit', name: 'evolution-note-edit', component: EvolutionNoteEditView, props: true },
  { path: '/evolution-notes/:id', name: 'evolution-note-detail', component: EvolutionNoteDetailView, props: true },

  // Consultas
  { path: '/consultations', name: 'consultation-list', component: ConsultationListView },
  { path: '/consultations/new', alias: '/consultations/novo', name: 'consultation-create', component: ConsultationCreateView },
  { path: '/consultations/:id', name: 'consultation-detail', component: ConsultationDetailView, props: true },

  // Profissionais
  { path: '/professionals', name: 'professional-list', component: ProfessionalListView },
  { path: '/professionals/new', name: 'professional-create', component: ProfessionalCreateView },
  { path: '/professionals/:id/edit', name: 'professional-edit', component: ProfessionalEditView, props: true },
  { path: '/professionals/:id', name: 'professional-detail', component: ProfessionalDetailView, props: true },

  // Relatórios de pacientes
  { path: '/patient-reports', name: 'patient-report-list', component: PatientReportListView },
  { path: '/patient-reports/new', name: 'patient-report-create', component: PatientReportCreateView },
  { path: '/patient-reports/:id', name: 'patient-report-detail', component: PatientReportDetailView, props: true },

  // Financeiro
  { path: '/financial', name: 'financial-overview', component: FinancialOverviewView },
  { path: '/payment-transactions', name: 'payment-transaction-list', component: PaymentTransactionListView },
  { path: '/payment-transactions/:id', name: 'payment-transaction-detail', component: PaymentTransactionDetailView, props: true },

  // Assistente IA
  { path: '/assistant', name: 'assistant', component: AssistantView },

  // Base de conhecimento
  { path: '/knowledge-sources', name: 'knowledge-source-list', component: KnowledgeSourceListView },
  { path: '/knowledge-sources/new', name: 'knowledge-source-create', component: KnowledgeSourceCreateView },
  { path: '/knowledge-sources/:id/edit', name: 'knowledge-source-edit', component: KnowledgeSourceEditView, props: true },
  { path: '/knowledge-sources/:id', name: 'knowledge-source-detail', component: KnowledgeSourceDetailView, props: true },

  // Preferências de notificação
  { path: '/notification-preferences', name: 'notification-preference-list', component: NotificationPreferenceListView },
  { path: '/notification-preferences/new', name: 'notification-preference-create', component: NotificationPreferenceCreateView },
  { path: '/notification-preferences/:id/edit', name: 'notification-preference-edit', component: NotificationPreferenceEditView, props: true },

  // Auditoria
  { path: '/audit-logs', name: 'audit-log-list', component: AuditLogListView },
  { path: '/audit-logs/:id', name: 'audit-log-detail', component: AuditLogDetailView, props: true },

  // Jobs assíncronos
  { path: '/async-jobs', name: 'async-job-list', component: AsyncJobListView },
  { path: '/async-jobs/:id', name: 'async-job-detail', component: AsyncJobDetailView, props: true },

  // Configurações
  { path: '/settings', name: 'settings', component: SettingsView },

  // Catch-all 404
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
