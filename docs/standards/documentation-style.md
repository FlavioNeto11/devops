---
title: "Padrão de Escrita de Documentação"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Padrão de Escrita de Documentação

> Como escrever e organizar documentação neste repositório, para humanos **e** para agentes
> (Claude Code, Copilot). Para **meta-documentação** (CLAUDE.md / AGENTS.md / skills), ver
> [`meta-doc-standard.md`](./meta-doc-standard.md). Para regras inegociáveis de infra, ver
> [`hard-constraints.md`](./hard-constraints.md).

## 1. Idioma

- **Prosa em pt-BR.** Texto explicativo, títulos, tabelas e comentários de exemplo em português.
- **Código/identificadores/paths/YAML/CLI em inglês.** Nomes de arquivos, chaves de YAML, flags e
  comandos permanecem em inglês (alinhado ao `~/.claude/CLAUDE.md` global).
- Não traduzir termos técnicos consagrados (deploy, rollback, ingress, namespace, strip).

## 2. Nomenclatura de arquivos

| Onde | Convenção | Exemplos |
|---|---|---|
| `docs/**` | `kebab-case.md` | `golden-path.md`, `path-routing-pattern.md` |
| Raiz do repo | `UPPERCASE.md` convencional | `README.md`, `ARCHITECTURE.md`, `SECURITY.md` |
| Meta-doc por escopo | `CLAUDE.md` / `AGENTS.md` | `apps/sicat/CLAUDE.md` |
| Templates | `templates/meta/<Nome>.template` | `templates/meta/CLAUDE.md.template` |
| Efêmero antigo | `docs/archive/AAAA-MM/<nome>.md` | `docs/archive/2026-03/...` |

Evite siglas obscuras no nome do arquivo; prefira o assunto (`sso-keycloak.md`, não `sk.md`).

## 3. Front-matter (obrigatório nos docs canônicos)

Todo doc **canônico** (em `docs/standards/`, guias principais de `docs/`, `CLAUDE.md`/`AGENTS.md` e
os `.md` de raiz) abre com front-matter YAML:

```yaml
---
title: "Título legível"
status: canonical        # canonical | guide | reference | draft | deprecated | archived
applies_to: [platform]   # platform | sicat | gymops | rmambiental | console | portal | packages
updated: 2026-06-09      # data da última verificação contra a realidade (AAAA-MM-DD)
language: pt-BR
# version: "1.0"         # opcional; só quando o doc tem versionamento próprio
---
```

- **`status`**: o que o leitor pode confiar. `canonical` = fonte da verdade; `guide` = passo-a-passo;
  `reference` = consulta; `deprecated`/`archived` = não seguir (com ponteiro para o substituto).
- **`updated`**: atualize ao revisar o conteúdo contra a realidade do cluster/código.
- Runbooks curtos e READMEs de componente podem omitir o front-matter, mas ganham clareza com ele.

## 4. Estrutura do documento

- **Um único H1** (`#`) por arquivo, igual ao `title`.
- **Blockquote de propósito** logo abaixo do H1 (1–3 linhas: para que serve, para quem, links irmãos).
- **Sumário (ToC)** quando o doc tiver **mais de 5 seções** de H2.
- Hierarquia de headings sem pular nível (`#` → `##` → `###`).
- Tabelas para contratos campo-a-campo e matrizes de decisão; listas para passos.
- Blocos de código sempre com linguagem (` ```yaml `, ` ```powershell `, ` ```bash `).

## 5. Marcadores de estado (padrão único)

Ao descrever o que existe vs. o que falta, use sempre:

`✅ Implementado` · `⚠️ Parcial` · `🔵 Planejado` · `❌ Fora de escopo`

> **Nunca prometa funcionalidade inexistente.** Marque o estado real; um doc que mente é pior que
> a ausência dele.

## 6. Cross-link e fonte única

- Use **links relativos clicáveis** (`[texto](./caminho.md)`), nunca caminhos absolutos da máquina
  dentro de docs versionados (exceto o ponteiro explícito para o `~/.claude/CLAUDE.md` global).
- **Um doc canônico por assunto.** Se o conteúdo já existe, **referencie** em vez de copiar. Schema
  do `devops.yaml` → `schema/devops-schema.json` + `new-project-contract.md`; regra de roteamento →
  `hard-constraints.md`. Conteúdo duplicado diverge e mente com o tempo.
- Ao mover/renomear um doc, atualize quem aponta para ele e deixe o antigo como `status: archived`
  com link para o novo (ou registre em `docs/archive/`).

## 7. Ciclo de vida: canônico vs. efêmero

| Tipo | Onde mora | Exemplos |
|---|---|---|
| **Canônico** | `docs/`, `docs/standards/`, `docs/runbooks/`, meta-docs por escopo | golden-path, infra-standards, CLAUDE.md |
| **Efêmero** (relatórios, handoffs, diagnósticos pontuais) | `docs/archive/AAAA-MM/` (com `INDEX.md`) | entregas, validações, diagnósticos de bug |

- Relatório de tarefa concluída e log de handoff **não** ficam na raiz do app nem misturados aos
  canônicos. Vão para `docs/archive/AAAA-MM/` com uma linha no `INDEX.md`.
- Arquivar é **mover, não deletar** — preserva histórico sem poluir a leitura.

## 8. Checklist antes de salvar um doc

- [ ] Front-matter presente (docs canônicos) com `status` e `updated` corretos.
- [ ] H1 único + blockquote de propósito; ToC se > 5 seções.
- [ ] Prosa pt-BR; identificadores/paths/YAML em inglês.
- [ ] Links relativos resolvem (`Test-Path`); sem duplicar conteúdo que já existe.
- [ ] Estados marcados com os ícones padrão; nada prometido sem existir.

---
_Referências: [`meta-doc-standard.md`](./meta-doc-standard.md) · [`hard-constraints.md`](./hard-constraints.md) · [`../contributing/repo-structure.md`](../contributing/repo-structure.md)._
