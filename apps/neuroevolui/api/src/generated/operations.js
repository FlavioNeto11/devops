// AUTO-GERADO por scripts/gen-operations.mjs — NÃO EDITAR MANUALMENTE.
// Fonte: src/openapi/openapi.yaml. Regenere com: npm run gen:operations

/**
 * @typedef {{
 *   key: string,
 *   method: string,
 *   specPath: string,
 *   fastifyPath: string,
 *   summary: string,
 *   tag: string,
 *   successStatus: number
 * }} OperationDefinition
 */

/** @type {OperationDefinition[]} */
export const operations = [
  {
    "key": "get_",
    "method": "get",
    "specPath": "/",
    "fastifyPath": "/",
    "summary": "Informações do serviço",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_health",
    "method": "get",
    "specPath": "/health",
    "fastifyPath": "/health",
    "summary": "Health check (banco de dados)",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_me",
    "method": "get",
    "specPath": "/me",
    "fastifyPath": "/me",
    "summary": "Identidade do usuário corrente (borda SSO)",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_queue",
    "method": "get",
    "specPath": "/v1/health/queue",
    "fastifyPath": "/v1/health/queue",
    "summary": "Health check das filas BullMQ",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_records",
    "method": "get",
    "specPath": "/v1/records",
    "fastifyPath": "/v1/records",
    "summary": "Listar registros clínicos do tenant",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "post_v1_records",
    "method": "post",
    "specPath": "/v1/records",
    "fastifyPath": "/v1/records",
    "summary": "Criar registro clínico",
    "tag": "Records",
    "successStatus": 201
  },
  {
    "key": "get_v1_records_id",
    "method": "get",
    "specPath": "/v1/records/{id}",
    "fastifyPath": "/v1/records/:id",
    "summary": "Obter registro clínico por ID",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "put_v1_records_id",
    "method": "put",
    "specPath": "/v1/records/{id}",
    "fastifyPath": "/v1/records/:id",
    "summary": "Editar registro (título e referência externa)",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "delete_v1_records_id",
    "method": "delete",
    "specPath": "/v1/records/{id}",
    "fastifyPath": "/v1/records/:id",
    "summary": "Remover registro clínico",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "post_v1_records_id_submit",
    "method": "post",
    "specPath": "/v1/records/{id}/submit",
    "fastifyPath": "/v1/records/:id/submit",
    "summary": "Submeter registro para processamento assíncrono",
    "tag": "Records",
    "successStatus": 202
  },
  {
    "key": "post_v1_consultations_schedule",
    "method": "post",
    "specPath": "/v1/consultations/schedule",
    "fastifyPath": "/v1/consultations/schedule",
    "summary": "Agendar consulta",
    "tag": "Consultations",
    "successStatus": 200
  },
  {
    "key": "get_v1_consultations",
    "method": "get",
    "specPath": "/v1/consultations",
    "fastifyPath": "/v1/consultations",
    "summary": "Listar consultas do tenant",
    "tag": "Consultations",
    "successStatus": 200
  },
  {
    "key": "get_v1_consultations_id",
    "method": "get",
    "specPath": "/v1/consultations/{id}",
    "fastifyPath": "/v1/consultations/:id",
    "summary": "Obter consulta por ID",
    "tag": "Consultations",
    "successStatus": 200
  },
  {
    "key": "post_v1_payments_webhook",
    "method": "post",
    "specPath": "/v1/payments/webhook",
    "fastifyPath": "/v1/payments/webhook",
    "summary": "Receber webhook de pagamento",
    "tag": "Payments",
    "successStatus": 200
  },
  {
    "key": "get_v1_dashboard_revenue",
    "method": "get",
    "specPath": "/v1/dashboard/revenue",
    "fastifyPath": "/v1/dashboard/revenue",
    "summary": "Dashboard de receita (clinic_manager)",
    "tag": "Dashboard",
    "successStatus": 200
  },
  {
    "key": "post_v1_consultation_notes",
    "method": "post",
    "specPath": "/v1/consultation-notes",
    "fastifyPath": "/v1/consultation-notes",
    "summary": "Enfileirar geração de notas de consulta (async)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "post_v1_patient_imports",
    "method": "post",
    "specPath": "/v1/patient-imports",
    "fastifyPath": "/v1/patient-imports",
    "summary": "Enfileirar importação de pacientes (async)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "get_v1_notifications",
    "method": "get",
    "specPath": "/v1/notifications",
    "fastifyPath": "/v1/notifications",
    "summary": "Histórico de notificações enfileiradas (queue_name=notifications)",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "post_v1_notifications",
    "method": "post",
    "specPath": "/v1/notifications",
    "fastifyPath": "/v1/notifications",
    "summary": "Enfileirar envio de notificação (async)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "post_v1_summaries_ai",
    "method": "post",
    "specPath": "/v1/summaries-ai",
    "fastifyPath": "/v1/summaries-ai",
    "summary": "Enfileirar geração de sumário IA (async)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "get_v1_jobs_queueName_jobKey",
    "method": "get",
    "specPath": "/v1/jobs/{queueName}/{jobKey}",
    "fastifyPath": "/v1/jobs/:queueName/:jobKey",
    "summary": "Consultar status de job assíncrono",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "get_v1_audit",
    "method": "get",
    "specPath": "/v1/audit",
    "fastifyPath": "/v1/audit",
    "summary": "Trilha de auditoria (clinic_manager)",
    "tag": "Audit",
    "successStatus": 200
  },
  {
    "key": "post_v1_patients_patientId_evolution_notes",
    "method": "post",
    "specPath": "/v1/patients/{patientId}/evolution-notes",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes",
    "summary": "Criar nota evolutiva",
    "tag": "EvolutionNotes",
    "successStatus": 201
  },
  {
    "key": "get_v1_patients_patientId_evolution_notes",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes",
    "summary": "Listar notas evolutivas do paciente",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients_patientId_evolution_notes_history",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes/history",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/history",
    "summary": "Histórico de versões das notas evolutivas",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients_patientId_evolution_notes_noteId",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes/{noteId}",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/:noteId",
    "summary": "Obter nota evolutiva por ID",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "put_v1_patients_patientId_evolution_notes_noteId",
    "method": "put",
    "specPath": "/v1/patients/{patientId}/evolution-notes/{noteId}",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/:noteId",
    "summary": "Editar nota evolutiva",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "delete_v1_patients_patientId_evolution_notes_noteId",
    "method": "delete",
    "specPath": "/v1/patients/{patientId}/evolution-notes/{noteId}",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/:noteId",
    "summary": "Excluir nota evolutiva",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "post_v1_patients_patientId_reports",
    "method": "post",
    "specPath": "/v1/patients/{patientId}/reports",
    "fastifyPath": "/v1/patients/:patientId/reports",
    "summary": "Solicitar geração de relatório do paciente (async)",
    "tag": "PatientReports",
    "successStatus": 202
  },
  {
    "key": "get_v1_patients_patientId_reports",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/reports",
    "fastifyPath": "/v1/patients/:patientId/reports",
    "summary": "Listar relatórios do paciente",
    "tag": "PatientReports",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients_patientId_reports_reportId",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/reports/{reportId}",
    "fastifyPath": "/v1/patients/:patientId/reports/:reportId",
    "summary": "Obter relatório do paciente por ID",
    "tag": "PatientReports",
    "successStatus": 200
  },
  {
    "key": "post_v1_assistant",
    "method": "post",
    "specPath": "/v1/assistant",
    "fastifyPath": "/v1/assistant",
    "summary": "Assistente IA (chat + upload de arquivos)",
    "tag": "Assistant",
    "successStatus": 200
  },
  {
    "key": "get_v1_notifications_vapid_public_key",
    "method": "get",
    "specPath": "/v1/notifications/vapid-public-key",
    "fastifyPath": "/v1/notifications/vapid-public-key",
    "summary": "Obter chave pública VAPID para push notifications",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "post_v1_notifications_subscriptions",
    "method": "post",
    "specPath": "/v1/notifications/subscriptions",
    "fastifyPath": "/v1/notifications/subscriptions",
    "summary": "Registrar subscrição de push notification",
    "tag": "Notifications",
    "successStatus": 201
  },
  {
    "key": "delete_v1_notifications_subscriptions",
    "method": "delete",
    "specPath": "/v1/notifications/subscriptions",
    "fastifyPath": "/v1/notifications/subscriptions",
    "summary": "Remover subscrição de push notification",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "get_v1_notifications_preferences",
    "method": "get",
    "specPath": "/v1/notifications/preferences",
    "fastifyPath": "/v1/notifications/preferences",
    "summary": "Listar preferências de notificação do usuário",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "put_v1_notifications_preferences",
    "method": "put",
    "specPath": "/v1/notifications/preferences",
    "fastifyPath": "/v1/notifications/preferences",
    "summary": "Atualizar preferência de notificação",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "get_docs",
    "method": "get",
    "specPath": "/docs",
    "fastifyPath": "/docs",
    "summary": "Documentação interativa da API (ReDoc)",
    "tag": "Docs",
    "successStatus": 200
  },
  {
    "key": "get_docs_openapi_yaml",
    "method": "get",
    "specPath": "/docs/openapi.yaml",
    "fastifyPath": "/docs/openapi.yaml",
    "summary": "Especificação OpenAPI canônica",
    "tag": "Docs",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients",
    "method": "get",
    "specPath": "/v1/patients",
    "fastifyPath": "/v1/patients",
    "summary": "Listar pacientes (paginado)",
    "tag": "Patients",
    "successStatus": 200
  },
  {
    "key": "post_v1_patients",
    "method": "post",
    "specPath": "/v1/patients",
    "fastifyPath": "/v1/patients",
    "summary": "Cadastrar paciente",
    "tag": "Patients",
    "successStatus": 201
  },
  {
    "key": "get_v1_patients_id",
    "method": "get",
    "specPath": "/v1/patients/{id}",
    "fastifyPath": "/v1/patients/:id",
    "summary": "Obter paciente por id",
    "tag": "Patients",
    "successStatus": 200
  },
  {
    "key": "put_v1_patients_id",
    "method": "put",
    "specPath": "/v1/patients/{id}",
    "fastifyPath": "/v1/patients/:id",
    "summary": "Atualizar paciente",
    "tag": "Patients",
    "successStatus": 200
  },
  {
    "key": "delete_v1_patients_id",
    "method": "delete",
    "specPath": "/v1/patients/{id}",
    "fastifyPath": "/v1/patients/:id",
    "summary": "Remover paciente (soft delete)",
    "tag": "Patients",
    "successStatus": 200
  },
  {
    "key": "get_v1_professionals",
    "method": "get",
    "specPath": "/v1/professionals",
    "fastifyPath": "/v1/professionals",
    "summary": "Listar profissionais (paginado)",
    "tag": "Professionals",
    "successStatus": 200
  },
  {
    "key": "post_v1_professionals",
    "method": "post",
    "specPath": "/v1/professionals",
    "fastifyPath": "/v1/professionals",
    "summary": "Cadastrar profissional",
    "tag": "Professionals",
    "successStatus": 201
  },
  {
    "key": "get_v1_professionals_id",
    "method": "get",
    "specPath": "/v1/professionals/{id}",
    "fastifyPath": "/v1/professionals/:id",
    "summary": "Obter profissional por id",
    "tag": "Professionals",
    "successStatus": 200
  },
  {
    "key": "put_v1_professionals_id",
    "method": "put",
    "specPath": "/v1/professionals/{id}",
    "fastifyPath": "/v1/professionals/:id",
    "summary": "Atualizar profissional",
    "tag": "Professionals",
    "successStatus": 200
  },
  {
    "key": "delete_v1_professionals_id",
    "method": "delete",
    "specPath": "/v1/professionals/{id}",
    "fastifyPath": "/v1/professionals/:id",
    "summary": "Remover profissional (soft delete)",
    "tag": "Professionals",
    "successStatus": 200
  },
  {
    "key": "get_v1_evolution_notes",
    "method": "get",
    "specPath": "/v1/evolution-notes",
    "fastifyPath": "/v1/evolution-notes",
    "summary": "Listar evoluções do tenant (paginado; filtro patient_id/type)",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "post_v1_evolution_notes",
    "method": "post",
    "specPath": "/v1/evolution-notes",
    "fastifyPath": "/v1/evolution-notes",
    "summary": "Criar evolução (informe patient_id no corpo)",
    "tag": "EvolutionNotes",
    "successStatus": 201
  },
  {
    "key": "get_v1_evolution_notes_id",
    "method": "get",
    "specPath": "/v1/evolution-notes/{id}",
    "fastifyPath": "/v1/evolution-notes/:id",
    "summary": "Obter evolução por id",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "put_v1_evolution_notes_id",
    "method": "put",
    "specPath": "/v1/evolution-notes/{id}",
    "fastifyPath": "/v1/evolution-notes/:id",
    "summary": "Editar evolução (versiona)",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "delete_v1_evolution_notes_id",
    "method": "delete",
    "specPath": "/v1/evolution-notes/{id}",
    "fastifyPath": "/v1/evolution-notes/:id",
    "summary": "Remover evolução (soft delete)",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "get_v1_patient_reports",
    "method": "get",
    "specPath": "/v1/patient-reports",
    "fastifyPath": "/v1/patient-reports",
    "summary": "Listar relatórios do tenant (paginado; filtros patient_id e status)",
    "tag": "PatientReports",
    "successStatus": 200
  },
  {
    "key": "post_v1_patient_reports",
    "method": "post",
    "specPath": "/v1/patient-reports",
    "fastifyPath": "/v1/patient-reports",
    "summary": "Solicitar relatório (assíncrono; informe patient_id)",
    "tag": "PatientReports",
    "successStatus": 202
  },
  {
    "key": "get_v1_patient_reports_id",
    "method": "get",
    "specPath": "/v1/patient-reports/{id}",
    "fastifyPath": "/v1/patient-reports/:id",
    "summary": "Obter relatório por id",
    "tag": "PatientReports",
    "successStatus": 200
  },
  {
    "key": "delete_v1_patient_reports_id",
    "method": "delete",
    "specPath": "/v1/patient-reports/{id}",
    "fastifyPath": "/v1/patient-reports/:id",
    "summary": "Remover relatório",
    "tag": "PatientReports",
    "successStatus": 200
  },
  {
    "key": "get_v1_payment_transactions",
    "method": "get",
    "specPath": "/v1/payment-transactions",
    "fastifyPath": "/v1/payment-transactions",
    "summary": "Listar transações de pagamento (paginado)",
    "tag": "Payments",
    "successStatus": 200
  },
  {
    "key": "get_v1_payment_transactions_id",
    "method": "get",
    "specPath": "/v1/payment-transactions/{id}",
    "fastifyPath": "/v1/payment-transactions/:id",
    "summary": "Obter transação por id",
    "tag": "Payments",
    "successStatus": 200
  },
  {
    "key": "get_v1_knowledge_sources",
    "method": "get",
    "specPath": "/v1/knowledge-sources",
    "fastifyPath": "/v1/knowledge-sources",
    "summary": "Listar fontes da base de conhecimento (paginado)",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "post_v1_knowledge_sources",
    "method": "post",
    "specPath": "/v1/knowledge-sources",
    "fastifyPath": "/v1/knowledge-sources",
    "summary": "Ingerir fonte de conhecimento (conteúdo real -> chunking + embedding)",
    "tag": "KnowledgeSources",
    "successStatus": 201
  },
  {
    "key": "get_v1_knowledge_sources_stats",
    "method": "get",
    "specPath": "/v1/knowledge-sources/stats",
    "fastifyPath": "/v1/knowledge-sources/stats",
    "summary": "Agregados REAIS de toda a coleção (métricas de cabeçalho)",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "post_v1_knowledge_sources_id_reindex",
    "method": "post",
    "specPath": "/v1/knowledge-sources/{id}/reindex",
    "fastifyPath": "/v1/knowledge-sources/:id/reindex",
    "summary": "Reindexar uma fonte (reprocessa agora; ingested_at = now())",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "get_v1_knowledge_sources_id",
    "method": "get",
    "specPath": "/v1/knowledge-sources/{id}",
    "fastifyPath": "/v1/knowledge-sources/:id",
    "summary": "Obter fonte por source_id",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "put_v1_knowledge_sources_id",
    "method": "put",
    "specPath": "/v1/knowledge-sources/{id}",
    "fastifyPath": "/v1/knowledge-sources/:id",
    "summary": "Atualizar fonte",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "delete_v1_knowledge_sources_id",
    "method": "delete",
    "specPath": "/v1/knowledge-sources/{id}",
    "fastifyPath": "/v1/knowledge-sources/:id",
    "summary": "Remover fonte (cascade nos chunks)",
    "tag": "KnowledgeSources",
    "successStatus": 200
  },
  {
    "key": "get_v1_notification_preferences",
    "method": "get",
    "specPath": "/v1/notification-preferences",
    "fastifyPath": "/v1/notification-preferences",
    "summary": "Listar preferências de notificação do tenant (paginado)",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "post_v1_notification_preferences",
    "method": "post",
    "specPath": "/v1/notification-preferences",
    "fastifyPath": "/v1/notification-preferences",
    "summary": "Criar preferência de notificação",
    "tag": "Notifications",
    "successStatus": 201
  },
  {
    "key": "get_v1_notification_preferences_id",
    "method": "get",
    "specPath": "/v1/notification-preferences/{id}",
    "fastifyPath": "/v1/notification-preferences/:id",
    "summary": "Obter preferência por id",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "put_v1_notification_preferences_id",
    "method": "put",
    "specPath": "/v1/notification-preferences/{id}",
    "fastifyPath": "/v1/notification-preferences/:id",
    "summary": "Atualizar preferência",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "delete_v1_notification_preferences_id",
    "method": "delete",
    "specPath": "/v1/notification-preferences/{id}",
    "fastifyPath": "/v1/notification-preferences/:id",
    "summary": "Remover preferência",
    "tag": "Notifications",
    "successStatus": 200
  },
  {
    "key": "get_v1_audit_logs",
    "method": "get",
    "specPath": "/v1/audit-logs",
    "fastifyPath": "/v1/audit-logs",
    "summary": "Listar trilha de auditoria (paginado)",
    "tag": "Audit",
    "successStatus": 200
  },
  {
    "key": "get_v1_audit_logs_id",
    "method": "get",
    "specPath": "/v1/audit-logs/{id}",
    "fastifyPath": "/v1/audit-logs/:id",
    "summary": "Obter log de auditoria por id",
    "tag": "Audit",
    "successStatus": 200
  },
  {
    "key": "get_v1_async_jobs",
    "method": "get",
    "specPath": "/v1/async-jobs",
    "fastifyPath": "/v1/async-jobs",
    "summary": "Listar jobs assíncronos (paginado)",
    "tag": "Jobs",
    "successStatus": 200
  },
  {
    "key": "get_v1_async_jobs_id",
    "method": "get",
    "specPath": "/v1/async-jobs/{id}",
    "fastifyPath": "/v1/async-jobs/:id",
    "summary": "Obter job assíncrono por id",
    "tag": "Jobs",
    "successStatus": 200
  }
];

