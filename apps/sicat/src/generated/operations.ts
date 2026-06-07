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
    "key": "get_v1_health_jobs_dlq",
    "method": "get",
    "specPath": "/v1/health/jobs/dlq",
    "expressPath": "/v1/health/jobs/dlq",
    "summary": "Verificar jobs em dead letter queue",
    "tag": "Health",
    "successStatus": 200
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
  }
] as const satisfies readonly OperationDefinition[];

export const operations: readonly OperationDefinition[] = operationsData;

export type Operation = (typeof operationsData)[number];
export type OperationKey = Operation['key'];
