# Technical Decisions — DL-062

## 1) Reconciliar no endpoint de listagem
**Decisão:** executar reconciliação de estados transitórios já em `listManifests`.

**Motivo:**
- Evita depender do `getManifest` (abrir detalhe) para corrigir órfãos.
- Resolve o sintoma diretamente na tela operacional principal.

## 2) Reuso do submit existente para recuperação
**Decisão:** implementar recuperação via botão `Reenviar` chamando endpoint de submit já existente.

**Motivo:**
- Menor superfície de mudança (sem novo endpoint de contrato).
- Fluxo operacional alinhado ao comportamento já conhecido do sistema.

## 3) Diagnóstico por `externalStatus`
**Decisão:** renderizar o `externalStatus` no detalhe quando houver.

**Motivo:**
- Mensagem fixa genérica ocultava causa real.
- Operador passa a ter contexto acionável sem inspeção extra.
