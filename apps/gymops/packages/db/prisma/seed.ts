import { PrismaClient, UserRole, ScopeType } from '@prisma/client';
import bcrypt from 'bcryptjs';

interface TemplateConfig {
  defaultChecklist: string[];
  defaultPriority: string;
  defaultVisibility: string;
  suggestedSlaDays?: number;
  specificFields?: string[];
}

interface TemplateDef {
  areaKey: string;
  name: string;
  description: string;
  config: TemplateConfig;
}

const TEMPLATES: TemplateDef[] = [
  // ── MANUTENÇÃO ──────────────────────────────────────────────────────────────
  {
    areaKey: 'manutencao',
    name: 'Chamado de Manutenção — Equipamento',
    description: 'Para falhas em equipamentos da academia',
    config: {
      defaultChecklist: ['Fotografar o equipamento', 'Isolar área de risco', 'Solicitar mínimo 2 orçamentos', 'Aprovar fornecedor', 'Acompanhar execução', 'Testar equipamento após reparo'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 3,
      specificFields: ['equipment', 'location', 'supplier', 'criticality'],
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Manutenção Preventiva Mensal',
    description: 'Checklist mensal de manutenção preventiva',
    config: {
      defaultChecklist: ['Lubrificar esteiras e bicicletas', 'Verificar cabos e polias', 'Checar extintores', 'Inspecionar chuveiros e vestiários', 'Revisar sistema elétrico'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Obra / Reforma',
    description: 'Para reformas e obras de maior porte',
    config: {
      defaultChecklist: ['Obter orçamento detalhado', 'Aprovar orçamento com gestão', 'Verificar alvarás necessários', 'Contratar empresa', 'Acompanhar execução', 'Fazer vistoria final', 'Liberar área para uso'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 14,
      specificFields: ['area_affected', 'budget', 'contractor'],
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Problema de Climatização',
    description: 'Ar-condicionado, ventilação e climatização',
    config: {
      defaultChecklist: ['Identificar unidades afetadas', 'Chamar técnico de AC', 'Verificar filtros', 'Aprovar reparo/troca', 'Testar após manutenção'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 2,
    },
  },
  // ── FINANCEIRO ───────────────────────────────────────────────────────────────
  {
    areaKey: 'financeiro',
    name: 'Pagamento de Fornecedor',
    description: 'Aprovação e pagamento de notas fiscais de fornecedores',
    config: {
      defaultChecklist: ['Receber NF/boleto', 'Conferir valores e dados', 'Aprovar pagamento', 'Realizar pagamento', 'Arquivar comprovante'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 2,
      specificFields: ['supplier', 'amount', 'due_date', 'payment_method'],
    },
  },
  {
    areaKey: 'financeiro',
    name: 'Conciliação de Caixa',
    description: 'Fechamento e conciliação mensal do caixa',
    config: {
      defaultChecklist: ['Exportar relatório de vendas', 'Conciliar com extrato bancário', 'Identificar divergências', 'Corrigir lançamentos', 'Enviar relatório para gestor'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 3,
    },
  },
  {
    areaKey: 'financeiro',
    name: 'Pagamento de Aluguel',
    description: 'Controle mensal de pagamento do aluguel',
    config: {
      defaultChecklist: ['Verificar valor atualizado', 'Solicitar aprovação se reajuste', 'Realizar pagamento', 'Registrar comprovante'],
      defaultPriority: 'critica',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 1,
      specificFields: ['amount', 'landlord', 'due_date'],
    },
  },
  {
    areaKey: 'financeiro',
    name: 'Renovação de Contrato',
    description: 'Renovação de contratos de fornecedores ou locação',
    config: {
      defaultChecklist: ['Solicitar proposta de renovação', 'Negociar valores', 'Revisar cláusulas com assessoria', 'Assinar contrato', 'Arquivar versão assinada'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 10,
    },
  },
  // ── ADMINISTRATIVO ───────────────────────────────────────────────────────────
  {
    areaKey: 'administrativo',
    name: 'Renovação de Alvará',
    description: 'Processo de renovação de alvará de funcionamento',
    config: {
      defaultChecklist: ['Verificar data de vencimento', 'Reunir documentos necessários', 'Solicitar vistoria se necessário', 'Protocolar na prefeitura', 'Acompanhar processo', 'Retirar alvará'],
      defaultPriority: 'critica',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 30,
      specificFields: ['expiry_date', 'protocol_number'],
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Contratação de Colaborador',
    description: 'Processo de recrutamento e contratação',
    config: {
      defaultChecklist: ['Aprovar vaga com gestão', 'Publicar vaga', 'Triagem de currículos', 'Entrevistar candidatos', 'Selecionar candidato', 'Coletar documentos', 'Registrar na CLT', 'Integrar colaborador'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 20,
      specificFields: ['position', 'salary_range', 'start_date'],
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Treinamento de Equipe',
    description: 'Organização de treinamentos internos ou externos',
    config: {
      defaultChecklist: ['Definir tema e objetivo', 'Identificar facilitador', 'Agendar data e local', 'Notificar participantes', 'Registrar presença', 'Coletar feedback'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 14,
    },
  },
  // ── MARKETING ────────────────────────────────────────────────────────────────
  {
    areaKey: 'marketing',
    name: 'Campanha em Redes Sociais',
    description: 'Publicação de campanha nas redes sociais',
    config: {
      defaultChecklist: ['Criar brief da campanha', 'Produzir artes/vídeos', 'Revisar conteúdo', 'Aprovar com gestão', 'Publicar nos canais', 'Monitorar engajamento'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 5,
      specificFields: ['platform', 'budget', 'target_audience'],
    },
  },
  {
    areaKey: 'marketing',
    name: 'Ação Promocional',
    description: 'Ação de captação ou retenção de alunos',
    config: {
      defaultChecklist: ['Definir oferta e público-alvo', 'Criar materiais visuais', 'Treinar equipe de vendas', 'Divulgar internamente', 'Acompanhar resultados', 'Relatório pós-ação'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
    },
  },
  {
    areaKey: 'marketing',
    name: 'Pesquisa de Satisfação',
    description: 'Aplicação de NPS ou pesquisa de satisfação',
    config: {
      defaultChecklist: ['Elaborar questionário', 'Definir canal de aplicação', 'Enviar para alunos', 'Coletar respostas', 'Analisar resultados', 'Apresentar relatório'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 10,
    },
  },
  {
    areaKey: 'marketing',
    name: 'Evento Interno',
    description: 'Organização de eventos internos na unidade (aula especial, workshop, etc.)',
    config: {
      defaultChecklist: ['Definir tema e formato', 'Confirmar data e local', 'Criar materiais de divulgação', 'Abrir inscrições', 'Confirmar logística', 'Realizar evento', 'Coletar feedback dos participantes'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 10,
      specificFields: ['event_type', 'expected_audience', 'responsible_instructor'],
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Integração de Novo Colaborador',
    description: 'Onboarding completo para colaboradores recém-contratados',
    config: {
      defaultChecklist: ['Preparar estação de trabalho', 'Criar acesso aos sistemas', 'Apresentar equipe e unidade', 'Explicar normas e políticas', 'Agendar treinamentos obrigatórios', 'Assinar documentos de admissão'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 5,
      specificFields: ['employee_name', 'position', 'start_date'],
    },
  },
  // ── COORDENAÇÃO ──────────────────────────────────────────────────────────────
  {
    areaKey: 'coordenacao',
    name: 'Substituição de Instrutor',
    description: 'Cobertura de aulas por ausência de instrutor',
    config: {
      defaultChecklist: ['Identificar aulas sem cobertura', 'Contatar instrutores disponíveis', 'Confirmar substituição', 'Comunicar turma afetada', 'Registrar ocorrência'],
      defaultPriority: 'critica',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 1,
      specificFields: ['instructor', 'class_time', 'class_type'],
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Revisão de Grade de Aulas',
    description: 'Atualização da grade horária de aulas coletivas',
    config: {
      defaultChecklist: ['Levantar demanda por horário', 'Verificar disponibilidade de instrutores', 'Propor nova grade', 'Aprovar com gestão', 'Comunicar alunos', 'Atualizar sistema'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 14,
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Avaliação de Desempenho',
    description: 'Avaliação periódica de instrutores e equipe operacional',
    config: {
      defaultChecklist: ['Definir critérios de avaliação', 'Coletar feedbacks de alunos', 'Agendar 1:1 com colaborador', 'Registrar avaliação', 'Definir PDI se necessário'],
      defaultPriority: 'media',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 7,
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Protocolo de Emergência',
    description: 'Registro e tratamento de ocorrências de saúde ou emergência na unidade',
    config: {
      defaultChecklist: ['Acionar socorro se necessário', 'Isolar área ou equipamento', 'Registrar ocorrência com horário', 'Notificar gestão imediatamente', 'Preencher relatório de incidente', 'Acionar seguro se aplicável'],
      defaultPriority: 'critica',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 1,
      specificFields: ['incident_type', 'persons_involved', 'location'],
    },
  },
  // ── LÍDER ────────────────────────────────────────────────────────────────────
  {
    areaKey: 'lider',
    name: 'Reunião de Alinhamento',
    description: 'Reunião periódica de alinhamento da equipe',
    config: {
      defaultChecklist: ['Definir pauta', 'Confirmar participantes', 'Realizar reunião', 'Registrar decisões e ações', 'Compartilhar ata'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 3,
    },
  },
  {
    areaKey: 'lider',
    name: 'Relatório de Desempenho da Unidade',
    description: 'Elaboração do relatório mensal para a liderança',
    config: {
      defaultChecklist: ['Coletar KPIs do mês', 'Analisar resultados vs. metas', 'Identificar desvios', 'Elaborar plano de ação', 'Apresentar para liderança'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 5,
    },
  },
  {
    areaKey: 'lider',
    name: 'Visita de Auditoria',
    description: 'Preparação e acompanhamento de auditoria interna ou externa',
    config: {
      defaultChecklist: ['Receber comunicado de auditoria', 'Reunir documentações exigidas', 'Verificar conformidades internas', 'Realizar auditoria', 'Tratar não-conformidades', 'Enviar relatório de fechamento'],
      defaultPriority: 'critica',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
    },
  },
  {
    areaKey: 'lider',
    name: 'Plano de Ação Mensal',
    description: 'Elaboração e acompanhamento do plano de ação da unidade',
    config: {
      defaultChecklist: ['Analisar resultados do mês anterior', 'Identificar principais desvios', 'Definir ações corretivas', 'Delegar responsáveis e prazos', 'Registrar plano no sistema', 'Revisar na próxima reunião'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 5,
      specificFields: ['reference_month', 'main_objective', 'kpi_target'],
    },
  },
];

const prisma = new PrismaClient();

// Aligned with bootstrap-organization.ts canonical catalogue
const AREAS = [
  { key: 'administrativo', name: 'Administrativo',       color: '#6366f1', visibilityDefault: 'inherited' },
  { key: 'marketing',      name: 'Marketing',            color: '#ec4899', visibilityDefault: 'inherited' },
  { key: 'coordenacao',    name: 'Coordenação',          color: '#f59e0b', visibilityDefault: 'inherited' },
  { key: 'manutencao',     name: 'Estrutura/Manutenção', color: '#10b981', visibilityDefault: 'inherited' },
  { key: 'financeiro',     name: 'Financeiro',           color: '#3b82f6', visibilityDefault: 'restricted' },
  { key: 'lider',          name: 'Liderança',            color: '#8b5cf6', visibilityDefault: 'restricted' },
];

const UNITS = [
  { name: 'Vila Xavier', code: 'VX' },
  { name: 'Centro', code: 'CT' },
  { name: 'Shopping', code: 'SH' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'skyfit' },
    update: {},
    create: { name: 'SkyFit', slug: 'skyfit' },
  });
  console.log(`✅ Organization: ${org.name}`);

  // Areas
  const areas: Record<string, { id: string }> = {};
  for (const area of AREAS) {
    const created = await prisma.area.upsert({
      where: { organizationId_key: { organizationId: org.id, key: area.key } },
      update: { name: area.name, color: area.color, visibilityDefault: area.visibilityDefault },
      create: { organizationId: org.id, key: area.key, name: area.name, color: area.color, visibilityDefault: area.visibilityDefault },
    });
    areas[area.key] = created;
  }
  console.log(`✅ Areas: ${AREAS.length} created`);

  // Units
  const units: Array<{ id: string; name: string }> = [];
  for (const unit of UNITS) {
    const existing = await prisma.unit.findFirst({ where: { organizationId: org.id, code: unit.code } });
    const created = await prisma.unit.upsert({
      where: { id: existing?.id ?? 'not-found' },
      update: {},
      create: { organizationId: org.id, name: unit.name, code: unit.code },
    });
    units.push(created);

    for (const area of Object.values(areas)) {
      await prisma.unitArea.upsert({
        where: { unitId_areaId: { unitId: created.id, areaId: area.id } },
        update: {},
        create: { unitId: created.id, areaId: area.id },
      });
    }
  }
  console.log(`✅ Units: ${UNITS.length} created with all areas`);

  // Users
  const passwordHash = await bcrypt.hash('gymops123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@skyfit.com' },
    update: { name: 'Admin SkyFit', passwordHash },
    create: { name: 'Admin SkyFit', email: 'admin@skyfit.com', passwordHash },
  });

  // Master da PLATAFORMA (super-admin, acima das academias). Sem membership de org.
  // Identidade de exemplo: admin@gymops.com. Senha-seed só para DEV — trocar em runtime.
  await prisma.user.upsert({
    where: { email: 'admin@gymops.com' },
    update: { name: 'Platform Master', isPlatformAdmin: true },
    create: { name: 'Platform Master', email: 'admin@gymops.com', passwordHash, isPlatformAdmin: true },
  });

  const existingAdminMembership = await prisma.membership.findFirst({
    where: { userId: admin.id, organizationId: org.id, scopeType: ScopeType.organization },
  });
  await prisma.membership.upsert({
    where: { id: existingAdminMembership?.id ?? 'not-found' },
    update: { role: UserRole.owner },
    create: {
      userId: admin.id,
      organizationId: org.id,
      scopeType: ScopeType.organization,
      scopeId: org.id,
      role: UserRole.owner,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'joao@skyfit.com' },
    update: { name: 'João Silva', passwordHash },
    create: { name: 'João Silva', email: 'joao@skyfit.com', passwordHash },
  });

  const firstUnit = units[0];
  if (firstUnit) {
    const existingMgr = await prisma.membership.findFirst({
      where: { userId: manager.id, organizationId: org.id, scopeType: ScopeType.unit, scopeId: firstUnit.id },
    });
    await prisma.membership.upsert({
      where: { id: existingMgr?.id ?? 'not-found' },
      update: { role: UserRole.unit_manager },
      create: {
        userId: manager.id,
        organizationId: org.id,
        scopeType: ScopeType.unit,
        scopeId: firstUnit.id,
        role: UserRole.unit_manager,
      },
    });
  }

  // ── Additional E2E smoke profiles ───────────────────────────────────────────
  const orgManager = await prisma.user.upsert({
    where: { email: 'org-manager@skyfit.com' },
    update: { name: 'Org Manager', passwordHash },
    create: { name: 'Org Manager', email: 'org-manager@skyfit.com', passwordHash },
  });
  const existingOrgMgr = await prisma.membership.findFirst({
    where: { userId: orgManager.id, organizationId: org.id, scopeType: ScopeType.organization },
  });
  await prisma.membership.upsert({
    where: { id: existingOrgMgr?.id ?? 'not-found' },
    update: { role: UserRole.org_manager },
    create: { userId: orgManager.id, organizationId: org.id, scopeType: ScopeType.organization, scopeId: org.id, role: UserRole.org_manager },
  });

  const areaLeaderUser = await prisma.user.upsert({
    where: { email: 'area-leader@skyfit.com' },
    update: { name: 'Area Leader', passwordHash },
    create: { name: 'Area Leader', email: 'area-leader@skyfit.com', passwordHash },
  });
  const adminArea = areas['administrativo'];
  if (adminArea) {
    const existingAL = await prisma.membership.findFirst({
      where: { userId: areaLeaderUser.id, organizationId: org.id, scopeType: ScopeType.area, scopeId: adminArea.id },
    });
    await prisma.membership.upsert({
      where: { id: existingAL?.id ?? 'not-found' },
      update: { role: UserRole.area_leader },
      create: { userId: areaLeaderUser.id, organizationId: org.id, scopeType: ScopeType.area, scopeId: adminArea.id, role: UserRole.area_leader },
    });
  }

  const executorUser = await prisma.user.upsert({
    where: { email: 'executor@skyfit.com' },
    update: { name: 'Executor', passwordHash },
    create: { name: 'Executor', email: 'executor@skyfit.com', passwordHash },
  });
  const marketingArea = areas['marketing'];
  if (marketingArea) {
    const existingEx = await prisma.membership.findFirst({
      where: { userId: executorUser.id, organizationId: org.id, scopeType: ScopeType.area, scopeId: marketingArea.id },
    });
    await prisma.membership.upsert({
      where: { id: existingEx?.id ?? 'not-found' },
      update: { role: UserRole.executor },
      create: { userId: executorUser.id, organizationId: org.id, scopeType: ScopeType.area, scopeId: marketingArea.id, role: UserRole.executor },
    });
  }

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@skyfit.com' },
    update: { name: 'Viewer', passwordHash },
    create: { name: 'Viewer', email: 'viewer@skyfit.com', passwordHash },
  });
  // viewer gets no membership — access comes from activity_permissions added below
  // (for smoke test, we just ensure they can log in and see the activities page)
  // Add a minimal org-level membership so they can authenticate — viewer has no native scope
  // in the current schema, so we grant a unit-level viewer-equivalent through a future activity_permission
  // For smoke only: give them an org-level membership with viewer intent (not modeled as role=viewer at org scope)
  // Use area-level executor to ensure login works, but no create rights:
  if (adminArea) {
    const existingViewer = await prisma.membership.findFirst({
      where: { userId: viewerUser.id, organizationId: org.id },
    });
    if (!existingViewer) {
      await prisma.membership.create({
        data: { userId: viewerUser.id, organizationId: org.id, scopeType: ScopeType.area, scopeId: adminArea.id, role: UserRole.viewer },
      });
    }
  }

  console.log(`✅ Users: admin@skyfit.com (owner), joao@skyfit.com (unit_manager), + 4 E2E smoke profiles`);

  // Sample activities
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sampleActivities = [
    {
      unitIdx: 0,
      areaKey: 'manutencao',
      title: 'Esteira 4 parada — aguardando peça',
      description: 'Correia de transmissão quebrada. Orçamento solicitado para Fornecedor X.',
      status: 'aguardando_terceiro' as const,
      priority: 'critica' as const,
      dueAt: yesterday,
    },
    {
      unitIdx: 0,
      areaKey: 'manutencao',
      title: 'Verificar ar-condicionado da sala de musculação',
      status: 'novo' as const,
      priority: 'alta' as const,
      dueAt: tomorrow,
    },
    {
      unitIdx: 0,
      areaKey: 'financeiro',
      title: 'Pagar aluguel — vencimento amanhã',
      status: 'novo' as const,
      priority: 'critica' as const,
      dueAt: tomorrow,
    },
    {
      unitIdx: 0,
      areaKey: 'administrativo',
      title: 'Renovar alvará de funcionamento',
      status: 'em_andamento' as const,
      priority: 'alta' as const,
      dueAt: nextWeek,
    },
    {
      unitIdx: 0,
      areaKey: 'coordenacao',
      title: 'Escalar instrutor substituto para turma de segunda',
      status: 'novo' as const,
      priority: 'media' as const,
      dueAt: tomorrow,
    },
    {
      unitIdx: 1,
      areaKey: 'manutencao',
      title: 'Trocar lâmpadas do estacionamento',
      status: 'novo' as const,
      priority: 'media' as const,
      dueAt: nextWeek,
    },
    {
      unitIdx: 1,
      areaKey: 'financeiro',
      title: 'Conciliar caixa do mês — maio',
      status: 'em_andamento' as const,
      priority: 'alta' as const,
      dueAt: threeDaysAgo,
    },
    {
      unitIdx: 1,
      areaKey: 'marketing',
      title: 'Publicar campanha Dia das Mães nas redes sociais',
      status: 'concluido' as const,
      priority: 'media' as const,
      dueAt: threeDaysAgo,
    },
    {
      unitIdx: 2,
      areaKey: 'administrativo',
      title: 'Contratar recepcionista para turno noturno',
      status: 'em_andamento' as const,
      priority: 'alta' as const,
      dueAt: nextWeek,
    },
    {
      unitIdx: 2,
      areaKey: 'manutencao',
      title: 'Revisão da bomba de piscina',
      status: 'aguardando_aprovacao' as const,
      priority: 'critica' as const,
      dueAt: yesterday,
    },
  ];

  let activityCount = 0;
  for (const act of sampleActivities) {
    const unit = units[act.unitIdx];
    const area = areas[act.areaKey];
    if (!unit || !area) continue;

    const existing = await prisma.activity.findFirst({
      where: { title: act.title, unitId: unit.id },
    });
    if (existing) continue;

    const activity = await prisma.activity.create({
      data: {
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        title: act.title,
        description: act.description,
        status: act.status,
        priority: act.priority,
        dueAt: act.dueAt,
        createdBy: admin.id,
      },
    });

    // Add admin as responsible
    await prisma.activityAssignee.create({
      data: { activityId: activity.id, userId: admin.id, kind: 'responsible' },
    });

    // Add a sample checklist for maintenance activities
    if (act.areaKey === 'manutencao') {
      const checklist = await prisma.activityChecklist.create({
        data: { activityId: activity.id, title: 'Etapas de resolução', order: 0 },
      });
      await prisma.activityChecklistItem.createMany({
        data: [
          { checklistId: checklist.id, text: 'Identificar o problema', order: 0, done: true, doneBy: admin.id, doneAt: now },
          { checklistId: checklist.id, text: 'Solicitar orçamentos (mín. 2)', order: 1 },
          { checklistId: checklist.id, text: 'Aprovar fornecedor', order: 2 },
          { checklistId: checklist.id, text: 'Executar reparo', order: 3 },
        ],
      });
    }

    // Audit event
    await prisma.activityEvent.create({
      data: {
        activityId: activity.id,
        actorId: admin.id,
        eventType: 'created',
        payload: { title: activity.title },
      },
    });

    activityCount++;
  }
  console.log(`✅ Activities: ${activityCount} sample activities created`);

  // Activity Templates
  let templateCount = 0;
  for (const tmpl of TEMPLATES) {
    const area = areas[tmpl.areaKey];
    if (!area) continue;

    await prisma.activityTemplate.upsert({
      where: {
        id: (await prisma.activityTemplate.findFirst({
          where: { organizationId: org.id, name: tmpl.name, areaId: area.id },
          select: { id: true },
        }))?.id ?? 'not-found',
      },
      update: { description: tmpl.description, config: tmpl.config },
      create: {
        organizationId: org.id,
        areaId: area.id,
        name: tmpl.name,
        description: tmpl.description,
        config: tmpl.config,
        isSystem: true,
      },
    });
    templateCount++;
  }
  console.log(`✅ Templates: ${templateCount} system templates created`);

  console.log(`\n🔑 Login: admin@skyfit.com / gymops123`);
  console.log('✨ Seed completed!');
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
