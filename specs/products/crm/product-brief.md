---
title: "CRM-lite — brief do produto (FORGE)"
status: approved
applies_to: [crm]
language: pt-BR
---

# CRM-lite — brief

Produto greenfield gerado pela esteira FORGE a partir destes requisitos. Blueprint:
`node-api-vue-spa` (SPA Vue 3 + API Node/Express + worker + Postgres).

## Visão
Um CRM enxuto para pequenas operações de vendas. O operador cadastra **contatos** e
**empresas**, registra **negócios (deals)** num funil de estágios simples, e acompanha
tudo num **painel** com listagens e busca. Princípio: uma tarefa por tela, baixo atrito.

## Personas
- **Operador de vendas:** cadastra contatos/empresas, move negócios pelo funil.
- **Gestor comercial:** vê o painel (totais por estágio, últimos negócios).

## Escopo
- **Dentro (v1):** autenticação básica; CRUD de contatos; CRUD de empresas (com vínculo
  contato↔empresa); funil de negócios com estágios (lead → qualificado → proposta →
  ganho/perdido); painel com totais e listagens com busca.
- **Fora (v1):** automações, e-mail/WhatsApp, importação em massa, relatórios avançados,
  RBAC fino, multi-tenant.

## Arquitetura-alvo (resumo)
- **Frontend:** Vue 3 + Vite, servido em `/crm/` (sem strip).
- **API:** Node/Express com camadas route → service → repository; rotas em `/crm/api` (strip).
- **Banco:** Postgres (tabelas `companies`, `contacts`, `deals`); migrations SQL + seed.
- **Worker:** mesma imagem da API (reservado p/ tarefas async futuras).

## Critério de "pronto" (v1)
`/crm` e `/crm/api/health` respondem; é possível criar/editar/listar contatos, empresas e
negócios pelo app; o painel mostra os totais por estágio; smoke E2E do CRUD verde.
