# Skill: Postgres Job Queue

## Quando usar
Use esta skill ao alterar `jobs`, worker, retry, idempotência, locking ou qualquer fluxo assíncrono.

## Arquivos principais
- `src/sql/`
- `src/db/`
- `src/repositories/`
- `src/worker.js`
- `src/workers/`
- `docs/copilot/05-modelo-de-dados.md`
- `docs/copilot/04-fluxos-operacionais.md`
- `docs/copilot/09-roadmap.md`

## Objetivos
- preservar consistência
- evitar duplicidade
- garantir retry seguro
- manter observabilidade do ciclo de vida dos jobs

## Checklist
1. o handler é reentrante?
2. há transação suficiente?
3. existe risco de corrida?
4. o job registra falha de forma útil?
5. há dados parciais que precisam ser persistidos antes do sucesso?
6. a documentação operacional foi atualizada?

## Arquivos de apoio
- `state-machine.md`
