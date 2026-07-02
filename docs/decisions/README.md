---
title: "Registros de Decisão de Arquitetura (ADR)"
status: reference
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# Architecture Decision Records (`docs/decisions/`)

Decisões técnicas relevantes e duráveis da plataforma, no formato ADR leve
(contexto → decisão → consequências). Numeração sequencial; um arquivo por decisão.

| ADR | Título | Estado |
|---|---|---|
| [0001](./0001-portal-progressive-enhancement.md) | Portal estático com _progressive enhancement_ | Aceito |
| [0002](./0002-requirements-as-source-of-truth.md) | Requisitos versionados como fonte da verdade (_app-over-repo_) | Aceito |
| [0003](./0003-iac-opentofu-external-surface.md) | IaC: OpenTofu para a superfície externa; Helm+Argo permanece dono do in-cluster | Aceito |
| [0004](./0004-cms-embed-no-studio.md) | Editor do CMS embutido no trilho t1 do Product Studio (deep-link → embed) | Aceito |

> Quando criar um ADR: escolhas que afetam mais de um componente, ou que alguém no futuro
> poderia questionar ("por que assim?"). Pequenas decisões locais ficam no `README.md`/código.
