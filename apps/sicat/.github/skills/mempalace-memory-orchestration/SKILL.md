# Skill: Mempalace Memory Orchestration

## Quando usar

Use esta skill quando a cadeia de agentes precisar de continuidade além do contexto imediato do chat, especialmente para:

- retomada de `work_id` já em andamento;
- memória durável de repositório/workspace;
- consolidação de decisões entre fases;
- handoffs longos com múltiplos especialistas.

## Objetivo

Padronizar como a linha de agentes do SICAT consulta e atualiza mempalace sem transformar o MCP em dependência obrigatória do repositório.

## Dependência de runtime

- mempalace é opcional e depende do runtime expor as tools MCP correspondentes.
- Se o runtime não expuser mempalace, siga somente com `docs/handoffs/<work_id>/`, `docs/copilot/` e os artefatos versionados.
- A ausência de mempalace nunca deve bloquear classificação, handoff, validação ou documentação.

## Agentes primários

- `orquestrador-mtr`
- `executor-handoffs`
- `meta-evolution-copilot`
- `documentador-mtr`
- `estrutura-vscode-mtr`

## Ordem de consulta

1. Ler o checkpoint mais recente em `docs/handoffs/<work_id>/`.
2. Ler a documentação versionada relevante (`docs/copilot/`, `.github/README.md`, READMEs locais, instructions/skills aplicáveis).
3. Se mempalace estiver disponível, consultar contexto adicional por `work_id`, domínio, convenção ou decisão anterior.
4. Somente depois disso decidir se vale persistir um novo resumo durável em mempalace.

## Perfil de tools recomendado

### Perfil base de continuidade

Ferramentas que os agentes primários podem expor por padrão:

- `mempalace/mempalace_status`
- `mempalace/mempalace_reconnect`
- `mempalace/mempalace_search`
- `mempalace/mempalace_diary_read`
- `mempalace/mempalace_diary_write`
- `mempalace/mempalace_kg_query`
- `mempalace/mempalace_kg_add`
- `mempalace/mempalace_kg_invalidate`
- `mempalace/mempalace_check_duplicate`

Use esse perfil para recuperar e registrar memória operacional sem sobrecarregar agentes que não são owners de orquestração.

### Perfil avançado de workspace/taxonomia

Ferramentas a considerar apenas em agentes de governança/runtime, sobretudo `estrutura-vscode-mtr` ou evoluções futuras do workspace:

- `mempalace/mempalace_hook_settings`
- `mempalace/mempalace_get_taxonomy`
- `mempalace/mempalace_get_aaak_spec`
- `mempalace/mempalace_list_wings`
- `mempalace/mempalace_list_rooms`
- `mempalace/mempalace_list_drawers`
- `mempalace/mempalace_get_drawer`
- `mempalace/mempalace_add_drawer`
- `mempalace/mempalace_update_drawer`
- `mempalace/mempalace_delete_drawer`
- `mempalace/mempalace_traverse`
- `mempalace/mempalace_find_tunnels`
- `mempalace/mempalace_memories_filed_away`
- `mempalace/mempalace_graph_stats`
- `mempalace/mempalace_kg_stats`
- `mempalace/mempalace_kg_timeline`

Não exponha esse perfil completo em agentes de produto sem necessidade clara.

## Política de escrita

Persistir apenas fatos estáveis, genéricos e reutilizáveis:

- `work_id` e fase atual;
- decisões aprovadas;
- ownership e sequência da cadeia;
- convenções verificadas do repositório/workspace;
- riscos residuais e próximos checkpoints.

Evite duplicar checkpoints integralmente. Prefira resumos curtos com ponteiro para o arquivo versionado canônico.

## Política de segurança

Nunca gravar em mempalace:

- credenciais, JWTs, cookies, segredos e tokens;
- dados pessoais ou operacionais sensíveis;
- dumps integrais de payloads externos;
- logs brutos de erro transitório;
- caminhos locais fora do escopo necessário para a cadeia.

## Padrão de uso por fase

### Orquestração

- Buscar contexto por `work_id` e tema antes de abrir nova cadeia.
- Registrar apenas resumo do plano, owners e checkpoints esperados.

### Execução de handoffs

- Consultar memória durável para continuidade entre especialistas.
- Escrever somente mudanças de estado relevantes para a próxima fase.

### Documentação final

- Consolidar decisões e riscos finais.
- Invalidar ou substituir conhecimento que ficou obsoleto durante a entrega.

### Workspace/MCP

- Tratar configuração de hooks, taxonomia e wiring do runtime como responsabilidade explícita da fase de workspace, não da camada meta.

## Fallback obrigatório

Se mempalace falhar, retornar resposta vazia ou parecer inconsistente:

1. registrar o contexto canônico apenas no repositório;
2. seguir com o checkpoint local;
3. não inventar memória ausente;
4. não bloquear a cadeia por causa do MCP.
