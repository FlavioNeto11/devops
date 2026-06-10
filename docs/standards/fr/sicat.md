---
title: "Requisitos Funcionais (FR) — SICAT"
status: canonical
applies_to: [sicat]
updated: 2026-06-09
language: pt-BR
---

# FR — SICAT

- **Rota**: `/sicat` · **Repo**: `apps/sicat` · **Stack**: Vue 3 + Vite / Node 20 + Express + TS / PostgreSQL / worker · **Estado**: ~75%

## Propósito
Plataforma de gestão de licenciamento ambiental e conformidade regulatória (CETESB): manifestos
de transporte de resíduos (MTR), declarações (DMR), geração de CDF e um assistente conversacional
de IA que orienta o operador.

## Atores
Operadores ambientais, administradores (RBAC), e o assistente de IA (apoio, nunca decide sozinho).

## Integrações
CETESB (gateway MTR/DMR; DMR real via captura HAR — hoje stub 503), OpenAI (gpt-5/gpt-5-nano via
LangChain + RAG), Keycloak (OIDC realm `nvit`, padrão aditivo).

## Estado (pronto vs falta)  ← seed do módulo PM

### Pronto
- Auth: login próprio + **OIDC Keycloak** (`/userinfo` + sessão própria).
- Manifestos: CRUD MTR e DMR; geração de CDF; filas/jobs; contextos de sessão; RBAC admin.
- Frontend: dashboard, manifestos, jobs, conta CETESB, admin de acesso, relatório operacional.
- MTR provisório (base): criar, listar, cancelar, imprimir (submissão assíncrona).
- DMR declaratório (base): CRUD + consolidar + submeter (lock Postgres + DLQ).
- Workers: submit/print/cancel assíncronos com retry/DLQ.
- k8s: Sealed Secrets (`sicat-config`, `sicat-db`), roteamento Traefik, Kustomize.
- IA: conversação estruturada (gpt-5-nano judge) + RAG LangChain.

### Falta
- [evolution] **Centro Operacional SICAT** (observabilidade/diagnóstico/relatórios) — P1
- [feature] **Gateway HAR real da CETESB para DMR** (hoje stub 503) — P1
- [feature] **Chat orquestrador (Command Center)** — P2
- [evolution] Refinos de UX no frontend (DL-098/099/100) — P2

## Perguntas em aberto
- Escopo mínimo do Centro Operacional para go-live.
