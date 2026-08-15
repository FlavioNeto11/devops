/**
 * Catálogo RBAC da superfície conversacional (fase 4.5 da cadeia `whatsapp-channel-sicat`).
 *
 * Fonte ÚNICA do que o seed escreve em `access_permissions` / `access_roles` /
 * `access_role_permissions`. O gate (`services/conversation/conversation-policy-service.ts`) NÃO lê
 * daqui — ele deriva as chaves exigidas dos seus próprios mapas de tool/intent. As duas fontes são
 * comparadas por teste (`tests/unit/conversation-permission-catalog.test.js`), nos DOIS sentidos:
 * chave semeada que ninguém exige é ruído; chave exigida que ninguém semeia é quebra silenciosa.
 *
 * Mora em `lib/` de propósito: é consumido por `bootstrap/`, por `repositories/` e por `services/`,
 * e não pode arrastar nenhuma dessas camadas para dentro das outras.
 *
 * ⚠️ `permission_key` é LOAD-BEARING a partir desta fase: é a string que o gate compara, por
 * igualdade EXATA (sem prefixo, sem curinga). `manifest.*` e `manifest.read.all` não concedem nada.
 * A convenção `${resource}.${action}` em minúsculas é a MESMA de `buildPermissionKey`
 * (`services/access-admin-service.ts`), para que uma permissão criada depois pela API administrativa
 * caia no formato que o gate compara.
 */

export type AccessPermissionDefinition = {
  permissionKey: string;
  resource: string;
  action: string;
  description: string;
};

export type AccessRoleDefinition = {
  roleName: string;
  description: string;
  /**
   * Lista LITERAL. Proibido derivar um conjunto do outro (`[...READER, ...ACOES]`): quem mexer no
   * array base alargaria o papel-piso sem perceber. O conjunto exato de `sicat.reader` tem teste.
   */
  permissionKeys: readonly string[];
};

/** Ordem alfabética por `permissionKey` — é a ordem em que o seed grava (evita deadlock api × worker). */
export const CONVERSATION_PERMISSION_CATALOG: readonly AccessPermissionDefinition[] = Object.freeze([
  {
    permissionKey: 'audit.read',
    resource: 'audit',
    action: 'read',
    description: 'Consultar a trilha de auditoria operacional'
  },
  {
    permissionKey: 'manifest.cancel',
    resource: 'manifest',
    action: 'cancel',
    description: 'Cancelar manifesto'
  },
  {
    permissionKey: 'manifest.create',
    resource: 'manifest',
    action: 'create',
    description: 'Criar rascunho ou manifesto a partir de payload'
  },
  {
    permissionKey: 'manifest.print',
    resource: 'manifest',
    action: 'print',
    description: 'Emitir 2a via / imprimir manifesto'
  },
  {
    permissionKey: 'manifest.read',
    resource: 'manifest',
    action: 'read',
    description: 'Consultar manifestos, CDFs, DMR, jobs, catalogos e panorama operacional'
  },
  {
    permissionKey: 'manifest.receive',
    resource: 'manifest',
    action: 'receive',
    description: 'Receber manifesto com recibo'
  },
  {
    permissionKey: 'manifest.replicate',
    resource: 'manifest',
    action: 'replicate',
    description: 'Replicar manifesto (com patch ou segmentado)'
  },
  {
    permissionKey: 'manifest.submit',
    resource: 'manifest',
    action: 'submit',
    description: 'Enviar manifesto a CETESB'
  }
] as const);

/**
 * Papel-PISO. É literalmente o que qualquer pessoa da internet ganha ao usar o auto-cadastro público
 * (`POST /v1/sicat/auth/register`, sem middleware de auth — DL-043). Por isso é somente leitura: se
 * tivesse `manifest.submit`/`manifest.cancel`, liberar ação por WhatsApp (fase 5) seria liberar ação
 * para desconhecidos.
 */
export const FLOOR_ROLE_NAME = 'sicat.reader';

/** Papel de quem opera MTR de fato. Concedido POR UM HUMANO na tela de Acessos — nunca automático. */
export const OPERATOR_ROLE_NAME = 'sicat.operator';

/**
 * Nomes reconhecidos como ADMINISTRADOR GLOBAL. Fonte única de `ADMIN_ROLE_TOKENS`
 * (`services/access-admin-service.ts`) e do filtro de `hasAdminGlobalAccessByUserId`
 * (`repositories/access-admin-repo.ts`).
 *
 * ⚠️ Superfície de escalada: criar papel com qualquer um destes nomes concede a administração
 * inteira. O seed FALHA ALTO se um `role_name` do catálogo colidir com esta lista.
 */
export const ADMIN_ROLE_NAME_ALIASES: readonly string[] = Object.freeze([
  'admin',
  'admin.global',
  'admin_global',
  'role_admin_global'
]);

