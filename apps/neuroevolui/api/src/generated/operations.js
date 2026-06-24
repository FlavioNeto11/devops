export const operations = [
  {
    "key": "get_",
    "method": "get",
    "specPath": "/",
    "expressPath": "/",
    "summary": "Identificação da API",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_health",
    "method": "get",
    "specPath": "/health",
    "expressPath": "/health",
    "summary": "Verificação de saúde com banco de dados",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_health_queue",
    "method": "get",
    "specPath": "/v1/health/queue",
    "expressPath": "/v1/health/queue",
    "summary": "Status da fila de processamento assíncrono",
    "tag": "Health",
    "successStatus": 200
  },
  {
    "key": "get_v1_records",
    "method": "get",
    "specPath": "/v1/records",
    "expressPath": "/v1/records",
    "summary": "Lista registros do tenant (até 200, ordem decrescente)",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "post_v1_records",
    "method": "post",
    "specPath": "/v1/records",
    "expressPath": "/v1/records",
    "summary": "Cria um novo registro",
    "tag": "Records",
    "successStatus": 201
  },
  {
    "key": "get_v1_records_id",
    "method": "get",
    "specPath": "/v1/records/{id}",
    "expressPath": "/v1/records/:id",
    "summary": "Retorna um registro pelo ID",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "delete_v1_records_id",
    "method": "delete",
    "specPath": "/v1/records/{id}",
    "expressPath": "/v1/records/:id",
    "summary": "Remove um registro (requer role admin)",
    "tag": "Records",
    "successStatus": 200
  },
  {
    "key": "post_v1_records_id_submit",
    "method": "post",
    "specPath": "/v1/records/{id}/submit",
    "expressPath": "/v1/records/:id/submit",
    "summary": "Enfileira o registro para processamento assíncrono (BullMQ)",
    "tag": "Records",
    "successStatus": 202
  }
];
