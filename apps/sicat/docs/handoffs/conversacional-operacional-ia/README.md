# Camada conversacional operacional do SICAT

## work_id recomendado

`conversacional-operacional-ia`

## Objetivo

Executar a evolucao do SICAT para suportar uma camada conversacional operacional com IA generativa, priorizando na primeira onda:

- assistente contextual dentro da plataforma
- homepage comunicando o diferencial conversacional
- app simplificado tipo chat dentro do ecossistema SICAT

O canal WhatsApp operacional permanece como segunda onda futura e nao faz parte do escopo de entrega imediata desta frente.

## Status consolidado atual

- Fases 1 a 5 representam a primeira onda funcional da camada conversacional.
- O foco da primeira onda e consolidar o nucleo conversacional reutilizavel, o popup interno, a homepage e o app light.
- A fase de WhatsApp nao deve bloquear a entrega da primeira onda.
- O canal WhatsApp permanece planejado, mas explicitamente fora do escopo do MVP imediato.

## Escopo da primeira onda

### Incluido
- documentacao canonica da camada conversacional
- backend conversacional com provider de modelo, orquestracao, policy layer, tools e auditoria
- popup interno contextual dentro da plataforma
- incorporacao do diferencial conversacional na homepage
- app light tipo chat com autenticacao SICAT e conta CETESB ativa
- hardening, telemetria, testes e readiness da experiencia conversacional principal

### Fora do escopo imediato
- adaptador WhatsApp
- vinculacao de numero/telefone
- operacao de mensagens outbound/inbound em canal externo
- politicas especificas de mensageria externa
- handoff de producao do canal WhatsApp

## Ponto de parada recomendado

Fechar primeiro a experiencia conversacional nativa do SICAT antes de abrir qualquer canal externo.

A ordem correta e:

1. documentacao canonica
2. backend conversacional
3. popup interno
4. homepage
5. app light
6. hardening
7. backlog da segunda onda (WhatsApp)

## Leitura obrigatoria antes de executar

1. `README.md` da raiz
2. `docs/README.md`
3. `docs/copilot/README.md`
4. `docs/copilot/02-arquitetura.md`
5. `docs/copilot/04-fluxos-operacionais.md`
6. `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`
7. `docs/copilot/16-camada-conversacional.md`
8. `docs/copilot/conversacional/*`

## Arquivos deste handoff

- `01-plano-executavel.md`
- `02-checklist-fases.md`
- `03-matriz-riscos.md`
- `04-roteiro-validacao.md`
- `05-copilot-runbook.md`

## Regra de execucao

Nao tentar implementar tudo de uma vez.
Executar fase por fase com consolidacao documental a cada etapa.
Nao classificar WhatsApp como parte concluida da primeira onda.
