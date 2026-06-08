'use client';

/**
 * Previews visuais para passos de tutorial quando `isFallback = true`
 * (elemento-alvo não está visível na tela atual).
 *
 * Cada preview é um componente React leve que simula o elemento real,
 * dando ao usuário uma referência visual concreta do recurso descrito.
 */

import { CheckSquare, MessageSquare, Paperclip, Clock, AlertCircle, BadgeCheck, Mail, Bell, Smartphone } from 'lucide-react';

// ── me-tabs ───────────────────────────────────────────────────────────────
export function MeTabsPreview() {
  const tabs = ['Hoje', 'Atrasadas', 'Esta semana', 'Aguardando'];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — abas de filtro
      </p>
      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab, i) => (
          <span
            key={tab}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
              i === 0
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border'
            }`}
          >
            {tab}
            {i === 1 && (
              <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-[9px] px-1 py-0.5">
                3
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── me-activity-list ──────────────────────────────────────────────────────
export function MeActivityListPreview() {
  const items = [
    {
      title: 'Vistoria de equipamentos',
      area: 'Manutenção',
      unit: 'Unidade Centro',
      due: 'Vence hoje',
      priority: 'Alta',
      priorityClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      progress: '3 / 5',
    },
    {
      title: 'Enviar relatório mensal',
      area: 'Administrativo',
      unit: 'Unidade Norte',
      due: 'Vence amanhã',
      priority: 'Média',
      priorityClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      progress: '1 / 3',
    },
  ];

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — lista de atividades
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-md border bg-background px-3 py-2 space-y-1 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium leading-tight">{item.title}</span>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${item.priorityClass}`}>
                {item.priority}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {item.area} · {item.unit}
            </p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {item.due}
              </span>
              <span className="flex items-center gap-0.5">
                <CheckSquare className="h-2.5 w-2.5" />
                {item.progress} itens
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── settings-profile ──────────────────────────────────────────────────────
export function SettingsProfilePreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — formulário de perfil
      </p>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">JS</span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="h-3 w-28 rounded bg-muted-foreground/20" />
          <div className="h-2.5 w-20 rounded bg-muted-foreground/15" />
        </div>
      </div>
      <div className="space-y-1.5">
        {['Nome completo', 'E-mail', 'Telefone (WhatsApp)'].map((label) => (
          <div key={label} className="space-y-0.5">
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <div className="h-7 w-full rounded-md border bg-background px-2 flex items-center">
              <div className="h-2 w-24 rounded bg-muted-foreground/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── settings-notifications ────────────────────────────────────────────────
export function SettingsNotificationsPreview() {
  const channels = [
    { icon: Mail, label: 'E-mail', desc: 'Resumo diário e alertas críticos', on: true },
    { icon: Bell, label: 'Push (navegador)', desc: 'Notificações instantâneas no browser', on: true },
    { icon: Smartphone, label: 'WhatsApp', desc: 'Alertas urgentes no celular', on: false },
  ];

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — canais de notificação
      </p>
      <div className="space-y-1.5">
        {channels.map(({ icon: Icon, label, desc, on }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-none">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{desc}</p>
              </div>
            </div>
            <div
              className={`h-4 w-7 rounded-full shrink-0 flex items-center px-0.5 transition-colors ${
                on ? 'bg-primary justify-end' : 'bg-muted-foreground/30 justify-start'
              }`}
            >
              <div className="h-3 w-3 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── activity-drawer-checklist ─────────────────────────────────────────────
export function ActivityChecklistPreview() {
  const items = [
    { label: 'Verificar equipamentos da sala', done: true },
    { label: 'Registrar ocorrências no livro', done: true },
    { label: 'Assinar planilha de limpeza', done: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — checklist
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-2">
            <div
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                item.done
                  ? 'bg-primary border-primary'
                  : 'bg-background border-muted-foreground/40'
              }`}
            >
              {item.done && <BadgeCheck className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <span className={`text-xs leading-tight ${item.done ? 'line-through text-muted-foreground' : ''}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">2 / 3 itens concluídos</p>
    </div>
  );
}

// ── activity-drawer-comments ──────────────────────────────────────────────
export function ActivityCommentsPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — comentários
      </p>
      <div className="space-y-2">
        {[
          { initials: 'MA', name: 'Marcos A.', time: 'hoje 09:14', text: 'Equipamento 3 com falha. Aguardando técnico.' },
          { initials: 'JS', name: 'Julia S.', time: 'hoje 10:02', text: 'Técnico confirmado para as 14h.' },
        ].map((c) => (
          <div key={c.name} className="flex gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-primary">{c.initials}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold">{c.name}</span>
                <span className="text-[9px] text-muted-foreground">{c.time}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <div className="flex-1 h-6 rounded-md border bg-background flex items-center px-2">
          <span className="text-[10px] text-muted-foreground">Adicionar comentário…</span>
        </div>
        <MessageSquare className="h-4 w-4 text-muted-foreground mt-1" />
      </div>
    </div>
  );
}

// ── activity-drawer-attachments ───────────────────────────────────────────
export function ActivityAttachmentsPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — anexos
      </p>
      <div className="space-y-1.5">
        {[
          { name: 'vistoria-jun.pdf', size: '142 KB' },
          { name: 'foto-equipamento.jpg', size: '380 KB' },
        ].map((f) => (
          <div key={f.name} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1 truncate">{f.name}</span>
            <span className="text-[10px] text-muted-foreground">{f.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── activity-drawer-history ───────────────────────────────────────────────
export function ActivityHistoryPreview() {
  const entries = [
    { actor: 'Julia S.', action: 'alterou status para', value: 'Em andamento', time: 'hoje 10:02' },
    { actor: 'Marcos A.', action: 'criou a atividade', value: '', time: 'ontem 08:45' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — histórico
      </p>
      <div className="space-y-2 relative pl-3 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-border">
        {entries.map((e) => (
          <div key={e.time} className="relative">
            <div className="absolute -left-3 top-1 h-2 w-2 rounded-full bg-primary/60 border border-background" />
            <p className="text-[10px] text-muted-foreground leading-tight">
              <span className="font-semibold text-foreground">{e.actor}</span>{' '}
              {e.action}
              {e.value && <span className="font-medium text-foreground"> "{e.value}"</span>}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{e.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── dashboard-kpis ────────────────────────────────────────────────────────
export function DashboardKpisPreview() {
  const kpis = [
    { label: 'Total', value: '48', color: 'text-foreground' },
    { label: 'Atrasadas', value: '7', color: 'text-destructive' },
    { label: 'Em andamento', value: '23', color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Concluídas', value: '18', color: 'text-emerald-600 dark:text-emerald-400' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — KPIs do painel
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-md border bg-background p-2 text-center">
            <p className={`text-lg font-bold leading-none ${k.color}`}>{k.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{k.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── activity-drawer-status ────────────────────────────────────────────────
export function ActivityStatusPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — status da atividade
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'Pendente', active: false, cls: 'border text-muted-foreground' },
          { label: 'Em andamento', active: true, cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300' },
          { label: 'Concluída', active: false, cls: 'border text-muted-foreground' },
          { label: 'Bloqueada', active: false, cls: 'border text-muted-foreground' },
        ].map((s) => (
          <span
            key={s.label}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${s.cls} ${s.active ? 'ring-1 ring-offset-1 ring-blue-400' : ''}`}
          >
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <AlertCircle className="h-2.5 w-2.5 text-amber-500" /> Alta prioridade
        </span>
        <span className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" /> Vence em 2 dias
        </span>
      </div>
    </div>
  );
}

// ── app-sidebar ───────────────────────────────────────────────────────────
export function AppSidebarPreview() {
  const items = [
    { label: 'Painel Geral', active: true },
    { label: 'Minhas Atividades', active: false },
    { label: 'Centro', active: false },
    { label: 'Norte', active: false },
    { label: 'Leste', active: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — barra lateral
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded px-2.5 py-1.5 text-xs font-medium ${
              item.active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── app-help-button ───────────────────────────────────────────────────────
export function AppHelpButtonPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — botão de ajuda
      </p>
      <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
        <div className="h-5 w-5 rounded-full border-2 border-primary/50 flex items-center justify-center">
          <span className="text-[11px] font-bold text-primary">?</span>
        </div>
        <span className="text-xs font-medium">Central de Ajuda</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Fica no rodapé da barra lateral. Use para buscar tópicos ou retomar um tutorial.</p>
    </div>
  );
}

// ── dashboard-unit-table ──────────────────────────────────────────────────
export function DashboardUnitTablePreview() {
  const rows = [
    { name: 'Unidade Centro', pending: 12, overdue: 2, done: 8, cls: 'text-destructive' },
    { name: 'Unidade Norte', pending: 7, overdue: 0, done: 15, cls: 'text-emerald-600 dark:text-emerald-400' },
    { name: 'Unidade Leste', pending: 5, overdue: 1, done: 11, cls: 'text-amber-600 dark:text-amber-400' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — tabela de unidades
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left pb-1 pr-2 font-medium">Unidade</th>
              <th className="text-right pb-1 px-2 font-medium">Pendentes</th>
              <th className="text-right pb-1 px-2 font-medium">Atrasadas</th>
              <th className="text-right pb-1 pl-2 font-medium">Concluídas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b last:border-0">
                <td className="py-1 pr-2 font-medium text-xs">{r.name}</td>
                <td className="py-1 px-2 text-right">{r.pending}</td>
                <td className={`py-1 px-2 text-right font-semibold ${r.cls}`}>{r.overdue}</td>
                <td className="py-1 pl-2 text-right">{r.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── dashboard-overdue-activities ──────────────────────────────────────────
export function DashboardOverduePreview() {
  const items = [
    { title: 'Vistoria equipamentos Sala 2', unit: 'Unidade Centro', days: '3 dias' },
    { title: 'Relatório mensal financeiro', unit: 'Unidade Norte', days: '1 dia' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — atividades atrasadas
      </p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.title} className="flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight truncate">{it.title}</p>
              <p className="text-[10px] text-muted-foreground">{it.unit}</p>
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
              +{it.days}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── global-activities-filters ─────────────────────────────────────────────
export function GlobalActivitiesFiltersPreview() {
  const filters = ['Status', 'Prioridade', 'Unidade', 'Área'];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — filtros de atividades
      </p>
      <div className="flex gap-1 flex-wrap">
        <div className="flex-1 h-7 min-w-[120px] rounded-md border bg-background flex items-center px-2 gap-1">
          <span className="text-[10px] text-muted-foreground">Buscar atividade…</span>
        </div>
        {filters.map((f) => (
          <div key={f} className="h-7 rounded-md border bg-background flex items-center px-2">
            <span className="text-[10px] text-muted-foreground">{f} ▾</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── global-activities-table ───────────────────────────────────────────────
export function GlobalActivitiesTablePreview() {
  const rows = [
    { title: 'Vistoria diária', area: 'Manutenção', unit: 'Centro', status: 'Atrasada', statusClass: 'text-destructive' },
    { title: 'Post redes sociais', area: 'Marketing', unit: 'Norte', status: 'Em andamento', statusClass: 'text-blue-600 dark:text-blue-400' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — central de atividades
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.title} className="rounded-md border bg-background px-2.5 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{r.title}</p>
              <p className="text-[10px] text-muted-foreground">{r.area} · {r.unit}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold ${r.statusClass}`}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── unit-summary ─────────────────────────────────────────────────────────
export function UnitSummaryPreview() {
  const stats = [
    { label: 'Pendentes', value: '12', color: 'text-foreground' },
    { label: 'Atrasadas', value: '3', color: 'text-destructive' },
    { label: 'Em andamento', value: '7', color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Concluídas', value: '22', color: 'text-emerald-600 dark:text-emerald-400' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — cabeçalho da unidade
      </p>
      <p className="text-sm font-bold">Academia Centro</p>
      <div className="grid grid-cols-4 gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border bg-background p-1.5 text-center">
            <p className={`text-base font-bold leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── unit-filters ──────────────────────────────────────────────────────────
export function UnitFiltersPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — filtros da unidade
      </p>
      <div className="flex gap-1 flex-wrap">
        {['Todas as áreas', 'Pendente', 'Alta prioridade', 'Vence hoje'].map((f, i) => (
          <span
            key={f}
            className={`px-2 py-1 rounded-md border text-[10px] font-medium ${
              i === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'
            }`}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── unit-area-board ───────────────────────────────────────────────────────
export function UnitAreaBoardPreview() {
  const columns = [
    { area: 'Administrativo', color: 'bg-blue-500', cards: ['Relatório mensal', 'Reunião semana'] },
    { area: 'Manutenção', color: 'bg-amber-500', cards: ['Vistoria equipamentos'] },
    { area: 'Marketing', color: 'bg-pink-500', cards: ['Post Instagram', 'Campanha junho'] },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — quadro por área
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {columns.map((col) => (
          <div key={col.area} className="shrink-0 w-28 space-y-1">
            <div className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${col.color}`} />
              <span className="text-[10px] font-semibold truncate">{col.area}</span>
            </div>
            {col.cards.map((card) => (
              <div key={card} className="rounded border bg-background px-2 py-1.5">
                <p className="text-[10px] leading-tight">{card}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── activity-card ─────────────────────────────────────────────────────────
export function ActivityCardPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — card de atividade
      </p>
      <div className="rounded-md border bg-background px-3 py-2.5 space-y-1.5 shadow-sm">
        <div className="flex items-start justify-between gap-1">
          <span className="text-xs font-medium leading-tight">Vistoria de equipamentos Sala 2</span>
          <span className="shrink-0 text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">Alta</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <CheckSquare className="h-2.5 w-2.5" /> 3/5
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> Vence hoje
          </span>
        </div>
        <div className="flex gap-1">
          {['MA', 'JS'].map((i) => (
            <div key={i} className="h-5 w-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-[8px] font-bold text-primary">{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── templates-list ────────────────────────────────────────────────────────
export function TemplatesListPreview() {
  const templates = [
    { name: 'Vistoria diária', area: 'Manutenção', items: 5, tag: 'Sistema' },
    { name: 'Reunião semanal', area: 'Administrativo', items: 3, tag: 'Custom' },
    { name: 'Post semanal', area: 'Marketing', items: 4, tag: 'Custom' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — lista de templates
      </p>
      <div className="space-y-1.5">
        {templates.map((t) => (
          <div key={t.name} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.area} · {t.items} itens</p>
            </div>
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
              t.tag === 'Sistema' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-muted text-muted-foreground'
            }`}>{t.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── units-admin-list ──────────────────────────────────────────────────────
export function UnitsAdminListPreview() {
  const units = [
    { name: 'Unidade Centro', status: 'Ativa', created: 'jan/2024' },
    { name: 'Unidade Norte', status: 'Ativa', created: 'mar/2024' },
    { name: 'Unidade Leste', status: 'Arquivada', created: 'ago/2023' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — lista de unidades
      </p>
      <div className="space-y-1.5">
        {units.map((u) => (
          <div key={u.name} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">{u.name}</p>
              <p className="text-[10px] text-muted-foreground">Criada em {u.created}</p>
            </div>
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
              u.status === 'Ativa' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
            }`}>{u.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── areas-admin-list ──────────────────────────────────────────────────────
export function AreasAdminListPreview() {
  const areas = [
    { name: 'Administrativo', key: 'admin', color: 'bg-blue-500' },
    { name: 'Manutenção', key: 'maintenance', color: 'bg-amber-500' },
    { name: 'Marketing', key: 'marketing', color: 'bg-pink-500' },
    { name: 'Limpeza', key: 'cleaning', color: 'bg-green-500' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — lista de áreas
      </p>
      <div className="space-y-1.5">
        {areas.map((a) => (
          <div key={a.key} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className={`h-3 w-3 rounded-full shrink-0 ${a.color}`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium">{a.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{a.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── team-list ─────────────────────────────────────────────────────────────
export function TeamListPreview() {
  const members = [
    { initials: 'AS', name: 'Ana Silva', role: 'owner', status: 'Ativo' },
    { initials: 'MR', name: 'Marcos R.', role: 'unit_manager', status: 'Ativo' },
    { initials: 'JC', name: 'Julia Costa', role: 'executor', status: 'Convite pendente' },
  ];
  const roleLabel: Record<string, string> = {
    owner: 'Owner',
    unit_manager: 'Ger. Unidade',
    executor: 'Executor',
  };
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — equipe
      </p>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div key={m.name} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-primary">{m.initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">{m.name}</p>
              <p className="text-[10px] text-muted-foreground">{roleLabel[m.role]}</p>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              m.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}>{m.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── settings-integrations ─────────────────────────────────────────────────
export function SettingsIntegrationsPreview() {
  const integrations = [
    { name: 'Trello', desc: 'Importar boards', status: 'Conectado', connected: true },
    { name: 'WhatsApp', desc: 'Alertas via Twilio', status: 'Desconectado', connected: false },
    { name: 'E-mail (SMTP)', desc: 'Notificações e convites', status: 'Configurado', connected: true },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — integrações
      </p>
      <div className="space-y-1.5">
        {integrations.map((i) => (
          <div key={i.name} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">{i.name}</p>
              <p className="text-[10px] text-muted-foreground">{i.desc}</p>
            </div>
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
              i.connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
            }`}>{i.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── trello-connect-card ───────────────────────────────────────────────────
export function TrelloConnectPreview() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — cartão Trello
      </p>
      <div className="rounded-md border bg-background p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-[#0079BF] flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-bold">T</span>
          </div>
          <div>
            <p className="text-xs font-semibold">Trello</p>
            <p className="text-[10px] text-muted-foreground">Não conectado</p>
          </div>
        </div>
        <div className="h-7 w-full rounded-md border-2 border-[#0079BF]/30 bg-[#0079BF]/5 flex items-center justify-center">
          <span className="text-[10px] font-medium text-[#0079BF]">Conectar com Trello</span>
        </div>
      </div>
    </div>
  );
}

// ── trello-import-wizard ──────────────────────────────────────────────────
export function TrelloImportWizardPreview() {
  const steps = ['Selecionar board', 'Preview', 'Mapeamento', 'Commit'];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — assistente de importação
      </p>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center justify-center h-5 w-5 rounded-full border text-[9px] font-bold ${
              i === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/40 text-muted-foreground'
            }`}>{i + 1}</div>
            {i < steps.length - 1 && <div className="h-px w-4 bg-muted-foreground/30" />}
          </div>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap">
        {steps.map((s, i) => (
          <span key={s} className={`text-[9px] ${i === 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{s}</span>
        ))}
      </div>
      <div className="h-12 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">Carregar JSON exportado ou selecionar board conectado</span>
      </div>
    </div>
  );
}

// ── imports-history ───────────────────────────────────────────────────────
export function ImportsHistoryPreview() {
  const imports = [
    { board: 'Academia Centro', date: '15/05/2026', items: 47, status: 'Completo', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    { board: 'Academia Norte', date: '10/05/2026', items: 31, status: 'Parcial', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    { board: 'Academia Leste', date: '02/05/2026', items: 0, status: 'Erro', cls: 'bg-destructive/10 text-destructive' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — histórico de importações
      </p>
      <div className="space-y-1.5">
        {imports.map((i) => (
          <div key={i.board} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{i.board}</p>
              <p className="text-[10px] text-muted-foreground">{i.date} · {i.items} itens</p>
            </div>
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${i.cls}`}>{i.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── recurrence-list ───────────────────────────────────────────────────────
export function RecurrenceListPreview() {
  const items = [
    { name: 'Vistoria diária', freq: 'Diária', next: 'Amanhã 06:00', active: true },
    { name: 'Reunião semanal', freq: 'Semanal (seg)', next: 'Seg 08:00', active: true },
    { name: 'Relatório mensal', freq: 'Mensal (dia 1)', next: 'Pausada', active: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — recorrências
      </p>
      <div className="space-y-1.5">
        {items.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{r.name}</p>
              <p className="text-[10px] text-muted-foreground">{r.freq} · Próxima: {r.next}</p>
            </div>
            <div className={`h-4 w-7 rounded-full shrink-0 flex items-center px-0.5 ${r.active ? 'bg-primary justify-end' : 'bg-muted-foreground/30 justify-start'}`}>
              <div className="h-3 w-3 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── audit-list ────────────────────────────────────────────────────────────
export function AuditListPreview() {
  const entries = [
    { actor: 'Ana Silva', action: 'arquivou unidade', resource: 'Unidade Sul', time: 'hoje 14:22' },
    { actor: 'Marcos R.', action: 'convidou membro', resource: 'Julia Costa', time: 'hoje 11:05' },
    { actor: 'Ana Silva', action: 'editou organização', resource: 'SkyFit Rede', time: 'ontem 09:30' },
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Exemplo — trilha de auditoria
      </p>
      <div className="space-y-2 relative pl-3 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-border">
        {entries.map((e) => (
          <div key={e.time + e.actor} className="relative">
            <div className="absolute -left-3 top-1 h-2 w-2 rounded-full bg-primary/60 border border-background" />
            <p className="text-[10px] leading-tight">
              <span className="font-semibold text-foreground">{e.actor}</span>{' '}
              <span className="text-muted-foreground">{e.action}</span>{' '}
              <span className="font-medium text-foreground">"{e.resource}"</span>
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{e.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Mapa de target → componente de preview.
 * Usado por TutorialStepCard quando isFallback=true.
 */
export const TUTORIAL_STEP_PREVIEWS: Record<string, React.ComponentType> = {
  'me-tabs': MeTabsPreview,
  'me-activity-list': MeActivityListPreview,
  'settings-profile': SettingsProfilePreview,
  'settings-notifications': SettingsNotificationsPreview,
  'activity-drawer-checklist': ActivityChecklistPreview,
  'activity-drawer-comments': ActivityCommentsPreview,
  'activity-drawer-attachments': ActivityAttachmentsPreview,
  'activity-drawer-history': ActivityHistoryPreview,
  'activity-drawer-status': ActivityStatusPreview,
  'dashboard-kpis': DashboardKpisPreview,
  'app-sidebar': AppSidebarPreview,
  'app-help-button': AppHelpButtonPreview,
  'dashboard-unit-table': DashboardUnitTablePreview,
  'dashboard-overdue-activities': DashboardOverduePreview,
  'global-activities-filters': GlobalActivitiesFiltersPreview,
  'global-activities-table': GlobalActivitiesTablePreview,
  'unit-summary': UnitSummaryPreview,
  'unit-filters': UnitFiltersPreview,
  'unit-area-board': UnitAreaBoardPreview,
  'activity-card': ActivityCardPreview,
  'templates-list': TemplatesListPreview,
  'units-admin-list': UnitsAdminListPreview,
  'areas-admin-list': AreasAdminListPreview,
  'team-list': TeamListPreview,
  'settings-integrations': SettingsIntegrationsPreview,
  'trello-connect-card': TrelloConnectPreview,
  'trello-import-wizard': TrelloImportWizardPreview,
  'imports-history': ImportsHistoryPreview,
  'recurrence-list': RecurrenceListPreview,
  'audit-list': AuditListPreview,
};
