# `specs/` — regras de consumo da base de requisitos (para o Claude)

> Este arquivo é a **ponte**: ele NÃO duplica o conteúdo dos requisitos — aponta para a baseline
> gerada e define como o Claude deve consumi-la. Conteúdo e fluxo humano: [`README.md`](./README.md).

## A regra de ouro

**A fonte da verdade da _intenção_ do projeto são os requisitos** em `specs/requirements/**` —
materializados, para consumo, na baseline gerada `specs/baseline/current-baseline.json`. O **código**
é a verdade da _implementação_; os **requisitos** são a verdade da intenção, limites, critérios de
aceite, dependências e impactos. Quando as duas divergem, a divergência é um trabalho a resolver, não
um detalhe.

## O que o Claude deve fazer

1. **Antes de decidir implementação** em SICAT, GymOps ou no CMS/portais, **consulte a baseline**
   (`specs/baseline/current-baseline.json`) e o requisito específico (campo `file` → o YAML). Não
   confie em memória de sessão para a intenção — ela vive nos arquivos versionados.
2. **Ao alterar ou criar um requisito**, trate como **questão de versão**: incremente
   `version.item_revision`, classifique `version.semantic_change` (patch/minor/major) com
   `change_reason`, e **regenere a baseline** (skill **`/sync-spec`** ou
   `scripts/specs-baseline-check.ps1 -Fix`). Commite requisitos + baseline **juntos**.
3. **Em mudança `major` ou em requisito `architectural_significance: true` (ASR)**, rode
   **`/impact-review`**: percorra `specs/baseline/impact-map.json` para achar o conjunto afetado
   (requisitos, ADRs, serviços, infra, testes) e a `reprocess_queue`, e só então proponha a mudança.
4. **Nunca edite `specs/baseline/*.json` à mão** (é gerado). Nunca **fabrique** rastreabilidade:
   `links` só apontam para alvos reais (o gerador falha em link pendente).
5. **Arquitetura e infra são artefatos _derivados_** dos requisitos (`allocation.*_refs`), não um meio
   paralelo. Ao mexer em arquitetura/infra, ligue de volta ao requisito que a motiva.

## Gatilho de reprocessamento

Mudança em `specs/requirements/**` exige sincronizar a baseline; o CI **`specs-governance`** falha se a
baseline commitada estiver desatualizada (drift) ou inválida (schema/integridade), e **`specs-diff`**
publica o relatório de impacto no PR. Esse é o mecanismo que força a atenção do Claude ao reprocessar.

## Skills

`/sync-spec` (sincronizar/regerar + checar drift) · `/impact-review` (impacto de uma mudança) ·
`/baseline-diff` (diff/classificação entre versões). Fronteiras de operação: [`../AGENTS.md`](../AGENTS.md) §5.
