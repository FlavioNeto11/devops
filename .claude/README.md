---
title: ".claude/ — Configuração do harness Claude Code (plataforma)"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# `.claude/` — harness do Claude Code

Esta pasta é **configuração do harness** do Claude Code para o repo `C:\devops`. Pela
`docs/standards/meta-doc-standard.md` §7, config do harness (`settings.json`, hooks, permissões,
skills, subagents) é **config, não meta-documentação** — então ela **complementa** e **não duplica**
o `AGENTS.md` (contrato de fronteiras) nem o `CLAUDE.md` (camada específica do Claude). A fonte única
das fronteiras de operação continua sendo o [`AGENTS.md`](../AGENTS.md) §5; aqui só as
**aplicamos** ao harness.

## Conteúdo

| Caminho | O que é | Papel |
|---|---|---|
| `settings.json` | Permissões do Claude Code (`permissions.allow` / `deny`) | Pré-aprova ops read-only/idempotentes (kubectl/helm/git de leitura + scripts read-only) e **bloqueia** as perigosas (force push, editar `*.secret.yaml`/`secret.yaml`, ler/editar `.env`/`.env.docker`, `reset-platform.ps1`). Espelha `AGENTS.md` §5. |
| `skills/onboard-app/SKILL.md` | Skill | Golden path para scaffoldar/onboardar um app novo (`new-app.ps1` + `devops.yaml` + manifests + Application do Argo). |
| `skills/platform-health/SKILL.md` | Skill | Roda `validate-platform.ps1` e resume a saúde do cluster (read-only). |
| `agents/infra-diagnostician.md` | Subagent | Diagnóstico read-only de plataforma/cluster (tools limitadas; sem Write/Edit). |

## Princípios

- **Sem duplicação**: fronteiras/decisão moram só no `AGENTS.md`; armadilhas/env/debug só no
  `CLAUDE.md`. Este README só descreve a config.
- **Permissões = espelho do `AGENTS.md` §5**: o que é "seguro" lá vira `allow`; o que é "proibido"
  vira `deny`. Ops "com aprovação" (publicar, recover, install, set-domain, apply/delete em recurso
  vivo) **não** entram no `allow` — exigem confirmação do operador a cada vez.
- **Segredos**: `Edit` de `*.secret.yaml`/`secret.yaml` e `Read`/`Edit` de `.env`/`.env.docker`
  ficam em `deny` — os arquivos `*.example` continuam legíveis (são templates). Ver
  [`SECURITY.md`](../SECURITY.md) e `hard-constraints.md` §3.
- **Hooks**: intencionalmente ausentes por ora. Podem ser adicionados depois em `settings.json`
  (ex.: `PostToolUse` para lint/format), tratados como tarefa de config à parte.
- **Local override**: para ajustes pessoais não versionados, use `.claude/settings.local.json`
  (não comitado), que tem precedência sobre `settings.json` no mesmo escopo.

## Referências

- Contrato/fronteiras: [`AGENTS.md`](../AGENTS.md) · Claude: [`CLAUDE.md`](../CLAUDE.md)
- Padrão de skills: [`docs/standards/meta-doc-standard.md`](../docs/standards/meta-doc-standard.md) §7
- Golden path: [`docs/standards/golden-path.md`](../docs/standards/golden-path.md)
- Docs oficiais: settings, skills e sub-agents do Claude Code (code.claude.com).
