---
name: sync-spec
description: Sincroniza a base de requisitos (fonte da verdade) após criar/alterar requisitos — regenera a baseline consumida pelo Claude e checa drift. Use sempre que editar specs/requirements/**, ANTES de tomar decisões de implementação, ou quando a baseline puder estar desatualizada.
argument-hint: "[--fix]"
---

# sync-spec — sincronizar a base de requisitos

A fonte da verdade do projeto são os **requisitos versionados** em `specs/requirements/**/*.yaml`
(schema em `specs/schema/requirement.schema.json`). A baseline que o Claude e a UI consomem
(`specs/baseline/{current-baseline,impact-map,retrieval-manifest}.json`) é **gerada** desses
artefatos — nunca editada à mão. Detalhes: `specs/README.md` e `specs/CLAUDE.md`.

## Regras de ouro (não quebrar)

- **Nunca decida implementação sem consultar `specs/baseline/current-baseline.json`** (a verdade da
  intenção/limites/critérios). O código é a verdade da implementação; a baseline é a da intenção.
- Toda alteração de requisito **gera uma questão de versão** (`version.semantic_change`:
  patch=editorial, minor=compatível, major=incompatível) e **exige regenerar a baseline**.
- `specs/baseline/*.json` é **gerado + commitado**: precisa estar em dia com `specs/requirements/**`
  (o CI `specs-governance` falha em drift).

## Fluxo

1. **Ler a baseline atual** antes de agir: `specs/baseline/current-baseline.json` (requisitos,
   `counts`, `reprocess_queue`). Para um requisito específico, abra o YAML apontado em `file`.
2. **Editar/criar requisitos** em `specs/requirements/<produto>/REQ-*.yaml` conforme o schema.
   Ao mudar conteúdo, **incremente `version.item_revision`** e classifique `version.semantic_change`
   (+ `change_reason`); mudança incompatível (major) sobe a baseline (`baseline_version`).
3. **Regenerar a baseline**:
   ```powershell
   C:\devops\scripts\specs-baseline-check.ps1 -Fix    # = npm run build em specs/tools
   ```
4. **Conferir o drift** (o que o CI vai checar): `scripts/specs-baseline-check.ps1` (sem flag) — deve
   sair OK. Em mudança **major** ou em requisito **ASR**, rode também a skill **impact-review**.
5. **Commitar juntos** os requisitos (`specs/requirements/**`) e a baseline regenerada
   (`specs/baseline/**`) — nunca um sem o outro.

## Atalhos

- Só validar (sem regerar): `node specs/tools/build-baseline.mjs --check`.
- Ver impacto de uma mudança: skill **impact-review**. Comparar versões: skill **baseline-diff**.
