# Changelog — `@flavioneto11/ai-kit`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento segue [SemVer](https://semver.org/lang/pt-BR/). Política de mudança e
depreciação: [`../../docs/standards/deprecation-policy.md`](../../docs/standards/deprecation-policy.md).

> Registre aqui toda mudança de superfície pública (exports, assinaturas, comportamento) **antes**
> de publicar uma nova versão. `BREAKING` exige bump de MAJOR + janela de depreciação por 1 ciclo.

## [Não lançado]
- —

## [0.1.0] - 2026-06-08
### Adicionado
- Versão inicial do contrato compartilhado de IA (gpt-5/reasoning). **Zero dependências de runtime**:
  o cliente OpenAI é injetado por quem chama; para LangChain devolve os _args_ do construtor.
- Tipos manuais em `index.d.ts` e testes unitários (`node --test`).
