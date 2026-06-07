# 00 - Orchestration

## Demanda original (resumo)

Integrar a linha de agentes do SICAT ao uso de recursos do mempalace para orquestracao de memoria, incluindo memoria de repositorio/workspace, usando as tools MCP informadas pelo usuario. Depois disso, reavaliar e reorganizar a estrutura dos diretorios `.github` e `docs`, removendo padroes antigos, inconsistencias e artefatos que nao fazem mais sentido na estrutura atual.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "mempalace-copilot-structure-reorg"
  intent: "meta"
  complexity: "complex"
  domains:
    - "docs"
    - "qa"
    - "operate"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "A entrega principal envolve evolucao estrutural de agentes, prompts, instructions, skills e documentacao de governanca em torno do uso do mempalace."
    - phase: "07-workspace-mcp"
      agent: "estrutura-vscode-mtr"
      required: true
      reason: "E preciso alinhar a camada de workspace/MCP para que o uso do mempalace seja consistente e descobrivel no repositório quando aplicavel."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "A nova estrutura precisa ser validada quanto a coerencia, seguranca operacional, descobribilidade e ausencia de regressao estrutural."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar a integracao do mempalace e a reorganizacao estrutural final de .github/docs."
```

## Ferramentas mempalace informadas pelo usuario

- `mempalace/mempalace_add_drawer`
- `mempalace/mempalace_check_duplicate`
- `mempalace/mempalace_delete_drawer`
- `mempalace/mempalace_diary_read`
- `mempalace/mempalace_diary_write`
- `mempalace/mempalace_find_tunnels`
- `mempalace/mempalace_get_aaak_spec`
- `mempalace/mempalace_get_drawer`
- `mempalace/mempalace_get_taxonomy`
- `mempalace/mempalace_graph_stats`
- `mempalace/mempalace_hook_settings`
- `mempalace/mempalace_kg_add`
- `mempalace/mempalace_kg_invalidate`
- `mempalace/mempalace_kg_query`
- `mempalace/mempalace_kg_stats`
- `mempalace/mempalace_kg_timeline`
- `mempalace/mempalace_list_drawers`
- `mempalace/mempalace_list_rooms`
- `mempalace/mempalace_list_wings`
- `mempalace/mempalace_memories_filed_away`
- `mempalace/mempalace_reconnect`
- `mempalace/mempalace_search`
- `mempalace/mempalace_status`
- `mempalace/mempalace_traverse`
- `mempalace/mempalace_update_drawer`

## Requisitos obrigatorios

- A estrutura de agentes deve passar a considerar mempalace como recurso de memoria orquestrada para contexto, historico, conhecimento e memoria de repositório/workspace, quando as tools estiverem disponiveis no runtime.
- A integracao deve ser generica, sem enviesar agentes globais para uma unica demanda de produto.
- Deve ficar claro quais agentes precisam usar ou consultar mempalace e em quais momentos do fluxo.
- A camada de workspace/MCP deve ser revista para refletir o uso do mempalace, se necessario.
- A estrutura de `.github` deve ser reavaliada contra padroes antigos, duplicidades, gaps de discoverability e artefatos obsoletos.
- A estrutura de `docs` deve ser reavaliada para organizacao, coerencia e manutencao, especialmente em `docs/copilot/` e demais areas estruturais relacionadas.
- A validacao final deve registrar o que foi reorganizado, o que foi mantido e o que continua como risco residual.

## Decisoes iniciais de desenho

- Tratar a integracao do mempalace como evolucao estrutural de plataforma, nao como ajuste localizado de um agente isolado.
- Separar a evolucao de agentes/prompts/docs da camada de workspace/MCP para manter ownership explicito.
- Reaproveitar o modelo de handoffs/documentacao ja existente no repositório para registrar a reorganizacao estrutural.
- Evitar persistir no repositório qualquer suposicao forte sobre disponibilidade de mempalace fora do runtime declarado; documentar claramente pre-condicoes de uso.

## Criterios de pronto

- Agentes, prompts, instructions e/ou skills relevantes incorporam orientacao clara para uso de mempalace quando disponivel.
- A camada `.vscode` ou equivalente de workspace reflete a estrategia de uso do mempalace quando necessario.
- `.github` e `docs` foram reavaliados e reorganizados de forma coerente com a estrutura atual da plataforma.
- A mudanca foi validada por QA estrutural.
- A documentacao final explica como o mempalace entra na cadeia e o que mudou na organizacao estrutural.

## Checkpoints esperados

- `docs/handoffs/mempalace-copilot-structure-reorg/00-orchestration.md`
- `docs/handoffs/mempalace-copilot-structure-reorg/06-meta-evolution.md`
- `docs/handoffs/mempalace-copilot-structure-reorg/07-workspace-mcp.md`
- `docs/handoffs/mempalace-copilot-structure-reorg/09-qa-validation.md`
- `docs/handoffs/mempalace-copilot-structure-reorg/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Objetivo da fase 06: integrar mempalace na estrutura Copilot do repositório, definir estrategia de uso pelos agentes e reavaliar/reorganizar `.github` e a documentacao estrutural relacionada, preservando o carater generico da plataforma.