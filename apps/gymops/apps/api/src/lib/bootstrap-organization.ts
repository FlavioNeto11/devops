import type { PrismaClient, Prisma, VisibilityMode } from '@gymops/db';
import { db } from './prisma.js';
import { logAudit } from './audit.js';

// ── Canonical area catalogue ──────────────────────────────────────────────────

interface AreaDef {
  key: string;
  name: string;
  color: string;
  visibilityDefault: VisibilityMode;
}

const CANONICAL_AREAS: AreaDef[] = [
  { key: 'administrativo', name: 'Administrativo',        color: '#6366f1', visibilityDefault: 'inherited' },
  { key: 'marketing',      name: 'Marketing',             color: '#ec4899', visibilityDefault: 'inherited' },
  { key: 'coordenacao',    name: 'Coordenação',           color: '#f59e0b', visibilityDefault: 'inherited' },
  { key: 'manutencao',     name: 'Estrutura/Manutenção',  color: '#10b981', visibilityDefault: 'inherited' },
  { key: 'financeiro',     name: 'Financeiro',            color: '#3b82f6', visibilityDefault: 'restricted' },
  { key: 'lider',          name: 'Liderança',             color: '#8b5cf6', visibilityDefault: 'restricted' },
];

// ── Canonical template catalogue (24 templates) ───────────────────────────────

interface TemplateDef {
  areaKey: string;
  name: string;
  description: string;
  config: {
    defaultChecklist: string[];
    defaultPriority: string;
    defaultVisibility: string;
    suggestedSlaDays?: number;
    specificFields?: string[];
  };
}

