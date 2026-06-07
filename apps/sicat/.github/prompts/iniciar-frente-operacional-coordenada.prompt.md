---
name: iniciar-frente-operacional-coordenada
description: 'Abre uma frente operacional coordenada observável com board, briefings por lane e trilha de status fora do chat.'
agent: orquestrador-mtr
argument-hint: descreva o DL, a demanda operacional e o contexto que precisa ser distribuído entre especialistas
---

# Iniciar Frente Operacional Coordenada

**Contexto:** abrir uma execução observável para uma demanda transversal que combina integração, banco/fila, observabilidade e superfícies operacionais/admin, preservando fechamento serial em QA e documentação.

**Agente principal:** `orquestrador-mtr`

## Identificação da execução

**DL alvo:**
${input:dl_id:DL-087}

**Título da demanda:**
${input:demanda_observavel:Descreva a frente operacional coordenada que será aberta}

**Contexto adicional (opcional):**
${input:contexto_observavel:Escopo, arquivos impactados, restrições e critérios de pronto}

## Fluxo esperado

1. Preparar artefatos observáveis com `npm run handoff:front:prepare -- --dl <DL> --title <título> --request <contexto>`.
2. Gerar `manifest.json`, `events.ndjson`, `status-board.md` e briefings em `docs/copilot/handoffs/<DL>/execution/frente-operacional-coordenada/`.
3. Executar o preset `Executar Frente Operacional Coordenada + QA/Docs` respeitando independência de arquivos e fallback sequencial em caso de colisão.
4. Atualizar o board a cada avanço relevante com `npm run handoff:front:update`.
5. Manter `tester-qa-mtr` e `documentador-mtr` em sequência ao final.
6. Consolidar decisão, docs e validações.

## Resultado esperado

- execução observável fora do chat
- board e trilha de eventos atualizados durante a entrega
- briefings separados por lane
- fechamento com QA e documentação sem ambiguidade
