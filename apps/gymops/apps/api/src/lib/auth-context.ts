import { db } from './prisma.js';

export interface UserContext {
  userRole: string | null;
  primaryUnitId: string | null;
  organizationId: string | null;
}

/**
 * Resolves the most-privileged role and primary unit for a user within a given org.
 *
 * Precedence: org-level > unit-level > area-level (via unit_areas)
 * Matches docs/rbac-matrix.md "Resolução canônica do contexto do usuário".
 */
export async function resolveUserContext(
  userId: string,
  organizationId: string,
): Promise<UserContext> {
  const memberships = await db.membership.findMany({
    where: { userId, organizationId, deletedAt: null },
    select: { scopeType: true, scopeId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });

  // 1. Org-level wins immediately
  const orgMembership = memberships.find((m) => m.scopeType === 'organization');
  if (orgMembership) {
    const firstUnit = await db.unit.findFirst({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return {
      userRole: orgMembership.role,
      primaryUnitId: firstUnit?.id ?? null,
      organizationId,
    };
  }

  // 2. Unit-level membership
  const unitMembership = memberships.find((m) => m.scopeType === 'unit');
  if (unitMembership) {
    return {
      userRole: unitMembership.role,
      primaryUnitId: unitMembership.scopeId,
      organizationId,
    };
  }

  // 3. Area-level membership — find corresponding unit via unit_areas
  const areaMembership = memberships.find((m) => m.scopeType === 'area');
  if (areaMembership) {
    const unitArea = await db.unitArea.findFirst({
      where: { areaId: areaMembership.scopeId, unit: { organizationId, deletedAt: null } },
      orderBy: { unit: { createdAt: 'asc' } },
      select: { unitId: true },
    });
    return {
      userRole: areaMembership.role,
      primaryUnitId: unitArea?.unitId ?? null,
      organizationId,
    };
  }

  return { userRole: null, primaryUnitId: null, organizationId };
}

/**
 * Finds the best organization for a user (first one ordered by membership creation).
 * Returns null if the user has no organization memberships at all.
 */
export async function resolveUserOrganization(userId: string): Promise<string | null> {
  // Try org-level first
  const orgMembership = await db.membership.findFirst({
    where: { userId, scopeType: 'organization', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  if (orgMembership) return orgMembership.organizationId;

  // Then unit-level
  const unitMembership = await db.membership.findFirst({
    where: { userId, scopeType: 'unit', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  if (unitMembership) return unitMembership.organizationId;

  // Then area-level
  const areaMembership = await db.membership.findFirst({
    where: { userId, scopeType: 'area', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  return areaMembership?.organizationId ?? null;
}
