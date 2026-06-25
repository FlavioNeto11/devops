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
    "successStatus": 201
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
    "key": "post_v1_consultation-notes",
    "method": "post",
    "specPath": "/v1/consultation-notes",
    "fastifyPath": "/v1/consultation-notes",
    "summary": "Enfileirar geração de notas de consulta (async)",
    "tag": "Jobs",
    "successStatus": 202
  },
  {
    "key": "post_v1_patient-imports",
    "method": "post",
    "specPath": "/v1/patient-imports",
    "fastifyPath": "/v1/patient-imports",
    "summary": "Enfileirar importação de pacientes (async)",
    "tag": "Jobs",
    "successStatus": 202
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
    "key": "post_v1_summaries-ai",
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
    "key": "post_v1_patients_patientId_evolution-notes",
    "method": "post",
    "specPath": "/v1/patients/{patientId}/evolution-notes",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes",
    "summary": "Criar nota evolutiva",
    "tag": "EvolutionNotes",
    "successStatus": 201
  },
  {
    "key": "get_v1_patients_patientId_evolution-notes",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes",
    "summary": "Listar notas evolutivas do paciente",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients_patientId_evolution-notes_history",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes/history",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/history",
    "summary": "Histórico de versões das notas evolutivas",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "get_v1_patients_patientId_evolution-notes_noteId",
    "method": "get",
    "specPath": "/v1/patients/{patientId}/evolution-notes/{noteId}",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/:noteId",
    "summary": "Obter nota evolutiva por ID",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "put_v1_patients_patientId_evolution-notes_noteId",
    "method": "put",
    "specPath": "/v1/patients/{patientId}/evolution-notes/{noteId}",
    "fastifyPath": "/v1/patients/:patientId/evolution-notes/:noteId",
    "summary": "Editar nota evolutiva",
    "tag": "EvolutionNotes",
    "successStatus": 200
  },
  {
    "key": "delete_v1_patients_patientId_evolution-notes_noteId",
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
    "key": "get_v1_notifications_vapid-public-key",
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
    "key": "get_docs_openapi.yaml",
    "method": "get",
    "specPath": "/docs/openapi.yaml",
    "fastifyPath": "/docs/openapi.yaml",
    "summary": "Especificação OpenAPI canônica",
    "tag": "Docs",
    "successStatus": 200
  }
];

export const operationKeys = /** @type {const} */ (["get_","get_health","get_v1_health_queue","get_v1_records","post_v1_records","get_v1_records_id","delete_v1_records_id","post_v1_records_id_submit","post_v1_consultations_schedule","get_v1_consultations","post_v1_payments_webhook","get_v1_dashboard_revenue","post_v1_consultation-notes","post_v1_patient-imports","post_v1_notifications","post_v1_summaries-ai","get_v1_jobs_queueName_jobKey","get_v1_audit","post_v1_patients_patientId_evolution-notes","get_v1_patients_patientId_evolution-notes","get_v1_patients_patientId_evolution-notes_history","get_v1_patients_patientId_evolution-notes_noteId","put_v1_patients_patientId_evolution-notes_noteId","delete_v1_patients_patientId_evolution-notes_noteId","post_v1_patients_patientId_reports","get_v1_patients_patientId_reports","get_v1_patients_patientId_reports_reportId","post_v1_assistant","get_v1_notifications_vapid-public-key","post_v1_notifications_subscriptions","delete_v1_notifications_subscriptions","get_v1_notifications_preferences","put_v1_notifications_preferences","get_docs","get_docs_openapi.yaml"]);