/** Nome canônico do papel de administração global, usado só no bootstrap de banco NOVO. */
export const CANONICAL_ADMIN_ROLE_NAME = 'admin.global';

/**
 * Chaves que NEGAM mesmo com o catálogo DEGRADADO, ainda que a operação seja LEITURA.
 *
 * O ramo degradado do gate era assimétrico só por `isAction` — e `get_audit_trail` é `isAction:
 * false`. Ou seja: exatamente na situação em que o seed falha (e falhar é NÃO-FATAL por desenho — o
 * boot continua com `console.error`), o único vazamento que motivou criar `audit.read` continuava
 * aberto: um estranho auto-cadastrado pelo endpoint público lia a trilha de auditoria operacional
 * inteira, com `enforce`, pod Ready e 200 na API. `requiresOperationalAccount` devolve `false` para
 * essa tool, então nem conta CETESB era necessária.
 *
 * O custo de continuidade é ZERO: ninguém depende de `get_audit_trail` para o chat funcionar, e
 * negar leitura de auditoria com o catálogo quebrado não tranca o chat — que é a propriedade que o
 * modo degradado existe para preservar.
 *
 * Mantenha esta lista MÍNIMA. Cada chave aqui é uma leitura que deixa de funcionar quando o seed
 * falha; é a troca certa só para dado cuja exposição a desconhecido é o dano principal.
 */
export const DENY_WHEN_CATALOG_DEGRADED: ReadonlySet<string> = Object.freeze(
  new Set<string>(['audit.read'])
) as ReadonlySet<string>;

const ALL_PERMISSION_KEYS: readonly string[] = Object.freeze(
  CONVERSATION_PERMISSION_CATALOG.map((entry) => entry.permissionKey)
);

/**
 * Papéis que o seed cria/reconcilia. `admin.global` NÃO está aqui: ele é ADOTADO por nome (recebe os
 * vínculos), nunca recriado nem reescrito — é a escada de saída do rollback de Nível 0.
 */
export const SEEDED_ACCESS_ROLES: readonly AccessRoleDefinition[] = Object.freeze([
  {
    roleName: FLOOR_ROLE_NAME,
    description: 'Piso de acesso do SICAT: consulta no chat, sem nenhuma acao operacional',
    permissionKeys: Object.freeze(['manifest.read'])
  },
  {
    roleName: OPERATOR_ROLE_NAME,
    description: 'Operacao de MTR no chat: consulta e acoes (enviar, imprimir, cancelar, replicar, criar, receber)',
    /**
     * ⚠️ POLÍTICA, não redundância: esta lista é LITERAL de propósito e NÃO deve virar
     * `[...ALL_PERMISSION_KEYS]`, ainda que hoje as duas sejam idênticas.
     *
     * Trocar por uma derivação do catálogo muda a política de "o operador tem ESTAS oito chaves" para
     * "o operador tem TUDO o que existir no catálogo" — e aí acrescentar uma chave nova (a fase 4.6 já
     * prevê `cdf.download`) ALARGARIA o operador automaticamente, num commit cujo diff diz apenas
     * "nova permissão". Alargamento de papel tem de ser uma decisão escrita, revisável no diff.
     *
     * `admin.global` é o único conjunto derivado (`listAdminRolePermissionKeys`), e ali é intencional:
     * administrador que perde chave nova fica sem chat no flip.
     */
    permissionKeys: Object.freeze([
      'audit.read',
      'manifest.cancel',
      'manifest.create',
      'manifest.print',
      'manifest.read',
      'manifest.receive',
      'manifest.replicate',
      'manifest.submit'
    ])
  }
] as const);

/** Chaves do catálogo, em ordem alfabética. */
export function listCatalogPermissionKeys(): string[] {
  return [...ALL_PERMISSION_KEYS].sort();
}

/** Conjunto de chaves que o papel `admin.global` (e aliases) recebe: o catálogo inteiro. */
export function listAdminRolePermissionKeys(): string[] {
  return listCatalogPermissionKeys();
}

/**
 * Chaves DECLARADAS do papel-piso — hoje só `manifest.read`.
 *
 * Existe porque o piso é o que o auto-cadastro PÚBLICO concede: qualquer chave a mais nele é uma
 * chave concedida à internet inteira. É a linha de base contra a qual o boot compara o estado REAL do
 * banco (`FLOOR_ROLE_EXTRA_PERMISSIONS_SQL`) para emitir a testemunha de alargamento.
 */
export function listFloorRolePermissionKeys(): string[] {
  const floorRole = SEEDED_ACCESS_ROLES.find((role) => role.roleName === FLOOR_ROLE_NAME);
  return [...(floorRole?.permissionKeys ?? [])].sort();
}
