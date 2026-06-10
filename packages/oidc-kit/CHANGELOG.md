# Changelog — `@flavioneto11/oidc-kit`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento segue [SemVer](https://semver.org/lang/pt-BR/). Política de mudança e
depreciação: [`../../docs/standards/deprecation-policy.md`](../../docs/standards/deprecation-policy.md).

> Registre aqui toda mudança de superfície pública (exports, assinaturas, comportamento) **antes**
> de publicar uma nova versão. `BREAKING` exige bump de MAJOR + janela de depreciação por 1 ciclo.

## [Não lançado]
- —

## [0.1.0] - 2026-06-08
### Adicionado
- Versão inicial do kit OIDC/Keycloak + sessão. **Zero dependências de runtime** (`node:crypto` +
  `fetch` global). Generaliza o padrão SICAT (validação aditiva no `/userinfo` + sessão própria do app).
- Exports `.`, `./pkce`, `./express`; tipos manuais em `index.d.ts`; testes unitários (`node --test`).
- Compatibilidade de sessão SICAT preservada (mesma cripto; prefixo de cookie configurável).
