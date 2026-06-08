# Como Usar Agentes de IA no GymOps

**Última atualização**: 2026-05-16

> **Público**: desenvolvedores e contribuidores que usam **GitHub Copilot Chat (VS Code Insiders/Stable)** e/ou **Claude Code** neste repositório.

Este guia é prático: o que digitar, o que esperar, como evitar conflito.

---

## Setup rápido

### GitHub Copilot Chat (VS Code Insiders recomendado)

1. Instalar extensão GitHub Copilot e GitHub Copilot Chat
2. Abrir o repositório no VS Code Insiders
3. Reiniciar VS Code — a extensão carrega automaticamente:
   - `.github/copilot-instructions.md` como instruções globais
   - `.github/instructions/*.instructions.md` por path quando o arquivo entra no contexto
   - `.github/prompts/*.prompt.md` ficam disponíveis como `/<nome>` no chat
4. Verificar: digitar `/` no chat — deve aparecer a lista de prompts disponíveis

### Claude Code

1. Instalar/abrir Claude Code no diretório do repositório
2. Claude Code automaticamente lê:
   - `CLAUDE.md` (raiz) como instruções
   - `AGENTS.md` como contrato compartilhado
3. Nada a configurar — `pnpm install` e estamos prontos

---

## Para cada tipo de tarefa, o que dizer

### Implementar uma sprint inteira

**Copilot Chat (VS Code Insiders)**:
```
/implement-sprint
Implementar a sprint 11 (Equipe e Convites) seguindo tasks/sprint-11.md
```

**Claude Code**:
```
Implementa a sprint 11 seguindo tasks/sprint-11.md. Quando terminar, atualiza docs e me dá relatório.
```

### Criar uma tela administrativa

**Copilot Chat**:
```
/implement-admin-screen
Criar a tela /settings/team conforme docs/admin-ui-blueprint.md
```

**Claude Code**:
```
Cria a tela de equipe (/settings/team) seguindo o blueprint. Owner e org_manager veem todos; unit_manager só sua unidade.
```

### Adicionar endpoint

**Copilot Chat**:
```
/add-api-endpoint
Adicionar GET /audit-logs com paginação e filtros por action/date, owner-only
```

**Claude Code**:
```
Adiciona GET /audit-logs (owner-only, paginado 50/pág, filtros action, dateFrom, dateTo).
```

### Alterar permissão (RBAC)

**Copilot Chat**:
```
/update-rbac
Permitir que unit_manager veja delivery log da sua unidade
```

**Claude Code**:
```
Atualiza rbac-matrix: unit_manager passa a ver delivery log filtrado pela unidade dele. Ajusta backend, frontend, testes e docs.
```

### Criar teste E2E

**Copilot Chat**:
```
/create-e2e-flow
Cobrir o fluxo 5 (convite e onboarding) em playwright
```

**Claude Code**:
```
Cria spec playwright pro fluxo de convite e onboarding conforme docs/e2e-business-flows.md fluxo 5.
```

### Revisar segurança

**Copilot Chat**:
```
/review-security
```

**Claude Code**:
```
Faz uma revisão de segurança completa nas rotas de auth e nas integrações.
```

### Sincronizar docs

**Copilot Chat**:
```
/sync-docs
```

**Claude Code**:
```
Sincroniza os docs com as mudanças do último commit (status, sprints, api-spec).
```

### Diagnosticar CI

**Copilot Chat**:
```
/fix-ci
[colar output do CI]
```

**Claude Code**:
```
O lint tá falhando com isso aqui: [output]. Diagnostica e corrige.
```

### Refatorar arquivo grande

**Copilot Chat**:
```
/refactor-large-file
Refatorar apps/web/src/app/(app)/units/[id]/page.tsx (700 linhas)
```

**Claude Code**:
```
Refatora units/[id]/page.tsx sem mudar comportamento. Extrai subcomponentes.
```

### Gerar resumo de PR

**Copilot Chat**:
```
/prepare-pr-summary
```

**Claude Code**:
```
Monta um resumo de PR pras mudanças desta branch comparado com main.
```

---

## Qual agente usar para cada tipo de tarefa

Para escolher rapidamente, ver [`docs/agent-task-routing.md`](agent-task-routing.md).

Em resumo:

| Tarefa | Agente |
|---|---|
| Sprint inteira / multi-camada | `gymops-orchestrator` |
| Tela admin (UX + impl) | `product-admin` + `frontend-next` |
| Endpoint Fastify | `backend-fastify` |
| RBAC | `rbac-security` |
| Schema/migration | `database-prisma` |
| Integração externa | `integrations` |
| Teste E2E | `testing-e2e` |
| Docs | `docs-roadmap` |

