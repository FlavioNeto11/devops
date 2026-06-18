import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp, createUser, loginUser, authHeader, testDb, createOrg,
} from './helpers.js';

interface UnitInfo {
  id: string;
  name: string;
  address: string | null;
}

describe('GET /me/units', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  it('retorna 401 sem token', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/me/units' });
    expect(res.statusCode).toBe(401);
  });

  it('retorna lista vazia para usuário sem membership em unidade', async () => {
    const app = await getApp();
    const user = await createUser({ email: 'alice@test.com', password: 'Password123!' });
    const token = await loginUser(app, user.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toEqual([]);
  });

  it('retorna unidade com endereço para membership ativo', async () => {
    const app = await getApp();
    const org = await createOrg('org-test-units');
    const user = await createUser({ email: 'bob@test.com', password: 'Password123!' });
    const unit = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Unidade Centro', address: 'Rua das Flores, 123' },
    });
    await testDb.membership.create({
      data: { userId: user.id, organizationId: org.id, scopeType: 'unit', scopeId: unit.id, role: 'member' } as never,
    });
    const token = await loginUser(app, user.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: 'Unidade Centro', address: 'Rua das Flores, 123' });
  });

  it('retorna address null para unidade sem endereço cadastrado', async () => {
    const app = await getApp();
    const org = await createOrg('org-noaddr');
    const user = await createUser({ email: 'carol@test.com', password: 'Password123!' });
    const unit = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Sem Endereço' },
    });
    await testDb.membership.create({
      data: { userId: user.id, organizationId: org.id, scopeType: 'unit', scopeId: unit.id, role: 'member' } as never,
    });
    const token = await loginUser(app, user.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.address).toBeNull();
  });

  it('retorna múltiplas unidades para usuário com 2+ memberships ativos', async () => {
    const app = await getApp();
    const org = await createOrg('org-multi');
    const user = await createUser({ email: 'dave@test.com', password: 'Password123!' });
    const unit1 = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Vila Xavier', address: 'Av. Vila, 1' },
    });
    const unit2 = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Centro', address: 'Rua Centro, 2' },
    });
    await testDb.membership.create({
      data: { userId: user.id, organizationId: org.id, scopeType: 'unit', scopeId: unit1.id, role: 'member' } as never,
    });
    await testDb.membership.create({
      data: { userId: user.id, organizationId: org.id, scopeType: 'unit', scopeId: unit2.id, role: 'unit_manager' } as never,
    });
    const token = await loginUser(app, user.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toHaveLength(2);
    const names = body.data.map((u) => u.name).sort();
    expect(names).toEqual(['Centro', 'Vila Xavier']);
  });

  it('não retorna memberships de unidade com deletedAt preenchido', async () => {
    const app = await getApp();
    const org = await createOrg('org-softdel');
    const user = await createUser({ email: 'eve@test.com', password: 'Password123!' });
    const unit = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Deleted Unit', address: 'Rua X' },
    });
    await testDb.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        scopeType: 'unit',
        scopeId: unit.id,
        role: 'member',
        deletedAt: new Date(),
      } as never,
    });
    const token = await loginUser(app, user.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toEqual([]);
  });

  it('usuário B não vê unidades de usuário A', async () => {
    const app = await getApp();
    const org = await createOrg('org-isolation');
    const userA = await createUser({ email: 'a@test.com', password: 'Password123!' });
    const userB = await createUser({ email: 'b@test.com', password: 'Password123!' });
    const unit = await testDb.unit.create({
      data: { organizationId: org.id, name: 'Unidade A', address: 'Rua A' },
    });
    await testDb.membership.create({
      data: { userId: userA.id, organizationId: org.id, scopeType: 'unit', scopeId: unit.id, role: 'member' } as never,
    });
    const tokenB = await loginUser(app, userB.email, 'Password123!');

    const res = await app.inject({ method: 'GET', url: '/me/units', headers: authHeader(tokenB) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: UnitInfo[] };
    expect(body.data).toEqual([]);
  });
});
