---
name: diagnosticar-cadeia-agentes
description: Diagnostica lentidão, loop ou falha de encadeamento de agentes sem alterar produto
agent: executor-handoffs
argument-hint: cole o log ou descreva o problema
---

# Diagnosticar cadeia de agentes

Diagnostique o problema de orquestração sem implementar produto.

Procure:
- fase repetida;
- checkpoint ausente;
- prompt específico demais;
- agente executando fase de outro;
- runtime sem subagent;
- leitura desnecessária de arquivos grandes.

Entrada:

${input:entrada:Cole o log ou descreva o problema}
