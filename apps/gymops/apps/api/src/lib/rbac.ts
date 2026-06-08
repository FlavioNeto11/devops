import type { PrismaClient } from '@gymops/db';
import { db } from './prisma.js';

export type Action = 'view' | 'edit' | 'delete';

interface ResolvePermissionOptions {
  userId: string;
  activityId: string;
  action: Action;
  prisma?: PrismaClient;
}

export async function resolveActivityPermission({
  userId,
  activityId,
  action,
  prisma = db,
}: ResolvePermissionOptions): Promise<boolean> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId, deletedAt: null },
    select: {
      organizationId: true,
      unitId: true,
      areaId: true,
      visibilityMode: true,
      createdBy: true,
    },
  });

  if (!activity) return false;

  // 1. Check org-level roles (owner / org_manager always pass)
  const orgMembership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId: activity.organizationId,
      scopeType: 'organization',
      role: { in: ['owner', 'org_manager'] },
      deletedAt: null,
    },
  });
  if (orgMembership) return true;

  // 2. Unit manager of this unit
  const unitMembership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId: activity.organizationId,
      scopeType: 'unit',
      scopeId: activity.unitId,
      role: 'unit_manager',
      deletedAt: null,
    },
  });
  if (unitMembership) return true;

  // 3. Restricted — only explicit grants
  if (activity.visibilityMode === 'restricted') {
    if (activity.createdBy === userId) return action === 'view' || action === 'edit';

    const isAssignee = await prisma.activityAssignee.findFirst({
      where: { activityId, userId },
    });
    if (isAssignee) return action === 'view';

    const explicit = await prisma.activityPermission.findFirst({
      where: { activityId, userId },
    });
    if (!explicit) return false;
    if (explicit.accessLevel === 'edit') return true;
    return action === 'view';
  }

  // 4. inherited / shared — area membership grants access
  const areaMembership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId: activity.organizationId,
      scopeType: 'area',
      scopeId: activity.areaId,
      deletedAt: null,
    },
  });

  if (areaMembership) {
    if (areaMembership.role === 'area_leader') return true;
    if (areaMembership.role === 'executor') {
      if (action === 'view') return true;
      const isAssignee = await prisma.activityAssignee.findFirst({
        where: { activityId, userId },
      });
      return !!isAssignee;
    }
  }

  // 5. Shared — explicit permission
  if (activity.visibilityMode === 'shared') {
    const explicit = await prisma.activityPermission.findFirst({
      where: { activityId, userId },
    });
    if (explicit) {
      if (explicit.accessLevel === 'edit') return true;
      return action === 'view';
    }
  }

  // 6. Assignee/watcher minimum access
  const isAssignee = await prisma.activityAssignee.findFirst({
    where: { activityId, userId },
  });
  if (isAssignee) return action === 'view';

  return false;
}

export async function resolveUserMemberships(userId: string, organizationId: string) {
  return db.membership.findMany({
    where: { userId, organizationId, deletedAt: null },
    select: { scopeType: true, scopeId: true, role: true },
  });
}

export async function hasOrgRole(
  userId: string,
  organizationId: string,
  roles: string[],
): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: {
      userId,
      organizationId,
      scopeType: 'organization',
      role: { in: roles as never[] },
      deletedAt: null,
    },
  });
  return !!m;
}

export async function hasUnitRole(
  userId: string,
  unitId: string,
  organizationId: string,
  roles: string[],
): Promise<boolean> {
  // org-level also grants access
  const orgRole = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
  if (orgRole) return true;

  // direct unit membership
  const unitMembership = await db.membership.findFirst({
    where: {
      userId,
      organizationId,
      scopeType: 'unit',
      scopeId: unitId,
      role: { in: roles as never[] },
      deletedAt: null,
    },
  });
  if (unitMembership) return true;

  // area membership via unit_areas — area_leader/executor in an area of this unit get access
  const areaIds = await db.unitArea.findMany({
    where: { unitId },
    select: { areaId: true },
  });
  if (areaIds.length === 0) return false;

  const areaMembership = await db.membership.findFirst({
    where: {
      userId,
      organizationId,
      scopeType: 'area',
      scopeId: { in: areaIds.map((a) => a.areaId) },
      role: { in: roles as never[] },
      deletedAt: null,
    },
  });
  return !!areaMembership;
}
