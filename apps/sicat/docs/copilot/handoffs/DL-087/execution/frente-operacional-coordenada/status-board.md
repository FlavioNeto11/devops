# Status Board — DL-087

- **Título:** Kit observável da frente operacional coordenada
- **Slug:** `frente-operacional-coordenada`
- **Atualizado em:** `2026-03-16T14:47:03.298Z`
- **Request:** Board, briefings por lane e trilha de eventos para acompanhar a frente operacional fora do chat

## Lanes
| Agente | Fase | Status | Dependência | Nota |
|---|---|---|---|---|
| `integrador-cetesb-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `postgres-queue-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `dashboard-observability-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `jobs-monitoramento-logs-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `sessao-conta-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `manifestos-operacional-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `perfis-acessos-admin-mtr` | front | 🟦 pronto | - | Aguardando disparo coordenado |
| `tester-qa-mtr` | qa | ⏳ pendente | `front-complete` | Aguardando conclusão da frente operacional |
| `documentador-mtr` | docs | ⏳ pendente | `tester-qa-mtr` | Aguardando QA |

## Regras operacionais
- A frente `front` pode ser distribuída por independência de arquivos, mas o runtime atual continua observável por atualização de artefatos, não por subagentes simultâneos no UI.
- `tester-qa-mtr` só inicia após o fechamento da frente operacional.
- `documentador-mtr` só inicia após QA concluído.

## Comandos úteis
```powershell
npm run handoff:front:show -- --dl DL-087
npm run handoff:front:update -- --dl DL-087 --agent integrador-cetesb-mtr --status in-progress --note "Iniciado"
npm run handoff:front:update -- --dl DL-087 --agent tester-qa-mtr --status completed --note "Validações concluídas"
```

