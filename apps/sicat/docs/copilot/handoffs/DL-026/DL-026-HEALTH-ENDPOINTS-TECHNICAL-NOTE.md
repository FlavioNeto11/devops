# DL-026: Health Endpoints - Nota Técnica de Validação CETESB

## Resumo Executivo

Health endpoints (7 operações) são **observabilidade INTERNA** do sistema e **não dependem de CETESB**. Validação CETESB passou com sucesso confirma coerência do contrato OpenAPI.

## Health Endpoints Implementados

| Endpoint | Método | Tag | Descrição |
|----------|--------|-----|-----------|
| `/ping` | GET | Health | Health check simples para load balancers |
| `/health/system` | GET | Health | Status geral da API (versão, uptime, ambiente) |
| `/health/workers` | GET | Health | Heartbeat e estatísticas dos workers |
| `/health/jobs/active` | GET | Health | Jobs em execução (queued, running, retry_wait) |
| `/health/jobs/dlq` | GET | Health | Jobs em dead letter queue com razão |
| `/health/metrics/performance` | GET | Health | Percentis de latência (p50, p95, p99) |
| `/maintenance/cleanup` | POST | Health | Disparar limpeza de jobs antigos |

## Fonte de Verdade: Banco de Dados Local

Nenhum endpoint de health chama CETESB. Dados vêm **100% do banco de dados local**:

- **worker_health**: Heartbeat de workers (criado em migration 004)
- **jobs**: Status de jobs com tentativas e erros (migration 002)
- **performance_snapshots**: Métricas agregadas de latência (migration 004)
- **system_events**: Eventos internos do sistema (migration 004)

## Resiliência

Health endpoints são **resilientes mesmo quando CETESB está indisponível**:
- Nenhuma chamada externa
- Dependência apenas em tabelas locais
- Não incluem dados sensíveis de parceiros
- Não armazenam credenciais ou JWTs externos

## Documentação OpenAPI

### Metadados Adicionados

```yaml
x-cetesb-source-of-truth:
  # Nota: Health endpoints são INTERNOS
  # Fonte de verdade: Banco de dados local (worker_health, jobs, performance_snapshots)
  # Não obrigam validação de HAR

x-internal-observability:
  description: 'Health endpoints são observabilidade interna do sistema.'
  dataSource: 'Banco de dados local'
  hasDependency: 'Nenhuma - resilientes mesmo quando CETESB está indisponível'
```

### Autenticação

- Health endpoints com `security: []` (sem autenticação obrigatória)
- `/ping` e `/health/system` públicos para load balancers
- Suportam `X-Correlation-Id` opcional para rastreamento

## Validação Executada

✅ `npm run validate:openapi` - Passou (25 operações)
✅ `npm run validate:cetesb-source` - Passou ([ok] política validada)
✅ Nenhuma divergência com HARs (health endpoints ignorados conforme esperado)
✅ Metadados de fonte de verdade atualizados

## Próximas Etapas

- **HANDOFF 3**: Integração com gateway (roteamento)
- **HANDOFF 4**: Health repository com queries
- **HANDOFF 5**: Testes (smoke + integration)
- **HANDOFF 6**: Documentação final

---

**Status**: ✅ VALIDAÇÃO CONCLUÍDA  
**Data**: 2026-03-09  
**Validador**: validador-cetesb-mtr  
**Referência**: DL-022 (Observabilidade), DL-021 (Reorganização)