export const operationKeys = /** @type {const} */ (["get_","get_health","get_me","get_v1_health_queue","get_v1_records","post_v1_records","get_v1_records_id","put_v1_records_id","delete_v1_records_id","post_v1_records_id_submit","post_v1_consultations_schedule","get_v1_consultations","get_v1_consultations_id","post_v1_payments_webhook","get_v1_dashboard_revenue","post_v1_consultation_notes","post_v1_patient_imports","get_v1_notifications","post_v1_notifications","post_v1_summaries_ai","get_v1_jobs_queueName_jobKey","get_v1_audit","post_v1_patients_patientId_evolution_notes","get_v1_patients_patientId_evolution_notes","get_v1_patients_patientId_evolution_notes_history","get_v1_patients_patientId_evolution_notes_noteId","put_v1_patients_patientId_evolution_notes_noteId","delete_v1_patients_patientId_evolution_notes_noteId","post_v1_patients_patientId_reports","get_v1_patients_patientId_reports","get_v1_patients_patientId_reports_reportId","post_v1_assistant","get_v1_notifications_vapid_public_key","post_v1_notifications_subscriptions","delete_v1_notifications_subscriptions","get_v1_notifications_preferences","put_v1_notifications_preferences","get_docs","get_docs_openapi_yaml","get_v1_patients","post_v1_patients","get_v1_patients_id","put_v1_patients_id","delete_v1_patients_id","get_v1_professionals","post_v1_professionals","get_v1_professionals_id","put_v1_professionals_id","delete_v1_professionals_id","get_v1_evolution_notes","post_v1_evolution_notes","get_v1_evolution_notes_id","put_v1_evolution_notes_id","delete_v1_evolution_notes_id","get_v1_patient_reports","post_v1_patient_reports","get_v1_patient_reports_id","delete_v1_patient_reports_id","get_v1_payment_transactions","get_v1_payment_transactions_id","get_v1_knowledge_sources","post_v1_knowledge_sources","get_v1_knowledge_sources_stats","post_v1_knowledge_sources_id_reindex","get_v1_knowledge_sources_id","put_v1_knowledge_sources_id","delete_v1_knowledge_sources_id","get_v1_notification_preferences","post_v1_notification_preferences","get_v1_notification_preferences_id","put_v1_notification_preferences_id","delete_v1_notification_preferences_id","get_v1_audit_logs","get_v1_audit_logs_id","get_v1_async_jobs","get_v1_async_jobs_id"]);
