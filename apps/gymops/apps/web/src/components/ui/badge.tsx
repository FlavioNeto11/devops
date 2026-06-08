import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ActivityStatus, ActivityPriority } from '@gymops/shared';

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
        novo: 'border-transparent bg-gray-100 text-gray-700',
        em_andamento: 'border-transparent bg-blue-100 text-blue-700',
        aguardando_terceiro: 'border-transparent bg-amber-100 text-amber-700',
        aguardando_aprovacao: 'border-transparent bg-purple-100 text-purple-700',
        concluido: 'border-transparent bg-emerald-100 text-emerald-700',
        cancelado: 'border-transparent bg-gray-100 text-gray-400',
        // Priority
        baixa: 'border-transparent bg-gray-100 text-gray-600',
        media: 'border-transparent bg-blue-100 text-blue-700',
        alta: 'border-transparent bg-amber-100 text-amber-700',
        critica: 'border-transparent bg-red-100 text-red-700',
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

export function StatusBadge({ status }: { status: ActivityStatus }) {
  return <Badge variant={status as never}>{STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: ActivityPriority }) {
  return <Badge variant={priority as never}>{PRIORITY_LABELS[priority]}</Badge>;
}

export { Badge, badgeVariants };
