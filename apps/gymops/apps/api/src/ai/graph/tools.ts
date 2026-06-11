// Tools do assistente (F1 + F5 da re-engenharia de IA).
//
// Contrato @flavioneto11/ai-core: authz por IDENTIDADE (membership real via
// Prisma — a IA nunca enxerga além do que o usuário enxerga). Leitura é R1;
// a mutante create_activity é R3 com dry-run + confirmação explícita do
// usuário (/ai/confirm), preservando a regra de ouro "IA nunca salva direto":
// o clique do usuário É o salvar.
import { z } from 'zod';
import type { ActivityPriority } from '@gymops/db';
import { AiToolDeniedError, createToolRegistry, type AiTool, type AiToolContext } from '@flavioneto11/ai-core';
import { db } from '../../lib/prisma.js';
import { hasUnitRole } from '../../lib/rbac.js';

// Toda tool recebe organizationId via toolContext (validado na rota) — o LLM
// não escolhe a organização; a identidade + membership mandam.
type Ctx = AiToolContext & { organizationId?: string };

async function memberAllowed(ctx: Ctx): Promise<{ allowed: boolean; reason?: string }> {
  const userId = ctx.identity?.sub;
  const organizationId = ctx.organizationId;
  if (!userId || !organizationId) return { allowed: false, reason: 'identidade/organização ausente' };
  const membership = await db.membership.findFirst({
    where: { userId: String(userId), organizationId, deletedAt: null },
    select: { id: true },
  });
  return membership ? { allowed: true } : { allowed: false, reason: 'não é membro da organização' };
}

const queryOverdue: AiTool = {
  name: 'query_overdue',
  description:
    'Lista as atividades ATRASADAS (prazo vencido e não concluídas) da organização, com título, área, unidade, prioridade e dias de atraso. Use para responder "o que está atrasado".',
  specialist: 'ops',
  risk: 'R1',
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'máximo de itens (default 10, máx 20)' },
    },
  },
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }).passthrough(),
  authorize: (ctx) => memberAllowed(ctx as Ctx),
  execute: async (input: { limit?: number }, ctx) => {
    const organizationId = (ctx as Ctx).organizationId as string;
    const now = new Date();
    const rows = await db.activity.findMany({
      where: {
        organizationId,
        dueAt: { lt: now },
        status: { notIn: ['concluido', 'cancelado'] },
      },
      orderBy: { dueAt: 'asc' },
      take: Math.min(input.limit ?? 10, 20),
      select: {
        title: true, status: true, priority: true, dueAt: true,
        area: { select: { name: true } },
        unit: { select: { name: true } },
      },
    });
    const total = await db.activity.count({
      where: { organizationId, dueAt: { lt: now }, status: { notIn: ['concluido', 'cancelado'] } },
    });
    return {
      total,
      items: rows.map((a) => ({
        title: a.title,
        status: a.status,
        priority: a.priority,
        area: a.area?.name ?? null,
        unit: a.unit?.name ?? null,
        daysOverdue: a.dueAt ? Math.max(0, Math.floor((now.getTime() - a.dueAt.getTime()) / 86_400_000)) : null,
      })),
    };
  },
};

