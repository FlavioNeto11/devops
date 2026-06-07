---
name: executar-demanda-plataforma
description: Executa qualquer demanda da plataforma SICAT com work_id, fases dinâmicas e checkpoints genéricos
agent: orquestrador-mtr
argument-hint: cole a demanda completa da plataforma
---

# Executar demanda da plataforma

ROUTE_PLATFORM_DEMAND.

Classifique a demanda, derive `work_id`, crie/atualize `docs/handoffs/<work_id>/00-orchestration.md` e acione o primeiro especialista necessário.

Não implemente a demanda diretamente neste prompt. Para demandas amplas, execute somente a classificação, o checkpoint e o handoff da próxima fase pendente.

Exceção: para pedidos isolados de subir ambiente, subir stack local, deixar localhost no ar ou preparar ambiente para validação manual, não abra handoff/workstream próprio por padrão; roteie diretamente para `estrutura-vscode-mtr` e só use `docs/handoffs/<work_id>/` quando a solicitação já fizer parte de uma cadeia maior ou trouxer continuidade explícita.

Não use caminhos fixos de uma demanda específica.

Antes de chamar qualquer fase, verifique checkpoints já existentes em:

```text
docs/handoffs/<work_id>/
```

Se o runtime expuser mempalace, consulte-o somente depois dos checkpoints locais e use-o como memória suplementar de continuidade por `work_id`, nunca como dependência obrigatória.

Execute apenas a próxima fase pendente.

Se a solicitação combinar múltiplos verbos operacionais como validar, corrigir, testar, documentar, commitar ou pushar, quebre em owners explícitos e não absorva essas fases no orquestrador.

Demanda:

${input:demanda:Cole a demanda completa da plataforma}
