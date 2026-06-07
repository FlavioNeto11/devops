# Execução observável — DL-087

Esta pasta foi gerada para tornar a frente operacional coordenada **observável fora do chat**.

## Artefatos
- `manifest.json`: estado canônico das lanes
- `status-board.md`: visão resumida em Markdown
- `events.ndjson`: trilha append-only de eventos
- `briefings/`: briefings individuais por especialista

## Como usar
1. Gere o pacote com `npm run handoff:front:prepare ...`.
2. Abra o board com `npm run handoff:front:show -- --dl <DL>`.
3. Atualize cada lane conforme avanço usando `npm run handoff:front:update`.
4. Preserve QA e docs em sequência no final.

## Limite conhecido
- O Copilot/VS Code atual não expõe execução simultânea visível de subagentes; este kit fornece coordenação observável por artefatos e status.

