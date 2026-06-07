# 11 - Release Readiness

## Objective

Consolidar a decisao de publicacao do workstream `frontend-cetesb-flows-hardening`, registrar exatamente quais arquivos pertencem a este escopo e separar explicitamente mudancas sujas fora da entrega para que o push em `origin/main` contenha apenas o hardening aprovado.

## Scope Confirmed For This Release

Arquivos confirmados como pertencentes ao workstream nesta fase:

- `src/services/manifest-service.ts`
- `tests/api/sicat-dual-auth.test.js`
- `frontend/src/composables/useCetesbOperationalFlows.js`
- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/06-frontend-ux.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/11-release-readiness.md`

## Dirty Changes Explicitly Excluded

Arquivos sujos observados no workspace que nao pertencem a este workstream e devem permanecer fora do commit:

- `docs/copilot/auditoria-links-quebrados.md`
  - alteracao observada: apenas atualizacao de timestamp e contagem agregada da auditoria de links;
  - motivo da exclusao: nao faz parte do hardening CETESB frontend.
- `package-lock.json`
  - alteracao observada: inclusao ampla de dependencias de tipagem/tooling;
  - motivo da exclusao: nao ha mudanca de dependencia exigida pelos arquivos de produto e handoff deste workstream.

## Release Validation Summary

Base de decisao consolidada a partir dos checkpoints desta cadeia:

- `09-qa-validation`: build do frontend aprovado, regressao Playwright focada aprovada, health do backend aprovado e smoke autenticado de entrega de PDF persistido localmente aprovado.
- `02-integration`: evidencia real CETESB obtida para login, vinculacao/ativacao de conta e consulta de certificados; a lacuna de `partnerCode` foi isolada com precisao.
- `03-backend-contracts`: correcao causal minima aplicada em `manifest-service.ts`, sem mudanca de contrato HTTP, com regressao automatizada focada cobrindo o fallback de `partnerCode` e a persistencia da auditoria de certificados.
- `10-documentation-final`: consolidacao final registra o blocker principal como mitigado em codigo e runtime, com rastreabilidade recuperavel por `correlationId` para `GET /v1/cdf/certificates`.

Resultado de readiness desta fase:

- decisao de publicacao: **apta para commit e push**;
- criterio usado: o risco funcional central do fluxo autenticado normal do frontend foi fechado, a observabilidade da consulta de certificados foi comprovada e os limites remanescentes sao externos ou dependem de operacoes CETESB mutaveis que nao devem ser disparadas cegamente.

## Residual Risk After Release

- continua sem evidencia de download remoto real de certificado porque as janelas seguras consultadas retornaram `0` certificados;
- `manifest.receive` real e `cdf.generate` real seguem sem nova prova E2E porque exigiriam operacoes remotas mutaveis em ambiente CETESB;
- o stream NDJSON ao vivo de um job remoto novo nao foi reprovado nesta fase final sem enfileirar operacao mutavel.

## Publish Notes

- branch avaliada nesta fase: `main` rastreando `origin/main`;
- politica aplicada: stage seletivo apenas dos arquivos confirmados do workstream;
- nenhuma reversao de mudancas alheias foi executada nesta fase.