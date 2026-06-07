# DL-043 — Auto cadastro de usuário no login SICAT

## Status
- ✅ COMPLETADO em 2026-03-13

## Objetivo
Permitir criação de usuário SICAT na própria tela de login, removendo dependência de pré-cadastro manual no banco ou via variável de bootstrap.

## Escopo implementado
- Contrato: `POST /v1/sicat/auth/register`
- Backend: criação de usuário com validação + emissão de tokens
- Frontend: formulário de cadastro no `LoginView`
- Testes: sucesso e conflito por e-mail já existente

## Arquivos-chave
- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/routes/api-routes.js`
- `src/services/sicat-auth-service.js`
- `frontend/src/services/api.js`
- `frontend/src/stores/auth.js`
- `frontend/src/views/LoginView.vue`
- `tests/api/sicat-dual-auth.test.js`

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-043`
- Estrutura: `docs/copilot/14-estrutura-copilot.md`
