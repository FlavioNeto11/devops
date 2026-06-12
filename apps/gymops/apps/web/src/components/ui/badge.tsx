import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ActivityStatus, ActivityPriority } from '@gymops/shared';

// Visual monocromático: badges de status/prioridade usam o padrão "dot" — a
// pílula é NEUTRA (borda + fundo do tema, funciona em light e dark) e a
// semântica fica no ponto colorido renderizado por StatusBadge/PriorityBadge.
const NEUTRAL_DOT_BADGE = 'gap-1.5 border-border bg-card text-foreground font-medium';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        // Status
        novo: NEUTRAL_DOT_BADGE,
        em_andamento: NEUTRAL_DOT_BADGE,
        aguardando_terceiro: NEUTRAL_DOT_BADGE,
        aguardando_aprovacao: NEUTRAL_DOT_BADGE,
        concluido: NEUTRAL_DOT_BADGE,
        cancelado: `${NEUTRAL_DOT_BADGE} text-muted-foreground`,
        // Priority
        baixa: NEUTRAL_DOT_BADGE,
        media: NEUTRAL_DOT_BADGE,
        alta: NEUTRAL_DOT_BADGE,
        critica: NEUTRAL_DOT_BADGE,
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando terceiro',
  aguardando_aprovacao: 'Aguardando aprovação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const PRIORITY_LABELS: Record<ActivityPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

// Cores dos dots (única cor visível no badge — semântica preservada no mono).
const STATUS_DOT: Record<ActivityStatus, string> = {
  novo: 'bg-zinc-400',
  em_andamento: 'bg-blue-500',
  aguardando_terceiro: 'bg-amber-500',
  aguardando_aprovacao: 'bg-violet-500',
  concluido: 'bg-emerald-500',
  cancelado: 'bg-zinc-300',
};

const PRIORITY_DOT: Record<ActivityPriority, string> = {
  baixa: 'bg-zinc-400',
  media: 'bg-blue-500',
  alta: 'bg-amber-500',
  critica: 'bg-red-500',
};

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', className)} />;
}

export function StatusBadge({ status }: { status: ActivityStatus }) {
  return (
    <Badge variant={status as never}>
      <Dot className={STATUS_DOT[status]} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: ActivityPriority }) {
  return (
    <Badge variant={priority as never}>
      <Dot className={PRIORITY_DOT[priority]} />
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export { Badge, badgeVariants };