No **Claude Code** os agentes são acionados como subagentes via a Task tool — você não precisa nomear, ele escolhe. Mas pode pedir explicitamente: "use o orquestrador" / "envolva o rbac-security".

No **Copilot Chat**, agente especialista não tem comando dedicado — você cita no prompt: "como especialista em backend Fastify, faz X".

---

## Exemplos curtos de prompts efetivos

### Bons prompts

✅ "Adiciona DELETE /units/:id com soft archive e audit log. Owner e org_manager."

✅ "Tem alguma divergência entre o frontend e o backend em quem pode criar atividade? Compara com rbac-matrix."

✅ "Roda lint+typecheck+test no api e me diz se algo quebrou desde o último commit."

✅ "Lê docs/sprints.md e me diz qual sprint deveria ser a próxima e por quê."

### Prompts ruins (evitar)

❌ "Melhora o código" (vago)

❌ "Implementa o que falta" (sem escopo claro)

❌ "Conserta esse bug" (sem detalhe do bug)

❌ "Faz refator" (sem escopo nem objetivo)

---

## Como evitar conflito entre Copilot e Claude

### Regras práticas

1. **Trabalhem em branches diferentes** se rodar os dois em paralelo
2. **Sincronize via PR**, não via main direta
3. **Atualize `docs/status.md`** ao terminar — ambos leem isso na próxima sessão
4. **Não confie em "lembrança"** de sessão anterior — agentes são stateless por sessão
5. **Em conflito de aresta**, `AGENTS.md` vence sobre regras locais de ferramenta

### Quando preferir um sobre o outro

- **Copilot Chat**: bom para edição inline rápida, autocompletar enriquecido, prompts curtos, contexto do arquivo aberto
- **Claude Code**: bom para tarefas grandes/multi-camada, automação CLI, sprints inteiras, refator extenso, análise transversal

Não é regra rígida — usar o que for mais produtivo.

---

## Como exigir validação

Sempre peça explicitamente quando achar que pode ser pulado:

✅ "Roda lint, typecheck e test no final. Não esquece."

✅ "Antes de marcar como pronto, executa pnpm typecheck e me mostra o output."

✅ "Não esquece de atualizar docs/status.md."

---

## Como pedir execução de uma sprint

Boa prática:

```
Implementa a sprint 12 (Central Global de Atividades) seguindo tasks/sprint-12.md.

Importante:
- Não inventa endpoint que não está na sprint
- Atualiza docs/status.md ao final
- Roda pnpm typecheck, lint e build antes de marcar como pronto
- Me dá relatório final estruturado (sem corte)
```

Quanto mais explícito, melhor o resultado.

---

## Como pedir revisão de segurança

```
Faz revisão de segurança end-to-end usando .github/prompts/review-security.prompt.md.
Foca especialmente em:
- Tokens de integração criptografados
- RBAC backend em rotas de IA
- Última owner protection
- Vazamento de segredo em logs
```

---

## Como pedir atualização de docs

```
Olha o que mudou desde o último merge no main e sincroniza:
- docs/status.md (estado real)
- docs/sprints.md (sprint concluída se for o caso)
- docs/api-spec.md (endpoints novos)
- docs/rbac-matrix.md (se mudou permissão)
- tasks/sprint-N.md (checkboxes)
Não duplica conteúdo entre os arquivos.
```

---

## Quando algo der errado

### Agente não está seguindo as regras

- Verificar se `AGENTS.md` está na raiz (Copilot e Claude leem)
- Verificar se `.github/copilot-instructions.md` existe (Copilot)
- Verificar se `CLAUDE.md` está atualizado (Claude)
- Reiniciar a extensão Copilot Chat após mudanças em `.github/`

### Resposta vaga ou genérica

- Pedido era vago: refinar com escopo concreto
- Faltou contexto: apontar o arquivo certo (ex: "leia docs/admin-ui-blueprint.md primeiro")

### Validação pulada

- Pedir explicitamente: "rode pnpm typecheck antes de marcar como pronto"
- Em PR, CI bloqueia merge se algo falhou

### Conflito entre agentes

- `AGENTS.md` é o desempate
- Em última instância, decisão é humana

---

## Próximos passos para o ecossistema

- Quando VS Code estabilizar chat modes formais, migrar agentes para `.github/chatmodes/`
- Quando agent skills estabilizarem, mover `docs/agent-skills/` para `.github/skills/`
- Considerar adicionar agentes para "review de PR automatizado" e "release notes"

Para detalhe operacional, ver [`docs/ai-agent-operating-model.md`](ai-agent-operating-model.md).
