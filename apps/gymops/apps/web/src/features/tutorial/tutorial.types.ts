import type { UserRole } from '@/store/auth';

export type TutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'deferred';

export type TutorialCategory =
  | 'first-steps'
  | 'daily-operation'
  | 'administration'
  | 'integrations'
  | 'import'
  | 'notifications'
  | 'audit';

export type StepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** data-tutorial attribute do elemento a destacar. Omitir = modal central. */
  target?: string;
  placement?: StepPlacement;
  /** Papéis que veem este passo. Se omitido herda do tutorial. */
  rolesAllowed?: NonNullable<UserRole>[];
  /** Rota requerida. Se diferente da atual, o overlay sugere/navega. */
  route?: string;
  /** Dica curta de ação para o usuário (ex: "clique aqui"). */
  actionHint?: string;
  /** Se true, pula automaticamente quando target não existe no DOM (passos opcionais). */
  skipIfTargetMissing?: boolean;
  /** Se true, exibe card de fallback central em vez de pular quando target ausente. */
  required?: boolean;
  /** Título exibido no fallback quando target não existe e required=true. */
  fallbackTitle?: string;
  /** Corpo exibido no fallback quando target não existe e required=true. */
  fallbackBody?: string;
  /** Ms para aguardar o target aparecer antes de decidir (padrão: 600). */
  waitForTargetMs?: number;
  /** Rota para a qual o botão "próximo" deve navegar antes do próximo passo. */
  nextRoute?: string;
}

export interface TutorialDefinition {
  id: string;
  title: string;
  description: string;
  category: TutorialCategory;
  /** Papéis que podem ver o tutorial inteiro. */
  rolesAllowed: NonNullable<UserRole>[];
  /** Rotas em que o tutorial faz sentido (apenas hint, não bloqueia). */
  routePatterns?: string[];
  /** Rota canônica para navegar ao iniciar pela Central de Ajuda. */
  startRoute?: string;
  estimatedMinutes: number;
  steps: TutorialStep[];
  /** Se true, este tutorial é convidado no onboarding. Default: false. */
  isOnboarding?: boolean;
}

export interface TutorialProgress {
  id: string;
  tutorialId: string;
  status: TutorialStatus;
  currentStepId: string | null;
  completedSteps: string[];
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  updatedAt: string;
}
