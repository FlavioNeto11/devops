---
name: evoluir-manifestos
description: 'Evolui a tela de Manifestos do SICAT (listagem, filtros, ações, detalhe, criação e resiliência de integração operacional).'
agent: manifestos-operacional-mtr
argument-hint: descreva a evolução desejada na tela de manifestos (filtros, ações, estados, UX de criação, fluxos assíncronos)
---

# Evoluir Tela de Manifestos

**Contexto:** aprimorar a experiência operacional da tela de manifestos do SICAT, cobrindo listagem, filtros, ações (submit/cancel/print/remove), detalhe e criação com resiliência nos fluxos assíncronos.

**Agente principal:** `manifestos-operacional-mtr`

## Demanda

${input:melhoria_manifestos:Descreva a evolução desejada (ex.: novos filtros, melhoria no status visual, fluxo de criação, ação de reenvio, exibição de erros CETESB)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios objetivos de pronto ou deixe em branco}

## Fluxo esperado

1. Analisar impacto em `ManifestsView.vue`, `ManifestDetailView.vue`, `ManifestCreateView.vue` e `ManifestCreateForm.vue`.
2. Propor e implementar melhoria mantendo coerência entre status interno e externo CETESB.
3. Tratar explicitamente loading/erro/vazio/sucesso em fluxos críticos.
4. Escalar para `integrador-cetesb-mtr` se houver mudança em submit/cancel/print real.
5. Escalar para `postgres-queue-mtr` se houver mudança em worker/fila/retry.
6. Escalar para `tester-qa-mtr` para testes E2E de manifesto.
7. Atualizar decision-log e documentação quando operação mudar.

## Resultado esperado

- fluxo de manifesto operacional sem ambiguidade visual ou de estado
- integrações críticas com fallback e mensagens acionáveis
- validações com evidência de funcionamento