const getDailyStats: AiTool = {
  name: 'get_daily_stats',
  description:
    'Estatísticas atuais da organização: abertas, atrasadas, críticas, vencendo hoje e total por status. Use para "resumo de hoje", contagens e visão geral.',
  specialist: 'ops',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: {} },
  inputSchema: z.object({}).passthrough(),
  authorize: (ctx) => memberAllowed(ctx as Ctx),
  execute: async (_input, ctx) => {
    const organizationId = (ctx as Ctx).organizationId as string;
    const now = new Date();
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const [byStatus, overdue, critical, dueToday] = await Promise.all([
      db.activity.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
      db.activity.count({ where: { organizationId, dueAt: { lt: now }, status: { notIn: ['concluido', 'cancelado'] } } }),
      db.activity.count({ where: { organizationId, priority: 'critica', status: { notIn: ['concluido', 'cancelado'] } } }),
      db.activity.count({ where: { organizationId, dueAt: { gte: now, lte: endOfDay } } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      overdue, critical, dueToday,
      generatedAt: now.toISOString(),
    };
  },
};

const listUnits: AiTool = {
  name: 'list_units',
  description: 'Lista as unidades da organização (nome e contagem de atividades abertas por unidade).',
  specialist: 'ops',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: {} },
  inputSchema: z.object({}).passthrough(),
  authorize: (ctx) => memberAllowed(ctx as Ctx),
  execute: async (_input, ctx) => {
    const organizationId = (ctx as Ctx).organizationId as string;
    const units = await db.unit.findMany({
      where: { organizationId },
      take: 50,
      select: { id: true, name: true },
    });
    const open = await db.activity.groupBy({
      by: ['unitId'],
      where: { organizationId, status: { notIn: ['concluido', 'cancelado'] } },
      _count: { _all: true },
    });
    const openByUnit = new Map(open.map((g) => [g.unitId, g._count._all]));
    return { total: units.length, units: units.map((u) => ({ name: u.name, openActivities: openByUnit.get(u.id) ?? 0 })) };
  },
};

// ── create_activity (MUTANTE — R3, dry-run + confirmação) ────────────────────
// A IA fala por NOME de unidade/área (o LLM não enxerga IDs); a tool resolve
// e devolve erro estruturado com opções quando não acha/ambíguo — o LLM corrige.
// RBAC real: o MESMO check do POST /activities (hasUnitRole). Dry-run devolve
// a prévia; a execução real só roda via /ai/confirm (confirmedToolCallId).

const createActivityInput = z
  .object({
    unitName: z.string().min(1).max(200).optional(),
    areaName: z.string().min(1).max(200).optional(),
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
    dueAt: z.string().optional(),
  })
  .passthrough();

type CreateActivityInput = z.infer<typeof createActivityInput>;

// O .d.ts do ai-core não declara o construtor (toolName, reason) — cast consciente.
const DeniedError = AiToolDeniedError as unknown as new (toolName: string, reason?: string) => Error;

/** Match por nome, case-insensitive, "contains" — devolve todos os candidatos. */
function matchByName<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const exact = items.filter((i) => i.name.trim().toLowerCase() === q);
  if (exact.length) return exact;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

const createActivity: AiTool = {
  name: 'create_activity',
  description:
    'Cria uma atividade operacional (tarefa) na organização — informe unidade e área pelo NOME (ex.: unidade "Vila Xavier", área "Estrutura"); a tool resolve os cadastros. Toda criação gera uma PRÉVIA (nada é salvo) e exige confirmação explícita do usuário antes de salvar.',
  specialist: 'ops',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: {
    type: 'object',
    properties: {
      unitName: { type: 'string', description: 'nome da unidade, como o usuário falou (busca aproximada)' },
      areaName: { type: 'string', description: 'nome da área da unidade (ex.: Estrutura, Marketing)' },
      title: { type: 'string', description: 'título da atividade (1 a 300 caracteres)' },
      description: { type: 'string', description: 'descrição opcional (até 2000 caracteres)' },
      priority: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'], description: 'prioridade (default media)' },
      dueAt: { type: 'string', description: 'prazo em ISO 8601 (opcional)' },
    },
    required: ['title'],
  },
  inputSchema: createActivityInput,
  authorize: (ctx) => memberAllowed(ctx as Ctx),
  execute: async (input: CreateActivityInput, ctx) => {
    const c = ctx as Ctx;
    const organizationId = c.organizationId as string;
    const userId = String(c.identity?.sub ?? '');

    // 1) resolve a UNIDADE por nome
    const units = await db.unit.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      take: 50,
    });
    const unitNames = units.map((u) => u.name);
    let unit: { id: string; name: string } | null = null;
    if (input.unitName) {
      const matches = matchByName(units, input.unitName);
      if (matches.length > 1) return { error: 'unit_ambiguous', candidates: matches.map((m) => m.name) };
      unit = matches[0] ?? null;
      if (!unit) return { error: 'unit_not_found', options: unitNames };
    } else {
      unit = units.length === 1 ? units[0] ?? null : null;
      if (!unit) return { error: 'unit_not_specified', options: unitNames };
    }

    // 2) resolve a ÁREA da unidade (via unit_areas habilitadas)
    const unitAreas = await db.unitArea.findMany({
      where: { unitId: unit.id, enabled: true, area: { deletedAt: null } },
      include: { area: { select: { id: true, name: true } } },
    });
    const areas = unitAreas.map((ua) => ua.area);
    const areaNames = areas.map((a) => a.name);
    if (areas.length === 0) return { error: 'unit_has_no_areas', unit: unit.name };
    let area: { id: string; name: string } | null = null;
    if (input.areaName) {
      const matches = matchByName(areas, input.areaName);
      if (matches.length > 1) return { error: 'area_ambiguous', candidates: matches.map((m) => m.name) };
      area = matches[0] ?? null;
      if (!area) return { error: 'area_not_found', unit: unit.name, options: areaNames };
    } else {
      area = areas.length === 1 ? areas[0] ?? null : null;
      if (!area) return { error: 'area_not_specified', unit: unit.name, options: areaNames };
    }

    // 3) RBAC real de criação — MESMO check do POST /activities
    const canCreate = await hasUnitRole(userId, unit.id, organizationId, ['unit_manager', 'area_leader', 'executor']);
    if (!canCreate) {
      throw new DeniedError(
        'create_activity',
        `sem permissão para criar atividades na unidade "${unit.name}" (requer unit_manager, area_leader ou executor)`,
      );
    }

    // 4) prazo (opcional)
    let dueAt: Date | null = null;
    if (input.dueAt) {
      const parsed = new Date(input.dueAt);
      if (Number.isNaN(parsed.getTime())) return { error: 'invalid_due_date', dueAt: input.dueAt };
      dueAt = parsed;
    }
    const priority = (input.priority ?? 'media') as ActivityPriority;

    // 5) DRY-RUN → prévia (NADA é gravado)
    if (c.dryRun === true) {
      return {
        preview: true,
        title: input.title,
        unit: unit.name,
        area: area.name,
        priority,
        dueAt: dueAt ? dueAt.toISOString() : null,
        // criação via IA não atribui assignees → ninguém é notificado
        willNotify: 0,
      };
    }

    // 6) execução REAL (pós-confirmação) — espelha o POST /activities:
    // status default 'novo', createdBy + evento 'created'; sem assignees → sem notificação.
    const activity = await db.activity.create({
      data: {
        organizationId,
        unitId: unit.id,
        areaId: area.id,
        title: input.title,
        description: input.description,
        priority,
        dueAt,
        createdBy: userId,
      },
    });
    await db.activityEvent.create({
      data: {
        activityId: activity.id,
        actorId: userId,
        eventType: 'created',
        payload: { title: activity.title, priority: activity.priority },
      },
    });

    return {
      id: activity.id,
      title: activity.title,
      unit: unit.name,
      area: area.name,
      status: activity.status,
      createdAt: activity.createdAt.toISOString(),
    };
  },
};

export const gymopsToolRegistry = createToolRegistry([queryOverdue, getDailyStats, listUnits, createActivity]);
