# Technical Decisions - DL-076

## Fatos
- O agente `frontend-vue-ux-mtr` é eficaz para demandas amplas, porém telas operacionais críticas demandam contexto especializado.
- `Jobs/Logs`, `Sessão/Conta` e `Manifestos` possuem regras próprias de estado, integração e experiência operacional.

## Decisão 1: especialização por tela
- **Escolha:** criar três agentes dedicados por domínio de tela.
- **Motivo:** reduzir ambiguidade de escopo e acelerar entrega com menos retrabalho.
- **Impacto:** handoffs mais precisos e ownership explícito por fluxo de UI.

## Decisão 2: integração explícita no orquestrador
- **Escolha:** adicionar handoffs diretos no `orquestrador-mtr` para os três novos especialistas.
- **Motivo:** permitir roteamento automático sem depender de interpretação manual.
- **Impacto:** execução multiagente mais previsível em demandas de frontend operacional.

## Decisão 3: manter especialista frontend generalista
- **Escolha:** preservar `frontend-vue-ux-mtr` como especialista transversal.
- **Motivo:** telas novas e refactors estruturais continuam exigindo agente frontend amplo.
- **Impacto:** equilíbrio entre especialização por tela e cobertura frontend end-to-end.

## Pendências
- Avaliar criação de prompts dedicados por tela caso volume de demandas operacionais aumente.
- Monitorar colisão de escopo entre especialistas de tela e agente frontend generalista.
