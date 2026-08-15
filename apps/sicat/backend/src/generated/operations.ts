export interface OperationDefinition {
  readonly key: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';
  readonly specPath: string;
  readonly expressPath: string;
  readonly summary: string;
  readonly tag: string;
  readonly successStatus: number;
}

const operationsData = [
  {
    "key": "post_v1_auth_login",
    "method": "post",
    "specPath": "/v1/auth/login",
    "expressPath": "/v1/auth/login",
    "summary": "Login com usuário e senha",
    "tag": "Authentication",
    "successStatus": 200
  },
  {
    "key": "get_v1_auth_partner_info",
    "method": "get",
    "specPath": "/v1/auth/partner-info",
    "expressPath": "/v1/auth/partner-info",
    "summary": "Buscar informações do parceiro por documento",
    "tag": "Authentication",
    "successStatus": 200
  },
  {
    "key": "post_v1_sicat_auth_login",
    "method": "post",
    "specPath": "/v1/sicat/auth/login",
    "expressPath": "/v1/sicat/auth/login",
    "summary": "Login inicial no SICAT",
    "tag": "SICAT Authentication",
    "successStatus": 200
  },
  {
    "key": "post_v1_sicat_auth_register",
    "method": "post",
    "specPath": "/v1/sicat/auth/register",
    "expressPath": "/v1/sicat/auth/register",
    "summary": "Registrar novo usuário SICAT",
    "tag": "SICAT Authentication",
    "successStatus": 201
  },
  {
    "key": "post_v1_sicat_auth_refresh",
    "method": "post",
    "specPath": "/v1/sicat/auth/refresh",
    "expressPath": "/v1/sicat/auth/refresh",
    "summary": "Renovar sessão SICAT",
    "tag": "SICAT Authentication",
    "successStatus": 200
  },
  {
    "key": "post_v1_sicat_auth_keycloak",
    "method": "post",
    "specPath": "/v1/sicat/auth/keycloak",
    "expressPath": "/v1/sicat/auth/keycloak",
    "summary": "Login no SICAT via SSO Keycloak (OIDC)",
    "tag": "SICAT Authentication",
    "successStatus": 200
  },
  {
    "key": "get_v1_sicat_cetesb_accounts",
    "method": "get",
    "specPath": "/v1/sicat/cetesb-accounts",
    "expressPath": "/v1/sicat/cetesb-accounts",
    "summary": "Listar contas CETESB vinculadas ao usuário SICAT",
    "tag": "SICAT CETESB Accounts",
    "successStatus": 200
  },
  {
    "key": "post_v1_sicat_cetesb_accounts",
    "method": "post",
    "specPath": "/v1/sicat/cetesb-accounts",
    "expressPath": "/v1/sicat/cetesb-accounts",
    "summary": "Vincular nova conta CETESB ao usuário SICAT",
    "tag": "SICAT CETESB Accounts",
    "successStatus": 201
  },
  {
    "key": "post_v1_sicat_cetesb_accounts_accountId_activate",
    "method": "post",
    "specPath": "/v1/sicat/cetesb-accounts/{accountId}/activate",
    "expressPath": "/v1/sicat/cetesb-accounts/:accountId/activate",
    "summary": "Definir conta CETESB ativa",
    "tag": "SICAT CETESB Accounts",
    "successStatus": 200
  },
  {
    "key": "delete_v1_sicat_cetesb_accounts_accountId",
    "method": "delete",
    "specPath": "/v1/sicat/cetesb-accounts/{accountId}",
    "expressPath": "/v1/sicat/cetesb-accounts/:accountId",
    "summary": "Remover conta CETESB vinculada ao usuário SICAT",
    "tag": "SICAT CETESB Accounts",
    "successStatus": 200
  },
  {
    "key": "get_v1_sicat_session",
    "method": "get",
    "specPath": "/v1/sicat/session",
    "expressPath": "/v1/sicat/session",
    "summary": "Obter sessão atual do SICAT",
    "tag": "SICAT CETESB Accounts",
    "successStatus": 200
  },
  {
    "key": "get_v1_admin_access_users",
    "method": "get",
    "specPath": "/v1/admin/access/users",
    "expressPath": "/v1/admin/access/users",
    "summary": "Listar usuários para administração de acesso",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "get_v1_admin_access_users_userId",
    "method": "get",
    "specPath": "/v1/admin/access/users/{userId}",
    "expressPath": "/v1/admin/access/users/:userId",
    "summary": "Consultar usuário para administração de acesso",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_users_userId_roles_roleId_grant",
    "method": "post",
    "specPath": "/v1/admin/access/users/{userId}/roles/{roleId}/grant",
    "expressPath": "/v1/admin/access/users/:userId/roles/:roleId/grant",
    "summary": "Conceder perfil administrativo para usuário",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_users_userId_roles_roleId_revoke",
    "method": "post",
    "specPath": "/v1/admin/access/users/{userId}/roles/{roleId}/revoke",
    "expressPath": "/v1/admin/access/users/:userId/roles/:roleId/revoke",
    "summary": "Revogar perfil administrativo de usuário",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_users_userId_password_reset",
    "method": "post",
    "specPath": "/v1/admin/access/users/{userId}/password/reset",
    "expressPath": "/v1/admin/access/users/:userId/password/reset",
    "summary": "Resetar senha SICAT de usuário",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_users_userId_password_expire",
    "method": "post",
    "specPath": "/v1/admin/access/users/{userId}/password/expire",
    "expressPath": "/v1/admin/access/users/:userId/password/expire",
    "summary": "Expirar senha SICAT de usuário",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "get_v1_admin_access_roles",
    "method": "get",
    "specPath": "/v1/admin/access/roles",
    "expressPath": "/v1/admin/access/roles",
    "summary": "Listar perfis para administração de acesso",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_roles",
    "method": "post",
    "specPath": "/v1/admin/access/roles",
    "expressPath": "/v1/admin/access/roles",
    "summary": "Criar perfil administrativo",
    "tag": "Admin Access",
    "successStatus": 201
  },
  {
    "key": "get_v1_admin_access_roles_roleId",
    "method": "get",
    "specPath": "/v1/admin/access/roles/{roleId}",
    "expressPath": "/v1/admin/access/roles/:roleId",
    "summary": "Consultar perfil administrativo",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "patch_v1_admin_access_roles_roleId",
    "method": "patch",
    "specPath": "/v1/admin/access/roles/{roleId}",
    "expressPath": "/v1/admin/access/roles/:roleId",
    "summary": "Atualizar perfil administrativo",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "delete_v1_admin_access_roles_roleId",
    "method": "delete",
    "specPath": "/v1/admin/access/roles/{roleId}",
    "expressPath": "/v1/admin/access/roles/:roleId",
    "summary": "Remover perfil administrativo",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "get_v1_admin_access_permissions",
    "method": "get",
    "specPath": "/v1/admin/access/permissions",
    "expressPath": "/v1/admin/access/permissions",
    "summary": "Listar permissões para administração de acesso",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_access_permissions",
    "method": "post",
    "specPath": "/v1/admin/access/permissions",
    "expressPath": "/v1/admin/access/permissions",
    "summary": "Criar permissão administrativa",
    "tag": "Admin Access",
    "successStatus": 201
  },
  {
    "key": "get_v1_admin_access_permissions_permissionId",
    "method": "get",
    "specPath": "/v1/admin/access/permissions/{permissionId}",
    "expressPath": "/v1/admin/access/permissions/:permissionId",
    "summary": "Consultar permissão administrativa",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "patch_v1_admin_access_permissions_permissionId",
    "method": "patch",
    "specPath": "/v1/admin/access/permissions/{permissionId}",
    "expressPath": "/v1/admin/access/permissions/:permissionId",
    "summary": "Atualizar permissão administrativa",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "delete_v1_admin_access_permissions_permissionId",
    "method": "delete",
    "specPath": "/v1/admin/access/permissions/{permissionId}",
    "expressPath": "/v1/admin/access/permissions/:permissionId",
    "summary": "Remover permissão administrativa",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "get_v1_admin_access_sessions",
    "method": "get",
    "specPath": "/v1/admin/access/sessions",
    "expressPath": "/v1/admin/access/sessions",
    "summary": "Listar sessões para operação administrativa",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_admin_channel_links_shield_waive",
    "method": "post",
    "specPath": "/v1/admin/channel-links/shield/waive",
    "expressPath": "/v1/admin/channel-links/shield/waive",
    "summary": "Liberar um telefone do escudo anti-bombing do vínculo de canal",
    "tag": "Admin Access",
    "successStatus": 200
  },
  {
    "key": "post_v1_session_contexts",
    "method": "post",
    "specPath": "/v1/session-contexts",
    "expressPath": "/v1/session-contexts",
    "summary": "Registrar ou atualizar contexto de sessão",
    "tag": "Session Contexts",
    "successStatus": 201
  },
  {
    "key": "get_v1_session_contexts_id",
    "method": "get",
    "specPath": "/v1/session-contexts/{id}",
    "expressPath": "/v1/session-contexts/:id",
    "summary": "Consultar contexto de sessão",
    "tag": "Session Contexts",
    "successStatus": 200
  },
  {
    "key": "post_v1_catalog_sync",
    "method": "post",
    "specPath": "/v1/catalog-sync",
    "expressPath": "/v1/catalog-sync",
    "summary": "Disparar sincronização de catálogos",
    "tag": "Catalogs",
    "successStatus": 202
  },
  {
    "key": "get_v1_catalogs_catalogName",
    "method": "get",
    "specPath": "/v1/catalogs/{catalogName}",
    "expressPath": "/v1/catalogs/:catalogName",
    "summary": "Consultar catálogo local",
    "tag": "Catalogs",
    "successStatus": 200
  },
  {
    "key": "get_v1_partners_search",
    "method": "get",
    "specPath": "/v1/partners/search",
    "expressPath": "/v1/partners/search",
    "summary": "Pesquisar parceiro",
    "tag": "Partners",
    "successStatus": 200
  },
  {
    "key": "post_v1_cadastros",
    "method": "post",
    "specPath": "/v1/cadastros",
    "expressPath": "/v1/cadastros",
    "summary": "Solicitar cadastro",
    "tag": "Cadastros",
    "successStatus": 202
  },
  {
    "key": "get_v1_cadastros_id",
    "method": "get",
    "specPath": "/v1/cadastros/{id}",
    "expressPath": "/v1/cadastros/:id",
    "summary": "Consultar cadastro",
    "tag": "Cadastros",
    "successStatus": 200
  },
  {
    "key": "post_v1_manifestos",
    "method": "post",
    "specPath": "/v1/manifestos",
    "expressPath": "/v1/manifestos",
    "summary": "Criar draft interno de manifesto",
    "tag": "Manifestos",
    "successStatus": 201
  },
  {
    "key": "get_v1_manifestos",
    "method": "get",
    "specPath": "/v1/manifestos",
    "expressPath": "/v1/manifestos",
    "summary": "Pesquisar manifestos",
    "tag": "Manifestos",
    "successStatus": 200
  },
  {
    "key": "post_v1_manifestos_batch_create",
    "method": "post",
    "specPath": "/v1/manifestos/batch-create",
    "expressPath": "/v1/manifestos/batch-create",
    "summary": "Criar lote homogêneo de drafts de manifesto",
    "tag": "Manifestos",
    "successStatus": 201
  },
  {
    "key": "post_v1_manifestos_batch_submit",
    "method": "post",
    "specPath": "/v1/manifestos/batch-submit",
    "expressPath": "/v1/manifestos/batch-submit",
    "summary": "Solicitar submissão em lote de manifestos",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "post_v1_manifestos_batch_cancel",
    "method": "post",
    "specPath": "/v1/manifestos/batch-cancel",
    "expressPath": "/v1/manifestos/batch-cancel",
    "summary": "Solicitar cancelamento em lote de manifestos",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "get_v1_manifestos_receipt_responsibles",
    "method": "get",
    "specPath": "/v1/manifestos/receipt-responsibles",
    "expressPath": "/v1/manifestos/receipt-responsibles",
    "summary": "Listar responsáveis pelo recebimento",
    "tag": "Manifestos",
    "successStatus": 200
  },
  {
    "key": "get_v1_manifestos_id",
    "method": "get",
    "specPath": "/v1/manifestos/{id}",
    "expressPath": "/v1/manifestos/:id",
    "summary": "Consultar manifesto",
    "tag": "Manifestos",
    "successStatus": 200
  },
  {
    "key": "delete_v1_manifestos_id",
    "method": "delete",
    "specPath": "/v1/manifestos/{id}",
    "expressPath": "/v1/manifestos/:id",
    "summary": "Remover manifesto com falha",
    "tag": "Manifestos",
    "successStatus": 200
  },
  {
    "key": "post_v1_manifestos_id_replicate",
    "method": "post",
    "specPath": "/v1/manifestos/{id}/replicate",
    "expressPath": "/v1/manifestos/:id/replicate",
    "summary": "Replicar manifesto em lote",
    "tag": "Manifestos",
    "successStatus": 201
  },
  {
    "key": "post_v1_manifestos_id_submit",
    "method": "post",
    "specPath": "/v1/manifestos/{id}/submit",
    "expressPath": "/v1/manifestos/:id/submit",
    "summary": "Submeter manifesto",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "post_v1_manifestos_id_print",
    "method": "post",
    "specPath": "/v1/manifestos/{id}/print",
    "expressPath": "/v1/manifestos/:id/print",
    "summary": "Solicitar impressão",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "post_v1_manifestos_id_cancel",
    "method": "post",
    "specPath": "/v1/manifestos/{id}/cancel",
    "expressPath": "/v1/manifestos/:id/cancel",
    "summary": "Solicitar cancelamento com rastreamento de auditoria",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "get_v1_manifestos_id_documents_documentId",
    "method": "get",
    "specPath": "/v1/manifestos/{id}/documents/{documentId}",
    "expressPath": "/v1/manifestos/:id/documents/:documentId",
    "summary": "Baixar documento do manifesto",
    "tag": "Manifestos",
    "successStatus": 200
  },
  {
    "key": "post_v1_manifestos_receive",
    "method": "post",
    "specPath": "/v1/manifestos/receive",
    "expressPath": "/v1/manifestos/receive",
    "summary": "Solicitar recebimento de manifesto",
    "tag": "Manifestos",
    "successStatus": 202
  },
  {
    "key": "get_v1_cdf_responsibles",
    "method": "get",
    "specPath": "/v1/cdf/responsibles",
    "expressPath": "/v1/cdf/responsibles",
    "summary": "Listar responsáveis pela emissão de CDF",
    "tag": "CDF",
    "successStatus": 200
  },
  {
    "key": "post_v1_cdf_generate",
    "method": "post",
    "specPath": "/v1/cdf/generate",
    "expressPath": "/v1/cdf/generate",
    "summary": "Solicitar geração de CDF",
    "tag": "CDF",
    "successStatus": 202
  },
  {
    "key": "post_v1_cdf_download",
    "method": "post",
    "specPath": "/v1/cdf/download",
    "expressPath": "/v1/cdf/download",
    "summary": "Solicitar download assíncrono de CDF",
    "tag": "CDF",
    "successStatus": 202
  },
  {
    "key": "get_v1_cdf_certificates",
    "method": "get",
    "specPath": "/v1/cdf/certificates",
    "expressPath": "/v1/cdf/certificates",
    "summary": "Listar certificados CDF remotos",
    "tag": "CDF",
    "successStatus": 200
  },
  {
    "key": "get_v1_cdf_documents_documentId",
    "method": "get",
    "specPath": "/v1/cdf/documents/{documentId}",
    "expressPath": "/v1/cdf/documents/:documentId",
    "summary": "Baixar PDF remoto de CDF",
    "tag": "CDF",
    "successStatus": 200
  },
  {
    "key": "get_v1_jobs_jobId",
    "method": "get",
    "specPath": "/v1/jobs/{jobId}",
    "expressPath": "/v1/jobs/:jobId",
    "summary": "Consultar job",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "get_v1_jobs_jobId_events",
    "method": "get",
    "specPath": "/v1/jobs/{jobId}/events",
    "expressPath": "/v1/jobs/:jobId/events",
    "summary": "Stream de eventos de job",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "get_v1_audit_correlationId",
    "method": "get",
    "specPath": "/v1/audit/{correlationId}",
    "expressPath": "/v1/audit/:correlationId",
    "summary": "Consultar trilha técnica",
    "tag": "Audit",
    "successStatus": 200
  },
  {
    "key": "get_v1_ping",
    "method": "get",
    "specPath": "/v1/ping",
    "expressPath": "/v1/ping",
    "summary": "Health check simples para load balancers",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_system",
    "method": "get",
    "specPath": "/v1/health/system",
    "expressPath": "/v1/health/system",
    "summary": "Verificar saúde geral do sistema",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_workers",
    "method": "get",
    "specPath": "/v1/health/workers",
    "expressPath": "/v1/health/workers",
    "summary": "Verificar saúde e estatísticas dos workers",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_jobs_active",
    "method": "get",
    "specPath": "/v1/health/jobs/active",
    "expressPath": "/v1/health/jobs/active",
    "summary": "Verificar jobs em execução",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "post_v1_health_jobs_active_jobId_cancel",
    "method": "post",
    "specPath": "/v1/health/jobs/active/{jobId}/cancel",
    "expressPath": "/v1/health/jobs/active/:jobId/cancel",
    "summary": "Cancelar job da fila ativa",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "delete_v1_health_jobs_active_jobId",
    "method": "delete",
    "specPath": "/v1/health/jobs/active/{jobId}",
    "expressPath": "/v1/health/jobs/active/:jobId",
    "summary": "Remover job da fila ativa",
    "tag": "Health",
    "successStatus": 204
  },
  {
    "key": "get_v1_health_jobs_dlq",
    "method": "get",
    "specPath": "/v1/health/jobs/dlq",
    "expressPath": "/v1/health/jobs/dlq",
    "summary": "Verificar jobs em dead letter queue",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "post_v1_health_jobs_dlq_jobId_requeue",
    "method": "post",
    "specPath": "/v1/health/jobs/dlq/{jobId}/requeue",
    "expressPath": "/v1/health/jobs/dlq/:jobId/requeue",
    "summary": "Reprocessar job da DLQ",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "delete_v1_health_jobs_dlq_jobId",
    "method": "delete",
    "specPath": "/v1/health/jobs/dlq/{jobId}",
    "expressPath": "/v1/health/jobs/dlq/:jobId",
    "summary": "Descartar job da DLQ",
    "tag": "Health",
    "successStatus": 204
  },
  {
    "key": "get_v1_health_metrics_performance",
    "method": "get",
    "specPath": "/v1/health/metrics/performance",
    "expressPath": "/v1/health/metrics/performance",
    "summary": "Verificar métricas de performance",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_metrics_timeline",
    "method": "get",
    "specPath": "/v1/health/metrics/timeline",
    "expressPath": "/v1/health/metrics/timeline",
    "summary": "Verificar tendência temporal de jobs",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_metrics_endpoints",
    "method": "get",
    "specPath": "/v1/health/metrics/endpoints",
    "expressPath": "/v1/health/metrics/endpoints",
    "summary": "Verificar ranking de latência CETESB",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_dashboard_overview",
    "method": "get",
    "specPath": "/v1/dashboard/overview",
    "expressPath": "/v1/dashboard/overview",
    "summary": "Resumo consolidado do dashboard operacional",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "post_v1_maintenance_cleanup",
    "method": "post",
    "specPath": "/v1/maintenance/cleanup",
    "expressPath": "/v1/maintenance/cleanup",
    "summary": "Disparar limpeza de jobs antigos",
    "tag": "Health",
    "successStatus": 202
  },
  {
    "key": "get_v1_operations_overview",
    "method": "get",
    "specPath": "/v1/operations/overview",
    "expressPath": "/v1/operations/overview",
    "summary": "Visão consolidada operacional (jobs, manifestos, contas, sessões)",
    "tag": "Operations",
    "successStatus": 200
  },
  {
    "key": "get_v1_jobs_search",
    "method": "get",
    "specPath": "/v1/jobs/search",
    "expressPath": "/v1/jobs/search",
    "summary": "Buscar jobs com filtros operacionais",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "post_v1_jobs_jobId_retry",
    "method": "post",
    "specPath": "/v1/jobs/{jobId}/retry",
    "expressPath": "/v1/jobs/:jobId/retry",
    "summary": "Reprocessar job (failed, cancelled ou DLQ)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "get_v1_audit_search",
    "method": "get",
    "specPath": "/v1/audit/search",
    "expressPath": "/v1/audit/search",
    "summary": "Buscar entradas de auditoria",
    "tag": "Audit",
    "successStatus": 200
  },
  {
    "key": "get_v1_cetesb_accounts_health",
    "method": "get",
    "specPath": "/v1/cetesb/accounts/health",
    "expressPath": "/v1/cetesb/accounts/health",
    "summary": "Saúde das contas CETESB (derivada local)",
    "tag": "CETESB",
    "successStatus": 200
  },
  {
    "key": "get_v1_cetesb_sessions_health",
    "method": "get",
    "specPath": "/v1/cetesb/sessions/health",
    "expressPath": "/v1/cetesb/sessions/health",
    "summary": "Saúde das sessões CETESB (derivada local)",
    "tag": "CETESB",
    "successStatus": 200
  },
  {
    "key": "get_v1_reports_mtrs",
    "method": "get",
    "specPath": "/v1/reports/mtrs",
    "expressPath": "/v1/reports/mtrs",
    "summary": "Relatório de manifestos (MTRs)",
    "tag": "Reports",
    "successStatus": 200
  },
  {
    "key": "get_v1_reports_mtrs_export",
    "method": "get",
    "specPath": "/v1/reports/mtrs/export",
    "expressPath": "/v1/reports/mtrs/export",
    "summary": "Exportar relatório de manifestos em CSV",
    "tag": "Reports",
    "successStatus": 200
  },
  {
    "key": "get_v1_dmr",
    "method": "get",
    "specPath": "/v1/dmr",
    "expressPath": "/v1/dmr",
    "summary": "Listar declarações DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "post_v1_dmr",
    "method": "post",
    "specPath": "/v1/dmr",
    "expressPath": "/v1/dmr",
    "summary": "Criar declaração DMR (rascunho)",
    "tag": "DMR",
    "successStatus": 201
  },
  {
    "key": "get_v1_dmr_pendentes",
    "method": "get",
    "specPath": "/v1/dmr/pendentes",
    "expressPath": "/v1/dmr/pendentes",
    "summary": "Listar DMRs pendentes",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "get_v1_dmr_dmrId",
    "method": "get",
    "specPath": "/v1/dmr/{dmrId}",
    "expressPath": "/v1/dmr/:dmrId",
    "summary": "Detalhar DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "delete_v1_dmr_dmrId",
    "method": "delete",
    "specPath": "/v1/dmr/{dmrId}",
    "expressPath": "/v1/dmr/:dmrId",
    "summary": "Cancelar rascunho DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "post_v1_dmr_dmrId_consolidate",
    "method": "post",
    "specPath": "/v1/dmr/{dmrId}/consolidate",
    "expressPath": "/v1/dmr/:dmrId/consolidate",
    "summary": "Consolidar DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "post_v1_dmr_dmrId_submit",
    "method": "post",
    "specPath": "/v1/dmr/{dmrId}/submit",
    "expressPath": "/v1/dmr/:dmrId/submit",
    "summary": "Submeter DMR",
    "tag": "DMR",
    "successStatus": 202
  },
  {
    "key": "get_v1_dmr_dmrId_status",
    "method": "get",
    "specPath": "/v1/dmr/{dmrId}/status",
    "expressPath": "/v1/dmr/:dmrId/status",
    "summary": "Status enriquecido da DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "get_v1_dmr_dmrId_items",
    "method": "get",
    "specPath": "/v1/dmr/{dmrId}/items",
    "expressPath": "/v1/dmr/:dmrId/items",
    "summary": "Listar itens consolidados da DMR",
    "tag": "DMR",
    "successStatus": 200
  },
  {
    "key": "post_v1_dmr_dmrId_items",
    "method": "post",
    "specPath": "/v1/dmr/{dmrId}/items",
    "expressPath": "/v1/dmr/:dmrId/items",
    "summary": "Adicionar item manual à DMR",
    "tag": "DMR",
    "successStatus": 201
  },
  {
    "key": "delete_v1_dmr_dmrId_items_itemId",
    "method": "delete",
    "specPath": "/v1/dmr/{dmrId}/items/{itemId}",
    "expressPath": "/v1/dmr/:dmrId/items/:itemId",
    "summary": "Remover item da DMR",
    "tag": "DMR",
    "successStatus": 204
  },
  {
    "key": "get_v1_mtr_provisorio",
    "method": "get",
    "specPath": "/v1/mtr-provisorio",
    "expressPath": "/v1/mtr-provisorio",
    "summary": "Listar manifestos provisórios",
    "tag": "MTR Provisorio",
    "successStatus": 200
  },
  {
    "key": "post_v1_mtr_provisorio",
    "method": "post",
    "specPath": "/v1/mtr-provisorio",
    "expressPath": "/v1/mtr-provisorio",
    "summary": "Criar manifesto provisório (assíncrono)",
    "tag": "MTR Provisorio",
    "successStatus": 202
  },
  {
    "key": "get_v1_mtr_provisorio_id",
    "method": "get",
    "specPath": "/v1/mtr-provisorio/{id}",
    "expressPath": "/v1/mtr-provisorio/:id",
    "summary": "Detalhar manifesto provisório",
    "tag": "MTR Provisorio",
    "successStatus": 200
  },
  {
    "key": "delete_v1_mtr_provisorio_id",
    "method": "delete",
    "specPath": "/v1/mtr-provisorio/{id}",
    "expressPath": "/v1/mtr-provisorio/:id",
    "summary": "Cancelar rascunho de manifesto provisório",
    "tag": "MTR Provisorio",
    "successStatus": 200
  },
  {
    "key": "post_v1_mtr_provisorio_id_print",
    "method": "post",
    "specPath": "/v1/mtr-provisorio/{id}/print",
    "expressPath": "/v1/mtr-provisorio/:id/print",
    "summary": "Imprimir manifesto provisório (assíncrono)",
    "tag": "MTR Provisorio",
    "successStatus": 202
  },
  {
    "key": "get_v1_conversations_tools",
    "method": "get",
    "specPath": "/v1/conversations/tools",
    "expressPath": "/v1/conversations/tools",
    "summary": "Listar tools conversacionais e a política efetiva de cada uma",
    "tag": "Conversations",
    "successStatus": 200
  },
  {
    "key": "get_v1_conversations_artifacts_artifactId",
    "method": "get",
    "specPath": "/v1/conversations/artifacts/{artifactId}",
    "expressPath": "/v1/conversations/artifacts/:artifactId",
    "summary": "Consultar o status de um artefato conversacional",
    "tag": "Conversations",
    "successStatus": 200
  },
  {
    "key": "get_v1_conversations_artifacts_artifactId_content",
    "method": "get",
    "specPath": "/v1/conversations/artifacts/{artifactId}/content",
    "expressPath": "/v1/conversations/artifacts/:artifactId/content",
    "summary": "Baixar o conteúdo binário de um artefato conversacional",
    "tag": "Conversations",
    "successStatus": 200
  },
  {
    "key": "post_v1_conversations_feedback",
    "method": "post",
    "specPath": "/v1/conversations/feedback",
    "expressPath": "/v1/conversations/feedback",
    "summary": "Registrar feedback 👍/👎 de uma resposta da IA",
    "tag": "Conversations",
    "successStatus": 201
  },
  {
    "key": "post_v1_conversations_turns",
    "method": "post",
    "specPath": "/v1/conversations/turns",
    "expressPath": "/v1/conversations/turns",
    "summary": "Executar um turno conversacional",
    "tag": "Conversations",
    "successStatus": 200
  },
  {
    "key": "get_v1_sicat_channel_links",
    "method": "get",
    "specPath": "/v1/sicat/channel-links",
    "expressPath": "/v1/sicat/channel-links",
    "summary": "Listar vínculos de canal do usuário autenticado",
    "tag": "SICAT Channel Links",
    "successStatus": 200
  },
  {
    "key": "post_v1_sicat_channel_links",
    "method": "post",
    "specPath": "/v1/sicat/channel-links",
    "expressPath": "/v1/sicat/channel-links",
    "summary": "Iniciar a vinculação de um telefone por OTP",
    "tag": "SICAT Channel Links",
    "successStatus": 202
  },
  {
    "key": "post_v1_sicat_channel_links_whatsapp_action_window",
    "method": "post",
    "specPath": "/v1/sicat/channel-links/whatsapp/action-window",
    "expressPath": "/v1/sicat/channel-links/whatsapp/action-window",
    "summary": "Abrir a janela de liberação de ações pelo WhatsApp",
    "tag": "SICAT Channel Links",
    "successStatus": 201
  },
  {
    "key": "get_v1_sicat_channel_links_whatsapp_action_window",
    "method": "get",
    "specPath": "/v1/sicat/channel-links/whatsapp/action-window",
    "expressPath": "/v1/sicat/channel-links/whatsapp/action-window",
    "summary": "Consultar a janela de liberação viva",
    "tag": "SICAT Channel Links",
    "successStatus": 200
  },
  {
    "key": "delete_v1_sicat_channel_links_whatsapp_action_window_windowId",
    "method": "delete",
    "specPath": "/v1/sicat/channel-links/whatsapp/action-window/{windowId}",
    "expressPath": "/v1/sicat/channel-links/whatsapp/action-window/:windowId",
    "summary": "Revogar a janela de liberação agora",
    "tag": "SICAT Channel Links",
    "successStatus": 204
  },
  {
    "key": "post_v1_sicat_channel_links_challenges_challengeId_resend",
    "method": "post",
    "specPath": "/v1/sicat/channel-links/challenges/{challengeId}/resend",
    "expressPath": "/v1/sicat/channel-links/challenges/:challengeId/resend",
    "summary": "Reenviar o código do desafio",
    "tag": "SICAT Channel Links",
    "successStatus": 202
  },
  {
    "key": "post_v1_sicat_channel_links_challenges_challengeId_confirm",
    "method": "post",
    "specPath": "/v1/sicat/channel-links/challenges/{challengeId}/confirm",
    "expressPath": "/v1/sicat/channel-links/challenges/:challengeId/confirm",
    "summary": "Confirmar o código e gravar o vínculo",
    "tag": "SICAT Channel Links",
    "successStatus": 200
  },
  {
    "key": "delete_v1_sicat_channel_links_challenges_challengeId",
    "method": "delete",
    "specPath": "/v1/sicat/channel-links/challenges/{challengeId}",
    "expressPath": "/v1/sicat/channel-links/challenges/:challengeId",
    "summary": "Cancelar o desafio vivo",
    "tag": "SICAT Channel Links",
    "successStatus": 204
  },
  {
    "key": "delete_v1_sicat_channel_links_linkId",
    "method": "delete",
    "specPath": "/v1/sicat/channel-links/{linkId}",
    "expressPath": "/v1/sicat/channel-links/:linkId",
    "summary": "Desvincular um número",
    "tag": "SICAT Channel Links",
    "successStatus": 204
  },
  {
    "key": "get_v1_channels_whatsapp_webhook",
    "method": "get",
    "specPath": "/v1/channels/whatsapp/webhook",
    "expressPath": "/v1/channels/whatsapp/webhook",
    "summary": "Desafio de verificação do webhook (Meta)",
    "tag": "WhatsApp Channel",
    "successStatus": 200
  },
  {
    "key": "post_v1_channels_whatsapp_webhook",
    "method": "post",
    "specPath": "/v1/channels/whatsapp/webhook",
    "expressPath": "/v1/channels/whatsapp/webhook",
    "summary": "Receber mensagens de entrada do WhatsApp",
    "tag": "WhatsApp Channel",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_regras",
    "method": "get",
    "specPath": "/v1/transporte/regras",
    "expressPath": "/v1/transporte/regras",
    "summary": "Listar regras do catálogo regulatório de transporte",
    "tag": "Transporte - Regras",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_regras_code",
    "method": "get",
    "specPath": "/v1/transporte/regras/{code}",
    "expressPath": "/v1/transporte/regras/:code",
    "summary": "Detalhar regra do catálogo regulatório",
    "tag": "Transporte - Regras",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_regras_code_historico",
    "method": "get",
    "specPath": "/v1/transporte/regras/{code}/historico",
    "expressPath": "/v1/transporte/regras/:code/historico",
    "summary": "Histórico de versões de uma regra do catálogo",
    "tag": "Transporte - Regras",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores",
    "method": "post",
    "specPath": "/v1/transporte/transportadores",
    "expressPath": "/v1/transporte/transportadores",
    "summary": "Cadastrar transportador",
    "tag": "Transporte - Cadastros",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_transportadores",
    "method": "get",
    "specPath": "/v1/transporte/transportadores",
    "expressPath": "/v1/transporte/transportadores",
    "summary": "Listar transportadores",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_transportadores_partyId",
    "method": "get",
    "specPath": "/v1/transporte/transportadores/{partyId}",
    "expressPath": "/v1/transporte/transportadores/:partyId",
    "summary": "Consultar transportador",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "patch_v1_transporte_transportadores_partyId",
    "method": "patch",
    "specPath": "/v1/transporte/transportadores/{partyId}",
    "expressPath": "/v1/transporte/transportadores/:partyId",
    "summary": "Atualizar transportador",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores_partyId_verificar_rntrc",
    "method": "post",
    "specPath": "/v1/transporte/transportadores/{partyId}/verificar-rntrc",
    "expressPath": "/v1/transporte/transportadores/:partyId/verificar-rntrc",
    "summary": "Solicitar verificação de regularidade RNTRC",
    "tag": "Transporte - RNTRC",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_transportadores_partyId_verificacoes_rntrc",
    "method": "get",
    "specPath": "/v1/transporte/transportadores/{partyId}/verificacoes-rntrc",
    "expressPath": "/v1/transporte/transportadores/:partyId/verificacoes-rntrc",
    "summary": "Histórico paginado de verificações RNTRC do transportador",
    "tag": "Transporte - RNTRC",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores_partyId_veiculos",
    "method": "post",
    "specPath": "/v1/transporte/transportadores/{partyId}/veiculos",
    "expressPath": "/v1/transporte/transportadores/:partyId/veiculos",
    "summary": "Vincular veículo a um transportador",
    "tag": "Transporte - Cadastros",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_transportadores_partyId_veiculos",
    "method": "get",
    "specPath": "/v1/transporte/transportadores/{partyId}/veiculos",
    "expressPath": "/v1/transporte/transportadores/:partyId/veiculos",
    "summary": "Listar veículos vinculados a um transportador",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_veiculos",
    "method": "post",
    "specPath": "/v1/transporte/veiculos",
    "expressPath": "/v1/transporte/veiculos",
    "summary": "Cadastrar veículo",
    "tag": "Transporte - Cadastros",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_veiculos",
    "method": "get",
    "specPath": "/v1/transporte/veiculos",
    "expressPath": "/v1/transporte/veiculos",
    "summary": "Listar veículos",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_veiculos_vehicleId",
    "method": "get",
    "specPath": "/v1/transporte/veiculos/{vehicleId}",
    "expressPath": "/v1/transporte/veiculos/:vehicleId",
    "summary": "Consultar veículo",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "patch_v1_transporte_veiculos_vehicleId",
    "method": "patch",
    "specPath": "/v1/transporte/veiculos/{vehicleId}",
    "expressPath": "/v1/transporte/veiculos/:vehicleId",
    "summary": "Atualizar veículo",
    "tag": "Transporte - Cadastros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes",
    "method": "post",
    "specPath": "/v1/transporte/operacoes",
    "expressPath": "/v1/transporte/operacoes",
    "summary": "Criar operação de transporte",
    "tag": "Transporte - Operações",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_operacoes",
    "method": "get",
    "specPath": "/v1/transporte/operacoes",
    "expressPath": "/v1/transporte/operacoes",
    "summary": "Listar operações de transporte",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_operacoes_operationId",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}",
    "expressPath": "/v1/transporte/operacoes/:operationId",
    "summary": "Consultar operação de transporte (agregado completo)",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "patch_v1_transporte_operacoes_operationId",
    "method": "patch",
    "specPath": "/v1/transporte/operacoes/{operationId}",
    "expressPath": "/v1/transporte/operacoes/:operationId",
    "summary": "Atualizar dados da operação",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_submeter_validacao",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/submeter-validacao",
    "expressPath": "/v1/transporte/operacoes/:operationId/submeter-validacao",
    "summary": "Submeter operação para validação (draft → validating → ready_for_contract|blocked)",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_contratar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/contratar",
    "expressPath": "/v1/transporte/operacoes/:operationId/contratar",
    "summary": "Contratar operação (ready_for_contract → contracted)",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_reabrir",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/reabrir",
    "expressPath": "/v1/transporte/operacoes/:operationId/reabrir",
    "summary": "Reabrir operação bloqueada (blocked → draft)",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_cancelar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/cancelar",
    "expressPath": "/v1/transporte/operacoes/:operationId/cancelar",
    "summary": "Cancelar operação de transporte",
    "tag": "Transporte - Operações",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_validar_conformidade",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/validar-conformidade",
    "expressPath": "/v1/transporte/operacoes/:operationId/validar-conformidade",
    "summary": "Avaliar conformidade de UM gate (ad-hoc, sem transição)",
    "tag": "Transporte - Conformidade",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_conformidade",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/conformidade",
    "expressPath": "/v1/transporte/operacoes/:operationId/conformidade",
    "summary": "Overview de conformidade da operação (última avaliação por gate)",
    "tag": "Transporte - Conformidade",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_calcular_piso",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/calcular-piso",
    "expressPath": "/v1/transporte/operacoes/:operationId/calcular-piso",
    "summary": "Calcular e persistir o piso mínimo de frete (MODO SHADOW)",
    "tag": "Transporte - Piso Mínimo",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_calculos_piso",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/calculos-piso",
    "expressPath": "/v1/transporte/operacoes/:operationId/calculos-piso",
    "summary": "Histórico paginado dos cálculos de piso da operação",
    "tag": "Transporte - Piso Mínimo",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_piso_tabelas",
    "method": "get",
    "specPath": "/v1/transporte/piso/tabelas",
    "expressPath": "/v1/transporte/piso/tabelas",
    "summary": "Tabelas de piso carregadas (admin read-only)",
    "tag": "Transporte - Piso Mínimo",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_ciot_pre_validar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot/pre-validar",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot/pre-validar",
    "summary": "Pré-validar o CIOT (síncrono, sem transição)",
    "tag": "Transporte - CIOT",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_ciot_solicitar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot/solicitar",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot/solicitar",
    "summary": "Solicitar CIOT (assíncrono)",
    "tag": "Transporte - CIOT",
    "successStatus": 202
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_ciot_retificar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot/retificar",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot/retificar",
    "summary": "Retificar CIOT (assíncrono)",
    "tag": "Transporte - CIOT",
    "successStatus": 202
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_ciot_cancelar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot/cancelar",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot/cancelar",
    "summary": "Cancelar CIOT (assíncrono)",
    "tag": "Transporte - CIOT",
    "successStatus": 202
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_ciot_encerrar",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot/encerrar",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot/encerrar",
    "summary": "Encerrar CIOT (assíncrono)",
    "tag": "Transporte - CIOT",
    "successStatus": 202
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_ciot",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/ciot",
    "expressPath": "/v1/transporte/operacoes/:operationId/ciot",
    "summary": "Ciot atual + eventos paginados",
    "tag": "Transporte - CIOT",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_vpo_avaliar_aplicabilidade",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/vpo/avaliar-aplicabilidade",
    "expressPath": "/v1/transporte/operacoes/:operationId/vpo/avaliar-aplicabilidade",
    "summary": "Avaliar aplicabilidade do VPO (síncrono)",
    "tag": "Transporte - Vale-Pedagio",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_vpo_registrar_aquisicao",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/vpo/registrar-aquisicao",
    "expressPath": "/v1/transporte/operacoes/:operationId/vpo/registrar-aquisicao",
    "summary": "Registrar aquisição MANUAL do VPO (síncrono)",
    "tag": "Transporte - Vale-Pedagio",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_vpo_adquirir",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/vpo/adquirir",
    "expressPath": "/v1/transporte/operacoes/:operationId/vpo/adquirir",
    "summary": "Adquirir VPO via provedor (assíncrono)",
    "tag": "Transporte - Vale-Pedagio",
    "successStatus": 202
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_vpo",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/vpo",
    "expressPath": "/v1/transporte/operacoes/:operationId/vpo",
    "summary": "Alocação de VPO atual + eventos paginados",
    "tag": "Transporte - Vale-Pedagio",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_vpo_fornecedoras",
    "method": "get",
    "specPath": "/v1/transporte/vpo/fornecedoras",
    "expressPath": "/v1/transporte/vpo/fornecedoras",
    "summary": "Fornecedoras de VPO habilitadas (cadastro configurável, read-only)",
    "tag": "Transporte - Vale-Pedagio",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_documentos_fiscais_importar",
    "method": "post",
    "specPath": "/v1/transporte/documentos-fiscais/importar",
    "expressPath": "/v1/transporte/documentos-fiscais/importar",
    "summary": "Importar e validar um DF-e (NF-e/CT-e/MDF-e) — síncrono",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 201
  },
  {
    "key": "post_v1_transporte_documentos_fiscais_documentId_vincular",
    "method": "post",
    "specPath": "/v1/transporte/documentos-fiscais/{documentId}/vincular",
    "expressPath": "/v1/transporte/documentos-fiscais/:documentId/vincular",
    "summary": "Vincular um documento fiscal já importado a uma operação",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_documentos_fiscais_documentId_desvincular",
    "method": "post",
    "specPath": "/v1/transporte/documentos-fiscais/{documentId}/desvincular",
    "expressPath": "/v1/transporte/documentos-fiscais/:documentId/desvincular",
    "summary": "Desvincular um documento fiscal da operação atual",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_documentos_fiscais_documentId_revalidar",
    "method": "post",
    "specPath": "/v1/transporte/documentos-fiscais/{documentId}/revalidar",
    "expressPath": "/v1/transporte/documentos-fiscais/:documentId/revalidar",
    "summary": "Reprocessar a validação de um documento fiscal já importado",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_documentos_fiscais",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/documentos-fiscais",
    "expressPath": "/v1/transporte/operacoes/:operationId/documentos-fiscais",
    "summary": "Documentos fiscais vinculados a uma operação",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_documentos_fiscais_documentId",
    "method": "get",
    "specPath": "/v1/transporte/documentos-fiscais/{documentId}",
    "expressPath": "/v1/transporte/documentos-fiscais/:documentId",
    "summary": "Detalhe de um documento fiscal (issues + links)",
    "tag": "Transporte - Documentos Fiscais",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores_partyId_apolices",
    "method": "post",
    "specPath": "/v1/transporte/transportadores/{partyId}/apolices",
    "expressPath": "/v1/transporte/transportadores/:partyId/apolices",
    "summary": "Registrar apólice de seguro do transportador (evidência manual)",
    "tag": "Transporte - Seguros",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_transportadores_partyId_apolices",
    "method": "get",
    "specPath": "/v1/transporte/transportadores/{partyId}/apolices",
    "expressPath": "/v1/transporte/transportadores/:partyId/apolices",
    "summary": "Listar apólices do transportador (com vigência derivada contra hoje)",
    "tag": "Transporte - Seguros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores_partyId_apolices_verificar",
    "method": "post",
    "specPath": "/v1/transporte/transportadores/{partyId}/apolices/verificar",
    "expressPath": "/v1/transporte/transportadores/:partyId/apolices/verificar",
    "summary": "Verificar seguros do transportador via provider abstraído",
    "tag": "Transporte - Seguros",
    "successStatus": 200
  },
  {
    "key": "patch_v1_transporte_transportadores_partyId_apolices_policyId",
    "method": "patch",
    "specPath": "/v1/transporte/transportadores/{partyId}/apolices/{policyId}",
    "expressPath": "/v1/transporte/transportadores/:partyId/apolices/:policyId",
    "summary": "Atualizar apólice (correções administrativas; locking otimista)",
    "tag": "Transporte - Seguros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_transportadores_partyId_pgr",
    "method": "post",
    "specPath": "/v1/transporte/transportadores/{partyId}/pgr",
    "expressPath": "/v1/transporte/transportadores/:partyId/pgr",
    "summary": "Registrar PGR do transportador (evidência manual)",
    "tag": "Transporte - Seguros",
    "successStatus": 201
  },
  {
    "key": "get_v1_transporte_transportadores_partyId_pgr",
    "method": "get",
    "specPath": "/v1/transporte/transportadores/{partyId}/pgr",
    "expressPath": "/v1/transporte/transportadores/:partyId/pgr",
    "summary": "Listar PGRs do transportador",
    "tag": "Transporte - Seguros",
    "successStatus": 200
  },
  {
    "key": "get_v1_transporte_seguros_vencimentos",
    "method": "get",
    "specPath": "/v1/transporte/seguros/vencimentos",
    "expressPath": "/v1/transporte/seguros/vencimentos",
    "summary": "Alertas de vencimento de seguros (Centro Operacional)",
    "tag": "Transporte - Seguros",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_operacoes_operationId_emissoes",
    "method": "post",
    "specPath": "/v1/transporte/operacoes/{operationId}/emissoes",
    "expressPath": "/v1/transporte/operacoes/:operationId/emissoes",
    "summary": "Solicitar emissão de DF-e (assíncrono, sandbox-ready)",
    "tag": "Transporte - Emissao Fiscal",
    "successStatus": 202
  },
  {
    "key": "get_v1_transporte_operacoes_operationId_emissoes",
    "method": "get",
    "specPath": "/v1/transporte/operacoes/{operationId}/emissoes",
    "expressPath": "/v1/transporte/operacoes/:operationId/emissoes",
    "summary": "Lista as emissões de DF-e da operação, com a trilha de eventos de cada uma",
    "tag": "Transporte - Emissao Fiscal",
    "successStatus": 200
  },
  {
    "key": "post_v1_transporte_emissoes_issuanceId_cancelar",
    "method": "post",
    "specPath": "/v1/transporte/emissoes/{issuanceId}/cancelar",
    "expressPath": "/v1/transporte/emissoes/:issuanceId/cancelar",
    "summary": "Cancelar emissão de DF-e (assíncrono, sandbox only)",
    "tag": "Transporte - Emissao Fiscal",
    "successStatus": 202
  }
] as const satisfies readonly OperationDefinition[];

export const operations: readonly OperationDefinition[] = operationsData;

export type Operation = (typeof operationsData)[number];
export type OperationKey = Operation['key'];
