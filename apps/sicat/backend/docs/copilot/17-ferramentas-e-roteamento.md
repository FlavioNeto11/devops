# Ferramentas do assistente e roteamento (qual usar para quê)

Este documento descreve, por ferramenta, **o que ela responde** e **o que ela NÃO responde**, além de exemplos de roteamento (consulta do usuário → ferramenta/intent). Serve de conhecimento de domínio para o assistente escolher a ferramenta correta por raciocínio semântico — não é uma regra fixa de palavra-chave.

## Princípio geral de roteamento

Há duas naturezas distintas de pergunta, e elas usam ferramentas diferentes:

- **DADOS de negócio (manifestos/MTR e CDF/CDR)**: quantidade, lista, resumo do ano, total por período, quebra por status, agrupamento por gerador/destinador, detalhe de um conjunto. Tudo isso é respondido por `orchestrate_manifest_operation` (ou `list_manifests` para uma lista simples). "Manifesto" é o documento de transporte de resíduo (MTR); "CDF" é o certificado de destinação final.
- **SAÚDE/estado do sistema (processamento)**: jobs em fila/executando, workers, DLQ, taxa de sucesso. Isso é `get_dashboard_overview`/`get_operations_overview`.

Erro comum a evitar: tratar "resumo/total de manifestos" como pergunta de dashboard. O dashboard NÃO contém a contagem de manifestos por período/status; ele contém métricas de processamento (jobs/workers). Se o usuário pergunta sobre manifestos, use a ferramenta de manifestos.

## get_dashboard_overview — saúde da plataforma (NÃO é manifestos)

Responde: estado do processamento — jobs (em fila, executando, retry, sucesso/falha 24h), DLQ, workers ativos/saudáveis, taxa de sucesso. Use para "como está o sistema/processamento", "tem job travado", "fila de processamento".

NÃO responde: quantidade, lista, total ou resumo de **manifestos** ou **CDFs** por período/status. Um resultado "ausência de dados/0 jobs" significa que NÃO há métricas de processamento no momento — NUNCA significa que não há manifestos. Se a pergunta é sobre manifestos, esta ferramenta é a errada.

## orchestrate_manifest_operation — consultas e operações de manifestos/CDF

Responde (consulta, sem confirmação): listar manifestos por recência; **contar/totalizar**; **agrupar** por status/gerador/destinador/período; **resumir o ano**; detalhar um conjunto já mostrado; listar/checar CDFs de uma seleção. Escolha o `intent` adequado, por exemplo: `manifest.list_recent_top` (listar), `manifest.group_recent_top` (totais e quebra por status — ideal para "resumo do ano" e "quantos por status"), `manifest.detail_selected_set` (detalhar um conjunto), `cdf.list_by_manifest_selection` (CDFs de uma seleção). Preencha `selection.dateFrom`/`selection.dateTo` (YYYY-MM-DD) quando houver período, e `selection.status`/`selection.groupBy` quando o usuário filtrar/agrupar.

Executa também (apenas com confirmação explícita posterior): cancelar, replicar, criar, submeter, imprimir em lote. Para consultas, NÃO é preciso confirmação.

Use para QUALQUER pergunta sobre manifestos ou CDFs — inclusive resumos e totais. A descrição "lote/cancelamento" não a limita a ações: ela é o orquestrador universal de manifestos/CDF, incluindo as consultas mais simples de contagem e resumo.

## list_manifests — lista simples

Responde: uma lista simples (sem filtros nem agrupamento) dos manifestos mais recentes. Para total, resumo por período/status, contagem ou agrupamento, prefira `orchestrate_manifest_operation`.

## diagnose_operation — diagnóstico analítico (cruza fontes)

Responde: perguntas analíticas/diagnósticas que exigem CRUZAR manifestos + CDF + jobs + sessão, raciocinando entre passos (read-only). Ex.: "o que falta para fechar o ciclo e emitir o CDF", "por que isto está parado", "diagnostique minha operação". Não use para uma consulta simples e direta de uma única fonte.

## Exemplos de roteamento (consulta do usuário → ferramenta/intent)

- "Faça um resumo de tudo que tem esse ano de manifesto" / "resumo dos manifestos de 2026" → `orchestrate_manifest_operation` com `manifest.group_recent_top` (agrupar por status no período 2026-01-01..2026-12-31). NÃO é `get_dashboard_overview`.
- "Total de manifestos no período" / "quantos manifestos esse ano" → `orchestrate_manifest_operation` (contagem por período; reutilize a janela de datas já confirmada na conversa). NÃO é dashboard.
- "Quantos manifestos cancelados no mês 3 de 2026?" → `orchestrate_manifest_operation` (`manifest.group_recent_top` ou listagem com `selection.status=cancelled` e período 2026-03-01..2026-03-31).
- "Me mostra os manifestos cancelados de março" → `orchestrate_manifest_operation` `manifest.list_recent_top` com status cancelado e período de março.
- "Como está o processamento / a fila de jobs?" → `get_dashboard_overview` (saúde do sistema).
- "O que falta para emitir o CDF desses manifestos?" → `diagnose_operation`.
