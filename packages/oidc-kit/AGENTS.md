---
title: "@flavioneto11/oidc-kit — Contrato de Agentes"
status: canonical
applies_to: [packages]
updated: 2026-06-09
language: pt-BR
---

# @flavioneto11/oidc-kit — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, Copilot, futuros) lê este arquivo
> primeiro ao trabalhar em `packages/oidc-kit`. Setup técnico e exemplos de uso vivem no
> [`README.md`](./README.md) — este contrato não os duplica. Padrão de meta-doc:
> [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).
>
> Contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md). Em conflito, a regra do escopo mais
> específico prevalece se marcada explicitamente.

## 1. Propósito e exports

Kit OIDC/Keycloak + sessão da plataforma. Generaliza o padrão SICAT — validação **aditiva** do token
no `/userinfo` do Keycloak + sessão própria do app — para reúso por outros apps. **Zero dependências
de runtime** (`node:crypto` + `fetch` global).

- **Versão atual:** `0.1.0` · `type: module` (ESM) · `main: src/index.js` (source-direct, **sem build**).
- **Entries (`exports`):**
  - `.` — Node: validação de token Keycloak, conversão de claims e cripto de sessão (HMAC / scrypt /
    AES-256-GCM). Implementação em `src/index.js`, `src/keycloak.js`, `src/session.js`.
  - `./pkce` — helper PKCE de frontend (`startKeycloakLogin`, `exchangeKeycloakCode`). `src/pkce.js`.
  - `./express` — middleware `requireSession` para Express. `src/express.js`.
- Lista canônica de funções por entry: seções **Entry Node** e **Frontend PKCE** do [`README.md`](./README.md).
- **Sem `peerDependencies`** declaradas. Testes em `test/oidc-kit.test.js` (`node --test`, zero deps).
- **Compatibilidade de sessão (SICAT):** a cripto é byte-a-byte idêntica à de
  `apps/sicat/.../lib/sicat-security.ts`; com `prefix: 'sicat_access'` / `'sicat_refresh'` os tokens
  são byte-compatíveis (sessões vivas continuam válidas). **Não alterar a cripto sem preservar essa
  compatibilidade.**

## 2. Versionamento

Política de SemVer, publicação no GitHub Packages (`@flavioneto11/*`) e quando extrair um pacote:
[`../../docs/standards/shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).
Resumo operacional:

- `MAJOR` = quebra de API; `MINOR` = adição compatível; `PATCH` = correção. Apps fixam range e sobem
  deliberadamente.
- Qualquer mudança no formato/cripto dos tokens de sessão é, na prática, **quebra** — invalida
  sessões vivas → tratar como MAJOR e anunciar conforme a política de versionamento antes de publicar.

## 3. Fronteiras de operação

### ✅ Seguras (autônomas)
- Ler `src/`, `test/`, `README.md`, `package.json`.
- Rodar os testes: `npm test` (`node --test`, sem rede e sem deps).
- Adições compatíveis (nova option opcional, novo helper) **com teste** e **sem mexer no wire format**.

### ⚠️ Com aprovação do operador
- Mudar assinatura/comportamento de qualquer export (impacta apps que adotaram o kit).
- Tocar na cripto de sessão ou no formato dos tokens (risco de invalidar sessões — ver §1).
- Bump de `version` e publicação no GitHub Packages registry.
- Introduzir dependência de runtime (viola o "zero deps": `node:crypto` + `fetch` apenas).

### ⛔ Proibidas
- `git push --force` em `main` (ver [`../../AGENTS.md`](../../AGENTS.md) §5).
- Commitar segredo real (secret de sessão, client secret OIDC, chaves) — guardar via Sealed Secrets.
- Pular hooks (`--no-verify`) sem pedido explícito.
- Regras de infra inegociáveis: [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (referência, não copiar).

## 4. Validação obrigatória

```bash
npm test   # node --test (zero deps, sem rede)
```

## 5. Princípios não-negociáveis

1. **AGENTS.md é a fonte das fronteiras**; não duplicar setup/exemplos (vivem no `README.md`).
2. **Zero dependências de runtime** — apenas `node:crypto` + `fetch` global.
3. **Compatibilidade de sessão é sagrada** — não quebrar o wire format SICAT sem MAJOR + anúncio.
4. **Integração OIDC é aditiva** (padrão SICAT) — não tocar em outras auths ao adotar o kit.
5. **Toda mudança vem com teste** (`node --test`) e estado real documentado, sem promessas.
