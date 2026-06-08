import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, testDb,
} from './helpers.js';

describe('Auth — login by area membership', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  it('user with only area membership logs in and receives correct role and primaryUnitId', async () => {
    const app = await getApp();
    const org = await createOrg('area-org');
    const unit = await createUnit(org.id, 'Unidade Central');
    const area = await createArea(org.id, 'financeiro', 'Financeiro');

    // Link the area to the unit via unit_areas
    await testDb.unitArea.create({ data: { unitId: unit.id, areaId: area.id } });

    const areaUser = await createUser({ email: 'areauser@test.com', password: 'pass123' });
    await createMembership(areaUser.id, org.id, 'area', area.id, 'area_leader');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'areauser@test.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { role: string; primaryUnitId: string | null; organizationId: string };
    };
    expect(body.data.role).toBe('area_leader');
    expect(body.data.primaryUnitId).toBe(unit.id);
    expect(body.data.organizationId).toBe(org.id);
  });

  it('user with executor area membership logs in with executor role', async () => {
    const app = await getApp();
    const org = await createOrg('exec-org');
    const unit = await createUnit(org.id, 'Unidade Leste');
    const area = await createArea(org.id, 'mkt', 'Marketing');

    await testDb.unitArea.create({ data: { unitId: unit.id, areaId: area.id } });

    const execUser = await createUser({ email: 'exec@test.com', password: 'pass123' });
    await createMembership(execUser.id, org.id, 'area', area.id, 'executor');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'exec@test.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { role: string; primaryUnitId: string | null };
    };
    expect(body.data.role).toBe('executor');
    expect(body.data.primaryUnitId).toBe(unit.id);
  });

  it('user with org membership takes precedence over area membership', async () => {
    const app = await getApp();
    const org = await createOrg('mixed-org');
    const unit = await createUnit(org.id, 'Unidade Norte');
    const area = await createArea(org.id, 'coord', 'Coordenação');

    await testDb.unitArea.create({ data: { unitId: unit.id, areaId: area.id } });

    const ownerUser = await createUser({ email: 'ownerarea@test.com', password: 'pass123' });
    // Has both org-level and area-level membership — org wins
    await createMembership(ownerUser.id, org.id, 'organization', org.id, 'owner');
    await createMembership(ownerUser.id, org.id, 'area', area.id, 'executor');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ownerarea@test.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { role: string } };
    expect(body.data.role).toBe('owner');
  });

  it('user with no membership returns null role and organizationId', async () => {
    const app = await getApp();
    const noMemberUser = await createUser({ email: 'nomember@test.com', password: 'pass123' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nomember@test.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { role: string | null; organizationId: string | null };
    };
    expect(body.data.role).toBeNull();
    expect(body.data.organizationId).toBeNull();
    // Suppress unused variable warning
    void noMemberUser;
  });
});
