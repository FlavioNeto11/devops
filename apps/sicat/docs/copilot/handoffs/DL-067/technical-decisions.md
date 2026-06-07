# Technical Decisions — DL-067

## Decisão 1: Truncar visual de código longo na grid
- **Implementação:** célula de código com `max-width` + `ellipsis` e `title` com valor completo.
- **Racional:** preservar legibilidade da tabela sem perder acesso ao valor integral.

## Decisão 2: Intervalo de datas sempre consistente
- **Implementação:** ao mover `dateFrom` acima de `dateTo`, `dateTo` acompanha; ao mover `dateTo` abaixo de `dateFrom`, `dateFrom` acompanha.
- **Racional:** evitar estado inválido no filtro temporal e reduzir esforço operacional.

## Decisão 3: Atualizar uso/última conexão ao ativar conta
- **Implementação:** `activateById` atualiza `last_connection_at` e `last_usage_at` para `now()`.
- **Racional:** refletir uso real da conta na tela de seleção.

## Decisão 4: Remoção de conta CETESB com contrato explícito
- **Implementação:** novo `DELETE /v1/sicat/cetesb-accounts/{accountId}` em backend e OpenAPI.
- **Racional:** fornecer ciclo completo de gestão de contas salvas para o usuário.

## Decisão 5: Normalização de tipo desconhecido para operação
- **Implementação:** normalização de `account_type` desconhecido para `generator` no fluxo operacional.
- **Racional:** evitar apresentação ambígua (“Não definido”) em conta de uso principal do sistema.
