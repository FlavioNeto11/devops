# Onboarding do projeto

## O que é este projeto

Este repositório `sicat` contém, neste momento, o backend de automação MTR CETESB como um dos núcleos principais do produto.

Backend Node.js para automação de processos do MTR CETESB, com:
- API interna orientada a OpenAPI
- persistência em Postgres
- fila transacional via tabela `jobs`
- worker dedicado
- gateway externo CETESB em modo `real`
- armazenamento local de documentos gerados

## Objetivo do sistema

Expor uma API interna estável para automatizar fluxos do portal MTR CETESB sem depender do front oficial como ponto de orquestração.

## Situação atual

O projeto já possui:
- contrato OpenAPI
- rotas Express
- serviços e repositórios
- worker assíncrono
- integração real parcial com a CETESB baseada nos HARs analisados
- bootstrap de sessão com JWT reaproveitável
- submit, print, cancel e catalog sync

## Limitações atuais

- recaptcha não é automatizado
- integração real não foi validada ponta a ponta neste ambiente
- faltam testes automatizados robustos
- ainda há hipóteses operacionais inferidas a partir de HAR

## Primeiro caminho para quem vai trabalhar

1. leia este diretório `docs/copilot/`
2. abra `README.md`
3. revise `openapi/mtr_automacao_openapi_interna.yaml`
4. inspecione `src/gateways/cetesb-gateway.js`
5. veja `src/workers/operation-handlers.js`
6. consulte `docs/copilot/10-backlog-executavel.md`
