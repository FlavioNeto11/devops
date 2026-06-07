# Frente Operacional Coordenada

Guia canônico para abrir e acompanhar uma execução observável da frente operacional coordenada.

## Objetivo

Tornar uma demanda transversal **observável fora do chat** quando ela envolver múltiplos especialistas operacionais, mantendo:
- board em Markdown por lane
- trilha de eventos append-only
- briefings individuais por especialista
- fechamento obrigatório com QA e documentação em sequência

## Quando usar

Use este kit quando a demanda combinar, no mesmo pacote:
- `integrador-cetesb-mtr`
- `postgres-queue-mtr`
- `dashboard-observability-mtr`
- `jobs-monitoramento-logs-mtr`
- `sessao-conta-mtr`
- `manifestos-operacional-mtr`
- `perfis-acessos-admin-mtr`
- e precisar fechar com `tester-qa-mtr` → `documentador-mtr`

## Limite conhecido

O runtime atual do Copilot/VS Code **não expõe subagentes simultâneos visíveis**. Este kit não altera essa limitação; ele fornece **coordenação observável** por artefatos e status.

## Scripts

- `npm run handoff:front:prepare`
- `npm run handoff:front:show`
- `npm run handoff:front:update`

## Fluxo operacional

### 1. Preparar a execução

Quando o preset `Executar Frente Operacional Coordenada + QA/Docs` for disparado pelo `orquestrador-mtr`, este preparo deve acontecer automaticamente no PRÉ-HANDOFF do `executor-handoffs`.

```powershell
npm run handoff:front:prepare -- --dl DL-087 --title "Frente operacional coordenada" --request "Descreva o contexto aqui"
```

### 2. Acompanhar o status

```powershell
npm run handoff:front:show -- --dl DL-087
```

Para atualização contínua:

```powershell
npm run handoff:front:show -- --dl DL-087 --watch --interval 3000
```

### 3. Atualizar uma lane

```powershell
npm run handoff:front:update -- --dl DL-087 --agent integrador-cetesb-mtr --status in-progress --note "Gateway em execução"
npm run handoff:front:update -- --dl DL-087 --agent integrador-cetesb-mtr --status completed --note "Integração consolidada"
```

## Artefatos gerados

Em `docs/copilot/handoffs/DL-XXX/execution/frente-operacional-coordenada/`:
- `manifest.json` — estado canônico das lanes
- `events.ndjson` — histórico de atualizações
- `status-board.md` — board legível para revisão humana
- `briefings/*.md` — briefing individual por especialista
- `README.md` — resumo local da execução

## Regras de uso

- Distribua a fase `front` por independência de arquivos.
- Se houver colisão de arquivos, replaneje localmente em sequência.
- Não inicie `tester-qa-mtr` antes da conclusão da frente operacional.
- Não inicie `documentador-mtr` antes de QA.
- Registre fatos observados, decisões e pendências no `DL-XXX` correspondente.

## Integração com prompt

No VS Code Copilot Chat, execute o prompt `iniciar-frente-operacional-coordenada` para abrir a frente com contexto já formatado para o `orquestrador-mtr`.

## Integração com o preset do orquestrador

Ao usar o handoff `Executar Frente Operacional Coordenada + QA/Docs` em `.github/agents/orquestrador-mtr.agent.md`, o `executor-handoffs` deve:
- criar/atualizar o `DL-XXX` da demanda;
- executar automaticamente `npm run handoff:front:prepare ...`;
- manter `status-board.md` atualizado durante a frente operacional;
- seguir com `tester-qa-mtr` e `documentador-mtr` ao final.
