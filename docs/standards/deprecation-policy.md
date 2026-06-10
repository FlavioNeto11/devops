---
title: "Política de depreciação"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Política de depreciação

> Como remover/trocar algo (campo do `devops.yaml`, rota, comportamento de lib) **sem quebrar**
> quem depende. Vale para pacotes `@flavioneto11/*`, contratos e rotas.

## Ciclo

1. **Marcar como deprecated** — no código (`@deprecated` + log de aviso uma vez por processo),
   no `CHANGELOG.md` do pacote e em [`ROADMAP.md`](../../ROADMAP.md).
2. **Manter o caminho antigo por ≥1 MINOR** — funcionando em paralelo ao novo.
3. **Remover no próximo MAJOR** — com nota de migração no CHANGELOG.

## Refactor de adoção (Fase 2) — "flag por um ciclo"

Ao migrar um app para uma lib compartilhada, mantenha o caminho antigo atrás de uma **flag de
ambiente** (ex.: `AI_KIT=off`, `OIDC_KIT=off`) que reverte ao comportamento inline anterior.

- Etapa N: adota a lib, **mantém** o legado atrás da flag (default = lib ligada). Valida em produção.
- Etapa N+1 (commit separado, ≥1 ciclo depois): **remove** o caminho legado e a flag.

Assim cada troca é isolada, verificável e revertível com 1 variável de ambiente.

## Rotas

Rota deprecada responde por 1 ciclo com header `Deprecation: true` + `Sunset: <data>` antes de sair.

## Contrato `devops.yaml`

Campo deprecado continua aceito (com aviso) por ≥1 MINOR; o `new-app.ps1`/template param de gerá-lo
imediatamente e a remoção definitiva vai no próximo MAJOR do contrato, anunciada no ROADMAP.

---
_Referências: [`shared-libraries-and-versioning.md`](./shared-libraries-and-versioning.md) · [`ROADMAP.md`](../../ROADMAP.md)._
