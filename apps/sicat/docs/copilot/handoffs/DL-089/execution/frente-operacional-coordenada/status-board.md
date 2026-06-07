# Status Board — DL-089

- **Título:** Execução demonstrativa do preset coordenado
- **Slug:** `frente-operacional-coordenada`
- **Atualizado em:** `2026-03-16T15:03:15.197Z`
- **Request:** Validar bootstrap observável, board por lanes e fechamento serial sem demanda funcional concreta

## Lanes
| Agente | Fase | Status | Dependência | Nota |
|---|---|---|---|---|
| `integrador-cetesb-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `postgres-queue-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `dashboard-observability-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `jobs-monitoramento-logs-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `sessao-conta-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `manifestos-operacional-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `perfis-acessos-admin-mtr` | front | ⏭️ não aplicável | - | Execução demonstrativa sem escopo funcional concreto |
| `tester-qa-mtr` | qa | ⏭️ não aplicável | `front-complete` | Sem mudanças funcionais para validar |
| `documentador-mtr` | docs | ✅ concluído | `tester-qa-mtr` | DL-089 consolidado com artefatos finais |

## Regras operacionais
- A frente `front` pode ser distribuída por independência de arquivos, mas o runtime atual continua observável por atualização de artefatos, não por subagentes simultâneos no UI.
- `tester-qa-mtr` só inicia após o fechamento da frente operacional.
- `documentador-mtr` só inicia após QA concluído.

## Comandos úteis
```powershell
npm run handoff:front:show -- --dl DL-089
npm run handoff:front:update -- --dl DL-089 --agent integrador-cetesb-mtr --status in-progress --note "Iniciado"
npm run handoff:front:update -- --dl DL-089 --agent tester-qa-mtr --status completed --note "Validações concluídas"
```

