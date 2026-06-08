import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, testDb,
} from './helpers.js';
import { hasUnitRole } from '../lib/rbac.js';

describe('hasUnitRole — area membership via unit_areas', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  it('returns true for direct unit_manager membership', async () => {
    const org = await createOrg('unit-role-org');
    const unit = await createUnit(org.id);
    const user = await createUser({ email: 'umgr@test.com' });
    await createMembership(user.id, org.id, 'unit', unit.id, 'unit_manager');

    const result = await hasUnitRole(user.id, unit.id, org.id, ['unit_manager']);
    expect(result).toBe(true);
  });

  it('returns true for org owner regardless of unit membership', async () => {
    const org = await createOrg('owner-unit-org');
    const unit = await createUnit(org.id);
    const owner = await createUser({ email: 'owner@test.com' });
    await createMembership(owner.id, org.id, 'organization', org.id, 'owner');

    const result = await hasUnitRole(owner.id, unit.id, org.id, ['unit_manager', 'area_leader']);
    expect(result).toBe(true);
  });

  it('returns true for area_leader in area linked to the unit', async () => {
    const org = await createOrg('area-unit-org');
    const unit = await createUnit(org.id);
    const area = await createArea(org.id, 'financeiro', 'Financeiro');
    await testDb.unitArea.create({ data: { unitId: unit.id, areaId: area.id } });

    const areaLeader = await createUser({ email: 'arealeader@test.com' });
    await createMembership(areaLeader.id, org.id, 'area', area.id, 'area_leader');

    const result = await hasUnitRole(areaLeader.id, unit.id, org.id, ['area_leader', 'executor']);
    expect(result).toBe(true);
  });

  it('returns true for executor in area linked to the unit', async () => {
    const org = await createOrg('exec-unit-org');
    const unit = await createUnit(org.id);
    const area = await createArea(org.id, 'mkt', 'Marketing');
    await testDb.unitArea.create({ data: { unitId: unit.id, areaId: area.id } });

    const executor = await createUser({ email: 'executor@test.com' });
    await createMembership(executor.id, org.id, 'area', area.id, 'executor');

    const result = await hasUnitRole(executor.id, unit.id, org.id, ['executor', 'area_leader']);
    expect(result).toBe(true);
  });

  it('returns false for area_leader in area NOT linked to the unit', async () => {
    const org = await createOrg('unlinked-area-org');
    const unitA = await createUnit(org.id, 'Unit A');
    const unitB = await createUnit(org.id, 'Unit B');
    const area = await createArea(org.id, 'coord', 'Coordenação');
    // Link area only to unitB, not unitA
    await testDb.unitArea.create({ data: { unitId: unitB.id, areaId: area.id } });

    const areaLeader = await createUser({ email: 'arealeader2@test.com' });
    await createMembership(areaLeader.id, org.id, 'area', area.id, 'area_leader');

    const result = await hasUnitRole(areaLeader.id, unitA.id, org.id, ['area_leader', 'executor']);
    expect(result).toBe(false);
  });

  it('returns false for viewer with no unit or area membership', async () => {
    const org = await createOrg('viewer-org');
    const unit = await createUnit(org.id);
    const viewer = await createUser({ email: 'viewer@test.com' });
    // No membership created

    const result = await hasUnitRole(viewer.id, unit.id, org.id, ['unit_manager', 'area_leader', 'executor']);
    expect(result).toBe(false);
  });
});
