// Tools READ-ONLY do assistente (F1 da re-engenharia de IA).
//
// Contrato @flavioneto11/ai-core: authz por IDENTIDADE (membership real via
// Prisma — a IA nunca enxerga além do que o usuário enxerga), risco R1 (leitura).
// Mutação (criar/alterar) entra em fase futura com dry-run + confirmação,
// preservando a regra de ouro "IA nunca salva direto".
import { z } from 'zod';
import { createToolRegistry, type AiTool, type AiToolContext } from '@flavioneto11/ai-core';
import { db } from '../../lib/prisma.js';

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

export const gymopsToolRegistry = createToolRegistry([queryOverdue, getDailyStats, listUnits]);
