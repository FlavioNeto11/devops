# `specs/forge/capabilities/` — catálogo de BLOCOS DE CAPACIDADE do Forge

Catálogo declarativo das capacidades que o **Forge** compõe sobre um blueprint para gerar sistemas
robustos (nível SICAT/GymOps), não só CRUD. Cada bloco aponta para um **exemplar real** do monorepo,
declara dependências/conflitos com outros blocos, o overlay de scaffold que adiciona, a orientação para
o `/implement-req` e os critérios de verificação.

## Layout
```
specs/forge/capabilities/
  blocks/<id>.json     # um bloco por arquivo (id == nome do arquivo)
  README.md
schema/capability.schema.json   # schema (vive em specs/schema/ junto dos demais)
```

## Regras (validadas por `specs/tools/build-products.mjs`)
- `id` casa o nome do arquivo (`^[a-z0-9-]+$`).
- **Anti-fabricação:** todo `reference[].path` tem de **existir no repo** (`fs.existsSync`) — exemplar
  fantasma **quebra o build**.
- `requires[]`/`conflicts_with[]` só apontam para blocos reais do catálogo (→ ordem de wave).
- `verification[].method` reusa o enum canônico de `verification_method` dos requisitos.
- Blueprints (`specs/blueprints/<id>/blueprint.json`) referenciam blocos em `default_blocks`/
  `compatible_blocks`; o build valida que existem e são **stack-compatíveis** (`compatible_stacks` ⊇ `base_stack`).

## Como a IA usa (princípio `ai-no-hardcoded-heuristics`)
A Forge propõe blocos **raciocinando sobre a `description`** (não por palavra-chave). O índice plano
`specs/baseline/capabilities.json` (gerado, não editar à mão) é assado na imagem e consumido pelos
prompts/tools (`apps/reqhub/api`) e pela UI. Seleção inválida (bloco fora do blueprint/stack, conflito,
citation fantasma) é **fail-closed** (descartada server-side).

## Regenerar / checar
```
node specs/tools/build-products.mjs           # valida catálogo + blueprints/produtos; gera baseline/{blueprints,products,capabilities}.json
node specs/tools/build-products.mjs --check    # CI: não escreve; falha em erro OU drift (gate specs-governance)
```

## Os blocos (15)
`camadas-rigidas` · `worker-queue-transacional` · `redis-bullmq` · `gateway-externo` · `oidc-sessao` ·
`rbac-multitenant` · `structured-outputs` · `ia-grafo` · `rag-pgvector` · `contract-openapi` ·
`idempotencia` · `migrations-versionadas` · `design-system` · `observabilidade` (DEFAULT) ·
`notificacoes-multicanal`.
