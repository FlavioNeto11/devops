import type { ConversationToolInventoryItem, ConversationToolName } from './tool-types.js';

const TOOL_INVENTORY: Record<ConversationToolName, ConversationToolInventoryItem> = {
  orchestrate_manifest_operation: {
    toolName: 'orchestrate_manifest_operation',
    category: 'orchestration',
    objective: 'Executar intents compostos de manifesto preservando memoria e recencia.',
    dependencies: ['manifest-service', 'job-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_manifests: {
    toolName: 'list_manifests',
    category: 'manifest',
    objective: 'Listar manifestos por contexto operacional.',
    dependencies: ['manifest-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  get_manifest_details: {
    toolName: 'get_manifest_details',
    category: 'manifest',
    objective: 'Consultar detalhe operacional de manifesto.',
    dependencies: ['manifest-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_manifest_documents: {
    toolName: 'list_manifest_documents',
    category: 'manifest',
    objective: 'Listar ciclo de documentos de um manifesto (PDF/ZIP e status).',
    dependencies: ['manifest-repo', 'conversation-artifacts'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_cdf_certificates: {
    toolName: 'list_cdf_certificates',
    category: 'cdf',
    objective: 'Consultar lista de certificados CDF/CDR por conta e periodo. Aceita qualquer intervalo (fatiado automaticamente em janelas de 31 dias); ferramenta correta para existencia/recencia de CDFs.',
    dependencies: ['manifest-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  enqueue_cdf_download: {
    toolName: 'enqueue_cdf_download',
    category: 'cdf',
    objective: 'Enfileirar download de CDF/CDR selecionado.',
    dependencies: ['manifest-service', 'job-service'],
    policy: {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    }
  },
  get_job_status: {
    toolName: 'get_job_status',
    category: 'jobs',
    objective: 'Consultar status de job assincrono.',
    dependencies: ['job-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_jobs: {
    toolName: 'list_jobs',
    category: 'jobs',
    objective: 'Listar jobs operacionais com filtros e status.',
    dependencies: ['operations-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  get_audit_trail: {
    toolName: 'get_audit_trail',
    category: 'audit',
    objective: 'Consultar trilha de auditoria por correlationId.',
    dependencies: ['audit-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  query_catalog: {
    toolName: 'query_catalog',
    category: 'catalog',
    objective: 'Consultar catalogos operacionais por termo e versao.',
    dependencies: ['catalog-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  search_partners: {
    toolName: 'search_partners',
    category: 'partner',
    objective: 'Pesquisar parceiros por papel, documento e descricao.',
    dependencies: ['partner-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  get_operations_overview: {
    toolName: 'get_operations_overview',
    category: 'operations',
    objective: 'Consultar panorama operacional (jobs, sessoes, erros e DLQ).',
    dependencies: ['operations-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_dmr: {
    toolName: 'list_dmr',
    category: 'dmr',
    objective: 'Listar declaracoes DMR para acompanhamento operacional.',
    dependencies: ['dmr-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  list_mtr_provisorio: {
    toolName: 'list_mtr_provisorio',
    category: 'mtr_provisorio',
    objective: 'Listar MTR provisorio por filtros operacionais.',
    dependencies: ['mtr-provisorio-service'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  get_dashboard_overview: {
    toolName: 'get_dashboard_overview',
    category: 'dashboard',
    objective: 'Exibir resumo operacional da plataforma.',
    dependencies: ['health-repo'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  diagnose_operation: {
    toolName: 'diagnose_operation',
    category: 'operations',
    objective: 'Diagnóstico operacional multi-step (loop agêntico read-only) com raciocínio entre passos.',
    dependencies: ['manifest-service', 'operations-service', 'health-repo'],
    policy: {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    }
  },
  replicate_manifest: {
    toolName: 'replicate_manifest',
    category: 'manifest',
    objective: 'Replicar manifesto com patch operacional.',
    dependencies: ['manifest-service'],
    policy: {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    }
  },
  submit_manifest: {
    toolName: 'submit_manifest',
    category: 'manifest',
    objective: 'Submeter manifesto para CETESB.',
    dependencies: ['manifest-service', 'job-service'],
    policy: {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    }
  },
  print_manifest: {
    toolName: 'print_manifest',
    category: 'manifest',
    objective: 'Enfileirar impressao de manifesto.',
    dependencies: ['manifest-service', 'job-service'],
    policy: {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    }
  },
  cancel_manifest: {
    toolName: 'cancel_manifest',
    category: 'manifest',
    objective: 'Cancelar manifesto com rastreabilidade.',
    dependencies: ['manifest-service', 'job-service'],
    policy: {
      riskLevel: 'R4',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    }
  }
};

export function getConversationToolInventory() {
  return Object.values(TOOL_INVENTORY);
}

export function getConversationToolInventoryItem(toolName: string): ConversationToolInventoryItem | null {
  if (!Object.hasOwn(TOOL_INVENTORY, toolName)) {
    return null;
  }
  return TOOL_INVENTORY[toolName as ConversationToolName];
}

export function isRegisteredConversationTool(toolName: string): toolName is ConversationToolName {
  return Object.hasOwn(TOOL_INVENTORY, toolName);
}
