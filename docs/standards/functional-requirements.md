---
title: "Requisitos Funcionais (FR) — índice e template"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Requisitos Funcionais (FR) — índice e template

> O **o quê** de cada app (não o como). Cada app tem um arquivo em [`fr/`](./fr/) com escopo,
> atores, casos de uso, critérios de aceite e — importante — o **estado real (pronto vs falta)**.
> Esses estados alimentam o **seed do módulo Projetos & Tarefas** do Console (Fase 3).

## Apps

| App | FR | Rota | Estado |
|---|---|---|---|
| SICAT | [`fr/sicat.md`](./fr/sicat.md) | `/sicat` | ~75% |
| GymOps | [`fr/gymops.md`](./fr/gymops.md) | `/gymops` | ~95% |
| RM Ambiental | [`fr/rmambiental.md`](./fr/rmambiental.md) | `/rmambiental` | 100% (estático) |
| DevOps Console | [`fr/devops-console.md`](./fr/devops-console.md) | `/devops` | read-only + módulo PM |

## Template (copie para `fr/<app>.md`)

```markdown
# FR — <App>

- **Rota**: /<app>   ·   **Repo**: apps/<app>   ·   **Stack**: <...>   ·   **Estado**: <%>

## Propósito
Uma frase: que problema o app resolve e para quem.

## Atores
Quem usa (papéis) e o que cada um faz.

## Escopo
- **Dentro**: ...
- **Fora**: ...

## Casos de uso / histórias
- Como <ator>, quero <ação> para <valor>.

## Critérios de aceite
- [ ] Comportamento observável e verificável.

## Entidades de dados
Principais entidades e relações (alto nível).

## Integrações
Externas (CETESB, OpenAI, Keycloak, R2, etc.).

## Estado (pronto vs falta)  ← fonte do seed do módulo PM
### Pronto
- ...
### Falta (com tipo/prioridade)
- [feature|bug|evolution] <título> (Pxx) — <obs>

## Perguntas em aberto
- ...
```

## Convenções

- **Tipos de item** (alinhados ao módulo PM): `bug`, `feature`, `evolution`.
- **Prioridade**: `P0` (crítico) … `P3` (baixo).
- Mantenha a seção "Estado" **viva**: ao concluir/abrir trabalho, atualize aqui — é a fonte
  canônica que o seed do Console consome.

---
_Referências: [`golden-path.md`](./golden-path.md) · módulo Projetos & Tarefas (Fase 3)._
