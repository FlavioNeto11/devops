---
applyTo: ".github/agents/*.md,.github/prompts/*.md,.github/skills/**/*.md"
---
## Instruções de orquestração de agentes

- O agente padrão para demandas amplas deve ser o `orquestrador-mtr`.
- Prompts devem preferir `orquestrador-mtr` quando houver chance de impactar múltiplas camadas.
- Sempre explicitar quando delegar para especialistas:
  - `programador-backend-mtr` — backend Node.js, rotas, services, repos, contrato OpenAPI
  - `integrador-cetesb-mtr` — integração CETESB real, sessão, token, gateway
  - `postgres-queue-mtr` — banco, migrations, fila, locking, retries, worker
  - `tester-qa-mtr` — testes, smoke, contrato, validação de regressão
  - `frontend-vue-ux-mtr` — frontend Vue.js, CSS, layout responsivo, navegação
  - `dashboard-observability-mtr` — dashboard de métricas, observabilidade, health
  - `jobs-monitoramento-logs-mtr` — operação administrativa global (usuários/sessões) e monitoramento de Jobs/Logs
  - `sessao-conta-mtr` — tela de Sessão e Conta CETESB
  - `manifestos-operacional-mtr` — tela de Manifestos (lista/detalhe/criação/ações)
  - `perfis-acessos-admin-mtr` — módulo de Perfis e Acessos (RBAC/ABAC), gestão de usuários/sessões e controle fino administrativo
  - `estrutura-vscode-mtr` — estrutura da pasta `.vscode` (tasks, launch, settings, recomendações e automações de workspace)
  - `validador-cetesb-mtr` — auditoria de coerência com docs/cetesb/ (HARs)
  - `ci-cd-github-mtr` — CI/CD, GitHub Actions, pipelines
  - `documentador-mtr` — documentação técnica, decision-log, roadmap
  - `meta-evolution-copilot` — evolução da estrutura Copilot (.github/)
- Skills devem apontar arquivos reais do repositório e documentos existentes em `docs/copilot/`.
- Toda demanda crítica deve fechar ciclo completo: implementação + validação + documentação.
- Pedidos isolados para subir ambiente local, subir stack local, deixar localhost no ar ou preparar o ambiente para validação manual não devem abrir handoff/workstream por si só; a execução esperada é direta no `estrutura-vscode-mtr`.
- Quando a demanda incluir validação manual, smoke local, crítica do usuário ou entrega navegável em localhost, o `orquestrador-mtr` deve inserir `estrutura-vscode-mtr` na mesma cadeia antes de QA/docs para disponibilizar a stack local; não trate isso como rodada separada salvo instrução explícita do usuário.
- Evite duplicidade de regras entre prompts e agents; centralize a estratégia no `orquestrador-mtr`.
- Novos especialistas de tela/módulo (DL-076 + DL-081): use `jobs-monitoramento-logs-mtr`, `sessao-conta-mtr`, `manifestos-operacional-mtr` e `perfis-acessos-admin-mtr` para evoluções focadas; escale para `frontend-vue-ux-mtr` apenas para mudanças transversais de layout/CSS.
- Prompts amplos devem instruir o `orquestrador-mtr` a classificar, registrar checkpoint e delegar a próxima fase; não devem descrevê-lo como executor direto da implementação completa.
- Se a solicitação tiver mais de um verbo operacional ou owner diferente (`validar + corrigir`, `implementar + testar`, `corrigir + commitar + push`), a saída obrigatória é uma cadeia explícita de especialistas.
- Ownership operacional obrigatório:
  - `corrigir`, `implementar`, `refatorar` -> especialista dono do domínio
  - `disponibilizar localhost`, `subir stack local`, `preparar entrega navegável local` -> `estrutura-vscode-mtr` como execução direta quando a solicitação for isolada; como fase intermediária quando a demanda exigir validação humana/local junto de outros owners
  - `validar`, `testar`, `smoke`, `regressão` -> `tester-qa-mtr`
  - `documentar`, `handoff final` -> `documentador-mtr`
  - `workflow`, `pre-merge`, `commit`, `push`, `release readiness` -> `ci-cd-github-mtr` após especialistas de domínio e QA
- Nem `orquestrador-mtr` nem `executor-handoffs` podem usar fallback para executar eles mesmos uma demanda ampla quando houver especialista aplicável.

## Memória orquestrada com mempalace

- Trate mempalace como capacidade opcional de runtime; nunca assuma que o MCP está disponível ou saudável.
- A fonte primária continua sendo o repositório: `docs/handoffs/<work_id>/`, `docs/copilot/`, `.github/README.md` e demais artefatos versionados.
- Use mempalace apenas como memória suplementar para continuidade entre fases, memória de repositório/workspace, decisões já validadas e contexto operacional durável.
- Ordem de consulta recomendada quando houver `work_id`:
  1. checkpoint da fase anterior em `docs/handoffs/<work_id>/`
  2. documentação estrutural/versionada relevante
  3. mempalace (`status/search/kg_query/diary_read`) para recuperar contexto adicional útil
- Agentes que podem consultar ou atualizar mempalace por padrão: `orquestrador-mtr`, `executor-handoffs`, `meta-evolution-copilot`, `documentador-mtr` e `estrutura-vscode-mtr`.
- Especialistas de produto não devem depender de mempalace para executar a fase; eles continuam operando com checkpoint + código versionado, salvo instrução explícita da cadeia.
- Ao gravar em mempalace, persista apenas fatos estáveis e não sensíveis: `work_id`, decisões, ownership, convenções do repositório, riscos residuais e ponteiros para checkpoints.
- Nunca persista em mempalace: credenciais, tokens, segredos, payloads sensíveis, dados pessoais, dumps brutos de logs ou saídas transitórias de comandos.
- Antes de escrever novo contexto durável, prefira checar duplicidade e invalidar conhecimento obsoleto quando necessário.
- Se mempalace estiver indisponível, siga o fluxo normal do repositório sem bloquear a cadeia.

### Matriz anti-sobreposição (DL-085)

- `frontend-vue-ux-mtr`: ownership transversal (shell/layout/tokens/acessibilidade/componentes base), não ownership funcional primário de telas especializadas.
- `sessao-conta-mtr`: ownership da sessão/conta CETESB do usuário atual; não cobre operação administrativa global.
- `jobs-monitoramento-logs-mtr`: ownership de operação administrativa global (usuários/sessões/jobs/logs), auditoria e ações operacionais; não define RBAC/ABAC.
- `perfis-acessos-admin-mtr`: ownership de governança de autorização (papéis/permissões/políticas, trilha administrativa); não substitui monitoramento operacional contínuo.
- Em caso de demanda híbrida (ex.: sessão + RBAC + monitoramento), o `orquestrador-mtr` deve quebrar em handoffs sequenciais por domínio.
- Em caso de demanda operacional transversal com múltiplos donos adjacentes (integração + fila + dashboard + jobs/logs + sessão + manifestos + perfis), preferir o preset `Executar Frente Operacional Coordenada + QA/Docs` do `orquestrador-mtr`, com fallback para sequência local em caso de colisão de arquivos e sem prometer execução simultânea observável no runtime atual.
