# 06 - Frontend UX

- work_id: cdf-list-create-separation
- fase: 06-frontend-ux
- owner: frontend-vue-ux-mtr
- data: 2026-04-26
- status: done

## Objetivo da fase

Separar de forma real as experiencias das rotas /cdf e /cdf/novo para que cada uma tenha responsabilidade clara de dominio e UX:

- /cdf focada em consulta/listagem/download de certificados emitidos.
- /cdf/novo focada em geracao operacional de novo CDF com base em manifestos elegiveis.

## Diagnostico

Estado encontrado antes do refactor:

- [frontend/src/router.js](../../../frontend/src/router.js) apontava /cdf e /cdf/novo para a mesma view ([frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue)).
- [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue) renderizava o mesmo workspace (`frontend/src/components/DestinadorCdfWorkspace.vue`, removido em fase posterior) nas duas rotas, mudando apenas titulo/texto.
- [frontend/src/config/navigation.js](../../../frontend/src/config/navigation.js) tratava /cdf como prefix match e podia marcar /cdf e /cdf/novo como ativos ao mesmo tempo.

## Decisoes de implementacao

1. Separacao por view dedicada:
- Criada view exclusiva para emitidos: [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue).
- Criada view exclusiva para geracao: [frontend/src/views/CdfCreateView.vue](../../../frontend/src/views/CdfCreateView.vue).

2. Router/breadcrumbs separados:
- /cdf -> CdfListView (breadcrumb: Certificados (CDF) > Emitidos).
- /cdf/novo -> CdfCreateView (breadcrumb: Certificados (CDF) > Gerar CDF).

3. Navegacao ativa corrigida:
- matching de /cdf e /cdf/novo passou a ser exato para evitar duplo highlight.

4. Reutilizacao tecnica sem alterar contrato:
- Composable novo [frontend/src/composables/useCdfOperationalContext.js](../../../frontend/src/composables/useCdfOperationalContext.js) para contexto operacional comum (integrationAccountId/sessionContextId/requestedBy/ensureOperationalContext).
- Endpoints existentes mantidos em [frontend/src/services/api.js](../../../frontend/src/services/api.js) sem mudanca de assinatura.

## Diferencas reais entre as rotas

### /cdf (Emitidos)

Implementado em [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue):

- possui apenas consulta/listagem/download de CDF emitido;
- nao possui formulario de geracao;
- nao possui selecao de manifesto para gerar CDF;
- possui estados explicitos de loading, empty e error;
- mantem download de PDF via downloadCdfDocument.

### /cdf/novo (Gerar CDF)

Implementado em [frontend/src/views/CdfCreateView.vue](../../../frontend/src/views/CdfCreateView.vue):

- possui fluxo operacional de emissao (manifestos candidatos + selecao + submit);
- preserva query param manifestId para pre-selecao;
- exibe resumo de selecionados/elegiveis/bloqueados;
- exibe motivos de bloqueio por manifesto;
- possui botao principal Gerar CDF;
- exibe feedback de sucesso/erro com jobId apos enqueueCdfGenerate;
- nao renderiza listagem de CDF emitidos.

## Arquivos alterados

- [frontend/src/router.js](../../../frontend/src/router.js)
- [frontend/src/config/navigation.js](../../../frontend/src/config/navigation.js)
- [frontend/src/composables/useCdfOperationalContext.js](../../../frontend/src/composables/useCdfOperationalContext.js) (novo)
- [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue) (novo)
- [frontend/src/views/CdfCreateView.vue](../../../frontend/src/views/CdfCreateView.vue) (novo)

Arquivos obrigatorios revisados nesta fase (sem alteracao):

- [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue)
- `frontend/src/components/DestinadorCdfWorkspace.vue` (removido em fase posterior)
- [frontend/src/services/api.js](../../../frontend/src/services/api.js)

## Validacoes executadas na fase 06

1. Validacao de erros locais dos arquivos alterados (VS Code diagnostics):
- sem erros apos ajustes finais.

2. Build frontend:
- comando: cd frontend && npm run build
- resultado: OK (build concluido)
- observacao: warning de chunk size grande ja existente (nao bloqueante para esta fase).

## Riscos e pendencias para QA obrigatorio (fase 09)

1. Confirmar UX de selecao em /cdf/novo com diferentes perfis de dados reais (manifestos sem snapshot CETESB, cancelados, ja com CDF emitido, etc.).
2. Validar pre-selecao por query param manifestId em cenarios:
- manifesto presente na pagina atual da listagem;
- manifesto fora da pagina e carregado por getManifestById;
- manifesto inexistente.
3. Validar navegacao ativa desktop/mobile para garantir highlight exclusivo entre /cdf e /cdf/novo.
4. Validar regressao funcional de download PDF em /cdf.
5. Validar regressao funcional de enqueue de geracao em /cdf/novo (job aceito e feedback correto).

## Handoff para fase 09 (tester-qa-mtr)

Status: next_agent_required

Prompt pronto:

"""
work_id: cdf-list-create-separation
fase alvo: 09-qa-validation
owner esperado: tester-qa-mtr

Contexto:
A fase 06 separou as experiencias de /cdf e /cdf/novo com views dedicadas.

Arquivos principais para validar:
- frontend/src/views/CdfListView.vue
- frontend/src/views/CdfCreateView.vue
- frontend/src/router.js
- frontend/src/config/navigation.js
- frontend/src/composables/useCdfOperationalContext.js

Checklist QA obrigatorio:
1) /cdf:
- nao exibir formulario de geracao;
- nao exibir selecao de manifesto;
- consultar certificados com loading/empty/error;
- baixar PDF com sucesso quando houver documento.

2) /cdf/novo:
- exibir lista operacional de manifestos candidatos;
- manter pre-selecao via query ?manifestId=...;
- exibir resumo elegiveis/bloqueados e motivos;
- gerar CDF via botao principal Gerar CDF;
- validar feedback de sucesso/erro com job.

3) Navegacao:
- /cdf ativa apenas item Certificados emitidos;
- /cdf/novo ativa apenas item Gerar CDF;
- breadcrumbs distintos corretos.

4) Validacoes tecnicas recomendadas:
- frontend build
- testes UI/auditoria disponiveis
- smoke manual dos dois fluxos

Entregavel da fase 09:
- docs/handoffs/cdf-list-create-separation/09-qa-validation.md
com evidencias, cenarios executados, resultados, regressao e status final.
"""
