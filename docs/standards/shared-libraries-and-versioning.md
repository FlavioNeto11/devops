---
title: "Bibliotecas compartilhadas & versionamento"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Bibliotecas compartilhadas & versionamento

> Como projetos **reúsam código** entre si sem copiar-colar. Os apps são monorepos **separados**
> (SICAT=npm, GymOps=pnpm, lockfiles distintos), então o reúso é feito por **pacotes versionados**,
> não por referência de arquivo.

## Mecanismo: GitHub Packages (npm registry do GHCR), escopo `@flavioneto11/*`

Único mecanismo agnóstico a npm **e** pnpm (ambos honram registry escopado via `.npmrc`), com
SemVer real e reúso da auth GHCR que a plataforma já tem.

### Pacotes (em `C:\devops\packages\`)
| Pacote | Função |
|---|---|
| `@flavioneto11/ai-kit` | Contrato gpt-5/gpt-5-nano (reasoning_effort, omitir temperature, `max_completion_tokens`, timeout + fallback). Core agnóstico + adapters **SDK nativo** (GymOps) e **LangChain** (SICAT). |
| `@flavioneto11/oidc-kit` | Validação de token Keycloak no `/userinfo` + cripto de sessão (HMAC, scrypt, AES-256-GCM) + helper PKCE de frontend. Adapters Express e Fastify. |

### Publicar
- Cada `packages/<pkg>` tem `package.json` com `name: @flavioneto11/<pkg>` e
  `publishConfig.registry: https://npm.pkg.github.com`.
- **Estado atual: pacotes _source-direct_** (`main: src/index.js`, **sem** passo de build; tipos
  mantidos à mão em `index.d.ts`) e em **`0.x` (pré-1.0)** — a API ainda pode mudar entre minors.
  Quando estabilizar: adotar build para `dist/` + `tsc --declaration` e subir para `1.0.0`.
- Workflow `templates/github-actions/reusable-publish-package.yaml` publica em tag/path-filter
  (**ainda não exercitado em produção** — validar o fluxo tag → publish → consumo via registry).
- `openai` e `@langchain/openai` são **peerDependencies** (cada app mantém sua versão).

### Consumir
- `.npmrc` por app: `@flavioneto11:registry=https://npm.pkg.github.com` +
  `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`.
- CI usa `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}` (escopo `read:packages`).
- App depende de `@flavioneto11/<pkg>: ^0.x` (pré-1.0; subir para `^1.x` quando a API estabilizar).

### Builds `:local` / offline
1. **Online**: o `docker build` recebe o token por build-arg para `npm ci`/`pnpm install` alcançar o GHCR npm.
2. **Offline (fallback)**: `scripts/vendor-packages.ps1` roda `npm pack` de cada `@flavioneto11/*`
   para `C:\devops\.vendor\` (transiente, ignorado) e copia os `.tgz` para `apps/<app>/vendor/`
   (estes **são versionados** — exceção no `.gitignore` — para `docker build` self-contained sem rede).
   ⚠️ Ao subir a versão de um pacote, rode `vendor-packages.ps1` novamente e **commite os `.tgz`
   atualizados em cada app consumidor** (a réplica é manual — fonte de drift se esquecida).
> GitOps não é afetado: o Argo implanta **imagens**; pacotes resolvem só em build-time.

## SemVer (política)
- `MAJOR` = quebra de API; `MINOR` = adição compatível; `PATCH` = correção.
- Cada pacote mantém `CHANGELOG.md`. Apps fixam range `^MINOR` e sobem deliberadamente.
- Mudança incompatível: anunciar em [`deprecation-policy.md`](./deprecation-policy.md) e [`ROADMAP.md`](../../ROADMAP.md).

## Quando extrair um pacote
Extraia quando **2+ apps** precisam do mesmo comportamento E ele tem fronteira clara (entrada/saída
testáveis). Não extraia código acoplado a um domínio específico. Refactor de adoção é **incremental
e reversível** (caminho antigo atrás de flag por 1 ciclo — ver [deprecation-policy](./deprecation-policy.md)).

---
_Referências: [`golden-path.md`](./golden-path.md) · [`deprecation-policy.md`](./deprecation-policy.md) · [`infra-standards.md`](./infra-standards.md) (segredos/CI)._
