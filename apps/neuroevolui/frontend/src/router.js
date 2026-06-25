import DashboardView from './views/DashboardView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import NotFoundView from './views/NotFoundView.vue';
// Telas de domínio (anexadas pelo integrador). A navegação da equipe e das
// consultas depende destas rotas — sem elas "Voltar"/"Editar"/redirect pós-save
// caem no NotFound. Rotas parametrizadas usam `props: true` para entregar :id
// às views (ProfessionalEditView etc. dependem disso).
import ProfessionalListView from './views/ProfessionalListView.vue';
import ProfessionalCreateView from './views/ProfessionalCreateView.vue';
import ProfessionalDetailView from './views/ProfessionalDetailView.vue';
import ProfessionalEditView from './views/ProfessionalEditView.vue';
import PatientListView from './views/PatientListView.vue';
import PatientCreateView from './views/PatientCreateView.vue';
import PatientDetailView from './views/PatientDetailView.vue';
import PatientEditView from './views/PatientEditView.vue';
import ConsultationListView from './views/ConsultationListView.vue';
import ConsultationCreateView from './views/ConsultationCreateView.vue';
import ConsultationDetailView from './views/ConsultationDetailView.vue';
import EvolutionNoteListView from './views/EvolutionNoteListView.vue';
import EvolutionNoteCreateView from './views/EvolutionNoteCreateView.vue';
import EvolutionNoteDetailView from './views/EvolutionNoteDetailView.vue';
import EvolutionNoteEditView from './views/EvolutionNoteEditView.vue';
import ReportListView from './views/ReportListView.vue';
import ReportCreateView from './views/ReportCreateView.vue';
import ReportDetailView from './views/ReportDetailView.vue';
import TransactionListView from './views/TransactionListView.vue';
import TransactionDetailView from './views/TransactionDetailView.vue';
import RevenueDashboardView from './views/RevenueDashboardView.vue';
import KnowledgeSourceListView from './views/KnowledgeSourceListView.vue';
import KnowledgeSourceCreateView from './views/KnowledgeSourceCreateView.vue';
import AuditLogListView from './views/AuditLogListView.vue';
import JobsMonitorView from './views/JobsMonitorView.vue';
import SystemHealthView from './views/SystemHealthView.vue';
import NotificationPreferencesView from './views/NotificationPreferencesView.vue';
import ApiDocsView from './views/ApiDocsView.vue';

export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },

  // Profissionais (equipe da clínica)
  { path: '/professionals', name: 'professionals', component: ProfessionalListView },
  { path: '/professionals/new', name: 'professional-new', component: ProfessionalCreateView },
  { path: '/professionals/:id', name: 'professional', component: ProfessionalDetailView, props: true },
  { path: '/professionals/:id/edit', name: 'professional-edit', component: ProfessionalEditView, props: true },

  // Pacientes
  { path: '/patients', name: 'patients', component: PatientListView },
  { path: '/patients/new', name: 'patient-new', component: PatientCreateView },
  { path: '/patients/:id', name: 'patient', component: PatientDetailView, props: true },
  { path: '/patients/:id/edit', name: 'patient-edit', component: PatientEditView, props: true },

  // Consultas (agenda / atendimentos)
  { path: '/consultations', name: 'consultations', component: ConsultationListView },
  { path: '/consultations/new', name: 'consultation-new', component: ConsultationCreateView },
  { path: '/consultations/:id', name: 'consultation', component: ConsultationDetailView, props: true },

  // Evoluções clínicas
  { path: '/evolution-notes', name: 'evolution-notes', component: EvolutionNoteListView },
  { path: '/evolution-notes/new', name: 'evolution-note-new', component: EvolutionNoteCreateView },
  { path: '/evolution-notes/:id', name: 'evolution-note', component: EvolutionNoteDetailView, props: true },
  { path: '/evolution-notes/:id/edit', name: 'evolution-note-edit', component: EvolutionNoteEditView, props: true },

  // Relatórios
  { path: '/reports', name: 'reports', component: ReportListView },
  { path: '/reports/new', name: 'report-new', component: ReportCreateView },
  { path: '/reports/:id', name: 'report', component: ReportDetailView, props: true },

  // Financeiro
  { path: '/transactions', name: 'transactions', component: TransactionListView },
  { path: '/transactions/:id', name: 'transaction', component: TransactionDetailView, props: true },
  { path: '/revenue', name: 'revenue', component: RevenueDashboardView },

  // RAG / base de conhecimento
  { path: '/knowledge-sources', name: 'knowledge-sources', component: KnowledgeSourceListView },
  { path: '/knowledge-sources/new', name: 'knowledge-source-new', component: KnowledgeSourceCreateView },

  // Governança / observabilidade / configurações / docs
  { path: '/audit-logs', name: 'audit-logs', component: AuditLogListView },
  { path: '/jobs', name: 'jobs', component: JobsMonitorView, alias: '/async-jobs' },
  { path: '/system-health', name: 'system-health', component: SystemHealthView },
  { path: '/notifications', name: 'notifications', component: NotificationPreferencesView },
  { path: '/api-docs', name: 'api-docs', component: ApiDocsView },

  // Assistente de IA
  { path: '/assistant', name: 'assistant', component: AiAssistantView },

  // Catch-all
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
