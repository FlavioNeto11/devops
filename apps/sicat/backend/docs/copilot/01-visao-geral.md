# Visão geral

## Macrocomponentes

- **API HTTP**: recebe requests, valida contexto, orquestra comandos e consultas
- **Services**: concentram casos de uso
- **Repositories**: conversam com Postgres
- **Job queue**: usa tabela de jobs para processamento assíncrono com priorização, retry e DLQ
- **Worker**: consome jobs e executa integrações com health monitoring
- **Gateway CETESB**: encapsula a integração externa
- **Storage local**: persiste PDFs gerados
- **Health & Observability**: endpoints REST para monitoramento em tempo real (DL-022)
- **CI/CD Orchestration**: agente especializado para validação automática de workflows (DL-023)

## Fluxos principais

- session bootstrap
- create manifesto
- submit manifesto
- print manifesto
- cancel manifesto (individual + batch)
- catalog sync
- cadastro submit
- partner search
- manifest lookup (enriquecimento automático)

## Princípios do desenho

- contrato primeiro
- persistência antes de integração cega
- rastreabilidade por correlationId
- operação assíncrona para fluxos sensíveis
- reutilização controlada de sessão/token
- estrutura organizacional profissional (DL-021)
- locking otimista para consistência (DL-022)
- observabilidade e health monitoring (DL-022)
- validação automatizada e feedback contínuo via CI/CD (DL-023)
- **TypeScript strict em toda a camada backend** (DL-093)
- CORS explícito com origin whitelist (DL-093)

## Organização de arquivos

- **Código-fonte**: `src/` (services, repositories, gateways, workers)
- **Testes automatizados**: `tests/` (api, integration, unit, worker, smoke)
- **Testes manuais**: `tests/manual/` (debug, validação ad-hoc)
- **Documentação**: `docs/` (guias, changelogs, HARs CETESB, contexto Copilot)
- **Scripts**: `scripts/` (automação, smoke tests, batch operations)
- **Armazenamento**: `storage/temp/` (dados temporários, gitignored)
- **Veja**: `ESTRUTURA-REORGANIZADA.md` para detalhes completos