const CANONICAL_TEMPLATES: TemplateDef[] = [
  // ── Administrativo (4) ────────────────────────────────────────────────────
  {
    areaKey: 'administrativo',
    name: 'Conferência mensal de contratos',
    description: 'Revisão e conferência de todos os contratos ativos da unidade',
    config: {
      defaultChecklist: ['Listar contratos ativos', 'Verificar datas de vencimento', 'Conferir valores e cláusulas', 'Sinalizar contratos a renovar', 'Registrar resultado'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 5,
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Renovação de alvará',
    description: 'Processo de renovação de alvará de funcionamento',
    config: {
      defaultChecklist: ['Verificar data de vencimento', 'Reunir documentos necessários', 'Solicitar vistoria se necessário', 'Protocolar na prefeitura', 'Acompanhar processo', 'Retirar alvará'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 30,
      specificFields: ['expiry_date', 'protocol_number'],
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Atualização cadastral de aluno',
    description: 'Atualização de dados cadastrais de alunos na plataforma',
    config: {
      defaultChecklist: ['Solicitar documentos atualizados', 'Atualizar dados no sistema', 'Confirmar contato do aluno', 'Registrar atualização'],
      defaultPriority: 'baixa',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 3,
      specificFields: ['student_name', 'document_type'],
    },
  },
  {
    areaKey: 'administrativo',
    name: 'Auditoria de processos administrativos',
    description: 'Revisão interna de conformidade dos processos administrativos',
    config: {
      defaultChecklist: ['Definir escopo da auditoria', 'Reunir documentação', 'Verificar conformidade', 'Registrar não-conformidades', 'Plano de ação corretiva'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 15,
    },
  },
  // ── Marketing (4) ─────────────────────────────────────────────────────────
  {
    areaKey: 'marketing',
    name: 'Planejar campanha de captação',
    description: 'Planejamento e execução de campanha para captação de novos alunos',
    config: {
      defaultChecklist: ['Definir objetivo e público-alvo', 'Criar brief da campanha', 'Produzir artes/vídeos', 'Revisar conteúdo', 'Aprovar com gestão', 'Publicar nos canais', 'Monitorar engajamento'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
      specificFields: ['platform', 'budget', 'target_audience'],
    },
  },
  {
    areaKey: 'marketing',
    name: 'Pauta de redes sociais (semanal)',
    description: 'Planejamento e publicação da pauta semanal de conteúdo',
    config: {
      defaultChecklist: ['Definir temas da semana', 'Produzir artes', 'Revisar conteúdo', 'Publicar nas plataformas', 'Monitorar métricas'],
      defaultPriority: 'baixa',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 2,
    },
  },
  {
    areaKey: 'marketing',
    name: 'Aprovação de orçamento de mídia',
    description: 'Solicitação e aprovação de verbas para campanhas pagas',
    config: {
      defaultChecklist: ['Elaborar proposta de budget', 'Justificar ROI esperado', 'Submeter para aprovação', 'Registrar aprovação ou recusa'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 3,
      specificFields: ['budget', 'channel', 'expected_reach'],
    },
  },
  {
    areaKey: 'marketing',
    name: 'Relatório de performance mensal',
    description: 'Elaboração do relatório mensal de marketing e resultados',
    config: {
      defaultChecklist: ['Coletar métricas do período', 'Analisar resultados vs. metas', 'Identificar destaques', 'Elaborar relatório', 'Apresentar para gestão'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 5,
    },
  },
  // ── Coordenação (4) ───────────────────────────────────────────────────────
  {
    areaKey: 'coordenacao',
    name: 'Escala semanal de professores',
    description: 'Organização da escala de instrutores para a semana',
    config: {
      defaultChecklist: ['Verificar disponibilidade de instrutores', 'Montar escala por horário', 'Aprovar com coordenação', 'Comunicar instrutores', 'Publicar escala'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 1,
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Treinamento de novo colaborador',
    description: 'Onboarding e treinamento de novos membros da equipe',
    config: {
      defaultChecklist: ['Preparar materiais de treinamento', 'Apresentar unidade e equipe', 'Explicar normas e processos', 'Acompanhar primeiros dias', 'Coletar feedback', 'Avaliar adaptação'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
      specificFields: ['employee_name', 'position', 'start_date'],
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Reunião de alinhamento operacional',
    description: 'Reunião periódica de alinhamento da equipe operacional',
    config: {
      defaultChecklist: ['Definir pauta', 'Confirmar participantes', 'Realizar reunião', 'Registrar decisões e ações', 'Compartilhar ata'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 0,
    },
  },
  {
    areaKey: 'coordenacao',
    name: 'Revisão de processos de atendimento',
    description: 'Auditoria e melhoria dos processos de atendimento ao aluno',
    config: {
      defaultChecklist: ['Mapear processo atual', 'Coletar feedbacks de alunos', 'Identificar pontos de melhoria', 'Propor novo fluxo', 'Treinar equipe', 'Monitorar resultados'],
      defaultPriority: 'baixa',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 15,
    },
  },
  // ── Estrutura/Manutenção (4) ──────────────────────────────────────────────
  {
    areaKey: 'manutencao',
    name: 'Chamado de manutenção corretiva',
    description: 'Para falhas em equipamentos e instalações da unidade',
    config: {
      defaultChecklist: ['Fotografar o equipamento', 'Isolar área de risco', 'Solicitar mínimo 2 orçamentos', 'Aprovar fornecedor', 'Acompanhar execução', 'Testar após reparo'],
      defaultPriority: 'critica',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 2,
      specificFields: ['equipment', 'location', 'supplier', 'criticality'],
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Inspeção preventiva mensal',
    description: 'Checklist mensal de manutenção preventiva de equipamentos e instalações',
    config: {
      defaultChecklist: ['Lubrificar esteiras e bicicletas', 'Verificar cabos e polias', 'Checar extintores', 'Inspecionar chuveiros e vestiários', 'Revisar sistema elétrico'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 7,
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Limpeza profunda',
    description: 'Limpeza profunda de áreas específicas da unidade',
    config: {
      defaultChecklist: ['Definir área e escopo', 'Contratar ou escalar equipe', 'Realizar limpeza', 'Vistoriar resultado', 'Liberar área'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 2,
      specificFields: ['area_affected'],
    },
  },
  {
    areaKey: 'manutencao',
    name: 'Reposição de insumos',
    description: 'Controle e reposição de materiais de limpeza e insumos operacionais',
    config: {
      defaultChecklist: ['Verificar estoque atual', 'Listar itens em falta', 'Solicitar orçamento', 'Aprovar compra', 'Receber e armazenar'],
      defaultPriority: 'media',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 3,
      specificFields: ['items_list', 'supplier'],
    },
  },
  // ── Financeiro (4) ────────────────────────────────────────────────────────
  {
    areaKey: 'financeiro',
    name: 'Fechamento mensal de caixa',
    description: 'Fechamento e conciliação do caixa ao final do mês',
    config: {
      defaultChecklist: ['Exportar relatório de vendas', 'Conciliar com extrato bancário', 'Identificar divergências', 'Corrigir lançamentos', 'Enviar relatório para gestor'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 3,
    },
  },
  {
    areaKey: 'financeiro',
    name: 'Pagamento de fornecedores',
    description: 'Aprovação e pagamento de notas fiscais e boletos de fornecedores',
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
    name: 'Conciliação bancária',
    description: 'Conciliação mensal dos extratos bancários com o sistema',
    config: {
      defaultChecklist: ['Baixar extrato bancário', 'Comparar com lançamentos no sistema', 'Identificar e corrigir divergências', 'Fechar conciliação', 'Arquivar documentação'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 5,
    },
  },
  {
    areaKey: 'financeiro',
    name: 'Relatório financeiro para liderança',
    description: 'Elaboração do relatório financeiro mensal para apresentação à liderança',
    config: {
      defaultChecklist: ['Coletar dados do período', 'Calcular indicadores (receita, inadimplência, margem)', 'Elaborar apresentação', 'Revisar com gestor financeiro', 'Apresentar para liderança'],
      defaultPriority: 'media',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 7,
    },
  },
  // ── Liderança (4) ─────────────────────────────────────────────────────────
  {
    areaKey: 'lider',
    name: 'Reunião de gestão (semanal)',
    description: 'Reunião semanal da equipe de gestão da unidade',
    config: {
      defaultChecklist: ['Definir pauta', 'Confirmar participantes', 'Realizar reunião', 'Registrar decisões e ações', 'Compartilhar ata'],
      defaultPriority: 'alta',
      defaultVisibility: 'inherited',
      suggestedSlaDays: 0,
    },
  },
  {
    areaKey: 'lider',
    name: 'Plano de ação trimestral',
    description: 'Elaboração e acompanhamento do plano de ação trimestral da unidade',
    config: {
      defaultChecklist: ['Analisar resultados do trimestre anterior', 'Definir metas para o próximo trimestre', 'Delegar responsáveis', 'Registrar plano no sistema', 'Revisar mensalmente'],
      defaultPriority: 'media',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 30,
      specificFields: ['reference_quarter', 'main_objective', 'kpi_target'],
    },
  },
  {
    areaKey: 'lider',
    name: 'Avaliação de desempenho de equipe',
    description: 'Avaliação periódica de desempenho dos colaboradores da unidade',
    config: {
      defaultChecklist: ['Definir critérios de avaliação', 'Coletar feedbacks', 'Agendar 1:1 com cada colaborador', 'Registrar avaliação', 'Definir PDI se necessário'],
      defaultPriority: 'media',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 15,
      specificFields: ['employee_name', 'evaluation_period'],
    },
  },
  {
    areaKey: 'lider',
    name: 'Decisão estratégica registrada',
    description: 'Registro formal de decisões estratégicas tomadas pela liderança',
    config: {
      defaultChecklist: ['Descrever contexto da decisão', 'Registrar alternativas consideradas', 'Documentar decisão tomada e justificativa', 'Definir próximos passos', 'Comunicar partes interessadas'],
      defaultPriority: 'alta',
      defaultVisibility: 'restricted',
      suggestedSlaDays: 7,
    },
  },
];

// ── Bootstrap input / result types ────────────────────────────────────────────

export interface BootstrapInput {
  name: string;
  slug: string;
  owner: {
    id?: string;
    name: string;
    email: string;
    passwordHash: string;
  };
  initialUnit?: {
    name: string;
    code?: string;
    address?: string;
  };
  settings?: Record<string, unknown>;
}

export interface BootstrapResult {
  organizationId: string;
  ownerUserId: string;
  areaIds: string[];
  templateIds: string[];
  initialUnitId: string | null;
}

// ── Main function ─────────────────────────────────────────────────────────────

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function bootstrapOrganization(input: BootstrapInput): Promise<BootstrapResult> {
  const result = await db.$transaction(async (tx: TransactionClient) => {
    const { name, slug, owner, initialUnit, settings } = input;

    // 1. Create organization + plan
    const org = await tx.organization.create({
      data: {
        name,
        slug,
        ...(settings ? { settings: settings as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    await tx.organizationPlan.create({ data: { organizationId: org.id } });

    // 2. Create or reuse owner user
    let userId = owner.id;
    if (!userId) {
      const user = await tx.user.create({
        data: { name: owner.name, email: owner.email, passwordHash: owner.passwordHash },
      });
      userId = user.id;
    }

    await tx.membership.create({
      data: {
        userId,
        organizationId: org.id,
        scopeType: 'organization',
        scopeId: org.id,
        role: 'owner',
        grantedBy: userId,
      },
    });

    // 3. Create 6 canonical areas
    const areaIds: string[] = [];
    const areaIdByKey: Record<string, string> = {};

    for (const areaDef of CANONICAL_AREAS) {
      const area = await tx.area.create({
        data: {
          organizationId: org.id,
          key: areaDef.key,
          name: areaDef.name,
          color: areaDef.color,
          visibilityDefault: areaDef.visibilityDefault,
        },
      });
      areaIds.push(area.id);
      areaIdByKey[areaDef.key] = area.id;
    }

    // 4. Create 24 canonical templates
    const templateIds: string[] = [];

    for (const tmpl of CANONICAL_TEMPLATES) {
      const areaId = areaIdByKey[tmpl.areaKey];
      if (!areaId) continue;
      const template = await tx.activityTemplate.create({
        data: {
          organizationId: org.id,
          areaId,
          name: tmpl.name,
          description: tmpl.description,
          config: tmpl.config as unknown as Prisma.InputJsonValue,
          isSystem: true,
        },
      });
      templateIds.push(template.id);
    }

    // 5. Optionally create an initial unit and link all 6 areas
    let initialUnitId: string | null = null;

    if (initialUnit) {
      const unit = await tx.unit.create({
        data: {
          organizationId: org.id,
          name: initialUnit.name,
          code: initialUnit.code,
          address: initialUnit.address,
        },
      });
      initialUnitId = unit.id;

      for (let i = 0; i < areaIds.length; i++) {
        await tx.unitArea.create({
          data: { unitId: unit.id, areaId: areaIds[i]!, order: i, enabled: true },
        });
      }
    }

    return { organizationId: org.id, ownerUserId: userId, areaIds, templateIds, initialUnitId };
  });

  // 6. Audit log (outside transaction so it doesn't block on failure)
  void logAudit({
    organizationId: result.organizationId,
    userId: result.ownerUserId,
    action: 'org.bootstrapped',
    resourceType: 'organization',
    resourceId: result.organizationId,
    metadata: { areaCount: result.areaIds.length, templateCount: result.templateIds.length, hasInitialUnit: !!result.initialUnitId },
  });

  return result;
}

export { CANONICAL_AREAS, CANONICAL_TEMPLATES };
