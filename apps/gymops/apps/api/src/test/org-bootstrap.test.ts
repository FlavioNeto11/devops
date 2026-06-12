import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, initApp, resetDb, testDb } from './helpers.js';

// Onboarding com blueprint: POST /organizations aceita estrutura customizada
// (qualquer segmento) e mantém o caminho canônico (6 áreas + 24 templates)
// quando nenhum blueprint é enviado.

const OWNER = {
  ownerEmail: 'owner@bootstrap-test.com',
  ownerName: 'Owner Teste',
  ownerPassword: 'senha-segura-8',
};

describe('POST /organizations (bootstrap)', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  it('sem blueprint cria o catálogo canônico (regressão: 6 áreas, 24 templates)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/organizations',
      payload: { name: 'Org Canônica', slug: 'org-canonica', ...OWNER },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { organizationId: string } };

    const areas = await testDb.area.findMany({ where: { organizationId: body.data.organizationId } });
    const templates = await testDb.activityTemplate.findMany({ where: { organizationId: body.data.organizationId } });
    expect(areas).toHaveLength(6);
    expect(templates).toHaveLength(24);
  });

  it('com blueprint cria áreas/templates/unidades customizados; key canônica sem templates herda os canônicos', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/organizations',
      payload: {
        name: 'Clínica Sorriso',
        slug: 'clinica-sorriso',
        ...OWNER,
        setupMeta: { mode: 'ai', segmentLabel: 'Clínicas odontológicas' },
        blueprint: {
          areas: [
            {
              key: 'recepcao',
              name: 'Recepção e Agendamento',
              color: '#6366f1',
              visibilityDefault: 'inherited',
              templates: [
                {
                  name: 'Confirmar agenda do dia seguinte',
                  description: 'Confirmação ativa dos pacientes agendados',
                  defaultChecklist: ['Listar agendamentos', 'Ligar/enviar mensagem', 'Registrar confirmações'],
                  defaultPriority: 'alta',
                  defaultVisibility: 'inherited',
                  suggestedSlaDays: 1,
                },
              ],
            },
            {
              key: 'esterilizacao',
              name: 'Esterilização',
              color: '#10b981',
              visibilityDefault: 'inherited',
              templates: [],
            },
            // Key canônica SEM templates → backend anexa os 4 canônicos.
            { key: 'financeiro', name: 'Financeiro', color: '#3b82f6', visibilityDefault: 'restricted' },
          ],
          units: [
            { name: 'Unidade Centro', code: 'CT' },
            { name: 'Unidade Norte' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { organizationId: string } };
    const orgId = body.data.organizationId;

    const areas = await testDb.area.findMany({ where: { organizationId: orgId }, orderBy: { key: 'asc' } });
    expect(areas.map((a) => a.key).sort()).toEqual(['esterilizacao', 'financeiro', 'recepcao']);
    expect(areas.find((a) => a.key === 'financeiro')?.visibilityDefault).toBe('restricted');

    const templates = await testDb.activityTemplate.findMany({ where: { organizationId: orgId } });
    // 1 custom (recepcao) + 0 (esterilizacao explícito []) + 4 canônicos (financeiro)
    expect(templates).toHaveLength(5);
    expect(templates.some((t) => t.name === 'Confirmar agenda do dia seguinte')).toBe(true);
    expect(templates.some((t) => t.name === 'Fechamento mensal de caixa')).toBe(true);

    const units = await testDb.unit.findMany({ where: { organizationId: orgId } });
    expect(units).toHaveLength(2);

    const unitAreas = await testDb.unitArea.findMany({ where: { unitId: { in: units.map((u) => u.id) } } });
    expect(unitAreas).toHaveLength(2 * 3);

    const org = await testDb.organization.findUnique({ where: { id: orgId } });
    const settings = org?.settings as unknown as { onboarding?: { mode: string } };
    expect(settings?.onboarding?.mode).toBe('ai');
  });

  it('rejeita blueprint inválido (keys duplicadas, cor inválida) com 422', async () => {
    const app = await getApp();

    const dupRes = await app.inject({
      method: 'POST',
      url: '/organizations',
      payload: {
        name: 'Org Dup', slug: 'org-dup', ...OWNER,
        blueprint: {
          areas: [
            { key: 'mesma', name: 'Uma', color: '#6366f1', visibilityDefault: 'inherited', templates: [] },
            { key: 'mesma', name: 'Outra', color: '#ec4899', visibilityDefault: 'inherited', templates: [] },
          ],
          units: [],
        },
      },
    });
    expect(dupRes.statusCode).toBe(422);

    const colorRes = await app.inject({
      method: 'POST',
      url: '/organizations',
      payload: {
        name: 'Org Cor', slug: 'org-cor', ...OWNER,
        blueprint: {
          areas: [{ key: 'area', name: 'Área', color: 'vermelho', visibilityDefault: 'inherited', templates: [] }],
          units: [],
        },
      },
    });
    expect(colorRes.statusCode).toBe(422);
  });

  it('rejeita blueprint.units junto com initialUnit (CONFLICTING_UNITS)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/organizations',
      payload: {
        name: 'Org Conflito', slug: 'org-conflito', ...OWNER,
        initialUnit: { name: 'Unidade A' },
        blueprint: {
          areas: [{ key: 'area', name: 'Área', color: '#6366f1', visibilityDefault: 'inherited', templates: [] }],
          units: [{ name: 'Unidade B' }],
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('CONFLICTING_UNITS');
  });

  it('setup-draft sem OPENAI_API_KEY responde 503 AI_UNAVAILABLE (fluxo manual segue)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/organizations/setup-draft',
      payload: { businessDescription: 'Rede de clínicas odontológicas com 3 unidades e faturamento de convênios.' },
    });
    // Sem chave no ambiente de teste → 503 estruturado.
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error.code).toBe('AI_UNAVAILABLE');
  });
});
