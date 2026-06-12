'use client';

import { AlertTriangle, CheckSquare, Clock, RefreshCw, Users } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib/utils';
import type { ActivityListItem } from '@/lib/activities-api';

interface ActivityCardProps {
  activity: ActivityListItem;
  onClick?: () => void;
}

export function ActivityCard({ activity, onClick }: ActivityCardProps) {
  const responsible = activity.assignees.find((a) => a.kind === 'responsible');
  const { done, total } = activity.checklistProgress;

  return (
    <div
      data-tutorial="activity-card"
      onClick={onClick}
      className={[
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40',
        activity.priority === 'critica' && activity.isOverdue
          ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
          : activity.isOverdue
            ? 'border-amber-200 bg-amber-50/30'
            : 'bg-card',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Left column */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {activity.isOverdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          {activity.priority === 'critica' && !activity.isOverdue && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
          <span className="font-medium leading-snug">{activity.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={activity.status as never} />
          <PriorityBadge priority={activity.priority as never} />
          {activity.area && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: activity.area.color ? `${activity.area.color}20` : undefined, color: activity.area.color ?? undefined }}
            >
              {activity.area.name}
            </span>
          )}
          {activity.recurrenceRule && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
              <RefreshCw className="h-2.5 w-2.5" />
              Recorrente
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {activity.dueAt && (
            <span className={`flex items-center gap-0.5 ${activity.isOverdue ? 'font-medium text-red-600' : ''}`}>
              <Clock className="h-3 w-3" />
              {formatDate(activity.dueAt)}
            </span>
          )}
          {total > 0 && (
            <span className="flex items-center gap-0.5">
              <CheckSquare className="h-3 w-3" />
              {done}/{total}
            </span>
          )}
        </div>
      </div>

      {/* Right: assignee avatar */}
      <div className="shrink-0 pt-0.5">
        {responsible ? (
          <UserAvatar name={responsible.name} avatarUrl={responsible.avatarUrl} className="h-6 w-6 text-[10px]" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30" title="Sem responsável designado">
            <Users className="h-3 w-3 text-muted-foreground/40" aria-label="Atividade sem responsável designado" />
          </div>
        )}
      </div>
    </div>
  );
}
