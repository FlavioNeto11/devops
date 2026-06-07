---
name: criar-ou-ajustar-testes
description: 'Projeta e implementa testes para um fluxo ou arquivo do projeto.'
agent: orquestrador-mtr
argument-hint: 'Informe arquivo, endpoint ou fluxo'
---

# Criar ou Ajustar Testes

**Contexto:** projetar e implementar testes para fluxo ou arquivo específico.

**Agente:** `orquestrador-mtr` (delega para `tester-qa-mtr`)

**Leitura obrigatória:**
- `docs/copilot/11-checklist-qa.md`
- `docs/copilot/15-testes-automatizados.md`
- `docs/copilot/03-mapa-de-codigo.md`

## Alvo

${input:alvo:Arquivo, endpoint ou fluxo a testar (ex: /v1/manifestos/:id/submit)}

## Tipos de teste solicitados

${input:test_types:Tipos de teste desejados (Unitário, Integração, API/E2E, Smoke, Contrato)}

Tarefas:
1. montar matriz de cenários
2. delegar para `tester-qa-mtr` quando houver alteração relevante de QA/contrato/smoke
3. criar ou ajustar testes
4. descrever comandos de execução
5. apontar riscos não cobertos
