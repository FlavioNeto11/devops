---
title: "@flavioneto11/ai-kit — Contrato de Agentes"
status: canonical
applies_to: [packages]
updated: 2026-06-09
language: pt-BR
---

# @flavioneto11/ai-kit — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, Copilot, futuros) lê este arquivo
> primeiro ao trabalhar em `packages/ai-kit`. Setup técnico e exemplos de uso vivem no
> [`README.md`](./README.md) — este contrato não os duplica. Padrão de meta-doc:
> [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).
>
> Contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md). Em conflito, a regra do escopo mais
> específico prevalece se marcada explicitamente.

## 1. Propósito e exports

Contrato compartilhado de IA (gpt-5 / modelos de reasoning) da plataforma. Centraliza, num único
lugar, o que hoje estaria duplicado em SICAT (LangChain) e GymOps (SDK nativo): omitir `temperature`
em modelos de reasoning, usar `reasoning_effort`, e timeout + fallback gracioso. **Zero dependências
de runtime** — o cliente OpenAI é injetado por quem chama; para LangChain o pacote devolve os _args_
do construtor.

- **Versão atual:** `0.1.0` · `type: module` (ESM) · `main: src/index.js` (source-direct, **sem build**).
- **Entry único** (`.`): consultar a seção **API** do [`README.md`](./README.md) para a lista canônica
  de funções exportadas (`isReasoningModel`, `resolveReasoningEffort`, `buildChatParams`,
  `buildChatOpenAIArgs`, `withTimeout`, `callWithFallback`, `chatJSON`, `chatText`).
- **peerDependencies opcionais:** `openai` (>=4, para `chatJSON`/`chatText`) e `@langchain/openai`
  (>=0.3, para construir o `ChatOpenAI`). Cada app mantém a própria versão — **não** promover a
  dependency normal.
- Implementação em `src/index.js`; testes em `test/ai-kit.test.js` (`node --test`, zero deps).

## 2. Versionamento

Política de SemVer, publicação no GitHub Packages (`@flavioneto11/*`) e quando extrair um pacote:
[`../../docs/standards/shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).
Resumo operacional:

- `MAJOR` = quebra de API; `MINOR` = adição compatível; `PATCH` = correção. Apps fixam range e sobem
  deliberadamente.
- Quebra de contrato em função exportada é **MAJOR** — SICAT e GymOps consomem este pacote.
- Mudança incompatível precisa ser anunciada conforme a política de versionamento antes de publicar.

## 3. Fronteiras de operação

### ✅ Seguras (autônomas)
- Ler `src/`, `test/`, `README.md`, `package.json`.
- Rodar os testes: `npm test` (`node --test`, sem rede e sem deps).
- Adições compatíveis com o contrato (nova função/option opcional) **com teste correspondente**.

### ⚠️ Com aprovação do operador
- Mudar a assinatura/comportamento de função exportada (impacto em SICAT e GymOps).
- Bump de `version` e qualquer publicação no GitHub Packages registry.
- Adicionar/alterar `peerDependencies` ou introduzir dependência de runtime (viola o "zero deps").

### ⛔ Proibidas
- `git push --force` em `main` (ver [`../../AGENTS.md`](../../AGENTS.md) §5).
- Commitar segredo real (`OPENAI_API_KEY` etc.) — o pacote nunca lê chaves; o cliente é injetado.
- Pular hooks (`--no-verify`) sem pedido explícito.
- Regras de infra inegociáveis: [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (referência, não copiar).

## 4. Validação obrigatória

```bash
npm test   # node --test (zero deps, sem rede)
```

## 5. Princípios não-negociáveis

1. **AGENTS.md é a fonte das fronteiras**; não duplicar setup/exemplos (vivem no `README.md`).
2. **Zero dependências de runtime** — cliente injetado; `openai`/`@langchain/openai` ficam como peer opcional.
3. **Contrato estável** — quebrar export = MAJOR + anúncio (ver doc de versionamento §2).
4. **Toda mudança vem com teste** (`node --test`) e estado real documentado, sem promessas.
