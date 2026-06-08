---
mode: agent
description: Refatorar arquivo grande sem mudar comportamento, mantendo testes.
---

# Refatorar Arquivo Grande

## Quando usar

- Arquivo passou de 500 linhas e está difícil de navegar
- Componente React com múltiplas responsabilidades
- Route handler com muitos endpoints/regras inline
- Necessidade documentada de extrair lógica reusável

## Princípio

**Refatoração não muda comportamento.** Antes/depois de refatorar, todos os testes precisam passar.

## Contexto obrigatório

1. O arquivo alvo lido inteiro
2. Testes que cobrem o arquivo
3. Componentes/módulos similares já refatorados no projeto

## Estratégia

1. **Garantir cobertura mínima** antes de refatorar
   - Se não há teste, adicionar um teste de smoke que valide o output principal
   - Se há teste, rodar e garantir que passa antes de tocar no código

2. **Identificar responsabilidades**
   - Separar UI de lógica de dados
   - Separar regras de negócio de I/O
   - Identificar funções puras vs handlers

3. **Extrair em ordem segura**
   - Primeiro: tipos e constantes
   - Segundo: funções puras (sem side effect)
   - Terceiro: hooks customizados
   - Quarto: subcomponentes / sub-handlers
   - Por último: a estrutura do arquivo principal

4. **Manter API pública estável**
   - Imports externos não devem precisar mudar
   - Se mudar nome de export, atualizar todos os consumers

5. **Validação contínua**
   - Após cada extração: `pnpm typecheck`
   - Após terminar: `pnpm lint && pnpm typecheck && testes`

## Padrões do projeto

### Frontend (React)

- Componentes de página: `apps/web/src/app/(group)/path/page.tsx`
- Subcomponentes específicos da página: definir no mesmo arquivo se < 100 linhas; senão extrair para `apps/web/src/components/<feature>/`
- Hooks customizados: `apps/web/src/hooks/use-xxx.ts`
- API clients: `apps/web/src/lib/<feature>-api.ts`

### Backend (Fastify)

- Plugin de rota: `apps/api/src/routes/<dominio>/index.ts`
- Se um plugin tem 5+ endpoints com muita lógica, extrair handlers para arquivos separados em `apps/api/src/routes/<dominio>/handlers/`
- Schemas Zod compartilhados: `apps/api/src/routes/<dominio>/schemas.ts`
- Helpers de negócio: `apps/api/src/lib/<feature>.ts`

## Checklist

- [ ] Testes existentes ainda passam
- [ ] Comportamento idêntico (input/output das funções refatoradas)
- [ ] Nenhuma API pública quebrou
- [ ] Imports atualizados onde necessário
- [ ] Sem duplicação criada na extração
- [ ] `pnpm lint && pnpm typecheck` OK
- [ ] Diff narrável: cada commit faz uma extração lógica

## Comandos de validação

```bash
pnpm lint
pnpm typecheck
pnpm --filter @gymops/api test
pnpm --filter @gymops/web build
```

## Formato da resposta final

1. Arquivo refatorado (caminho)
2. Antes: tamanho, responsabilidades
3. Depois: estrutura (lista de arquivos novos + escopo)
4. Comportamento: idêntico (sem mudança)
5. Testes: passando antes e depois
6. Lint/typecheck: OK
