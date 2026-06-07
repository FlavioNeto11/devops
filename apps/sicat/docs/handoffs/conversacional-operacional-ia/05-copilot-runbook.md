# Copilot runbook

## Objetivo

Dar um caminho pratico para executar esta frente no VS Code com GitHub Copilot Chat, priorizando a primeira onda sem WhatsApp.

## Diretriz de escopo

A primeira onda desta frente cobre:
- documentacao canonica
- backend conversacional
- popup interno
- homepage
- app light tipo chat
- hardening e readiness

O canal WhatsApp fica para uma segunda onda futura e nao deve bloquear esta entrega.

## Ordem recomendada

### 1. Planejamento e consolidacao

No VS Code Copilot Chat, execute:

- `planejar-camada-conversacional-sicat`

### 2. Execucao da fase 1

Execute:

- `executar-camada-conversacional-sicat`

Com foco em:

- fase 1
- documentacao canonica

### 3. Execucao da fase 2

Execute novamente:

- `executar-camada-conversacional-sicat`

Com foco em:

- fase 2
- backend conversacional
- provider OpenAI
- LangGraph
- LangSmith
- policy layer
- tools internas
- auditoria de acoes

### 4. Execucao da fase 3

Execute:

- `implementar-camada-conversacional-fase`

Com:

- `fase_id = 3`
- `objetivo_fase = popup interno com copiloto contextual usando o backend conversacional`

### 5. Execucao da fase 4

Execute:

- `incorporar-camada-conversacional-homepage`

### 6. Execucao da fase 5

Execute:

- `implementar-camada-conversacional-fase`

Com:

- `fase_id = 5`
- `objetivo_fase = app simplificado tipo chat com thread conversacional, cards de acao, autenticacao SICAT, conta CETESB ativa e consultas operacionais guiadas`

Depois execute:

- `continuar-camada-conversacional-sicat`

Com foco em:

- validar o que da fase 5 ficou pronto
- listar pendencias do app simplificado
- consolidar gaps antes do hardening

### 7. Execucao da fase 6

Execute:

- `executar-camada-conversacional-sicat`

Com foco em:

- fase 6
- hardening
- telemetria
- testes
- fallback
- readiness

Se quiser mais controle, execute em seguida:

- `implementar-camada-conversacional-fase`

Com:

- `fase_id = 6`
- `objetivo_fase = hardening da camada conversacional com telemetria, auditoria consolidada, testes minimos, fallback, handoff e governanca final`

Depois execute:

- `continuar-camada-conversacional-sicat`

Com foco em:

- consolidacao final da primeira onda
- checklist de pronto
- backlog da segunda onda

### 8. Fase 7

A fase 7 fica reservada para a segunda onda, cobrindo:

- adaptador WhatsApp
- identidade de canal
- politicas especificas de canal externo
- confirmacao operacional via mensageria
- readiness do canal WhatsApp

Nao iniciar a fase 7 antes da primeira onda estar consolidada.

## Regra de operacao

Toda execucao deve:

1. ler `docs/handoffs/conversacional-operacional-ia/README.md`
2. ler `docs/copilot/16-camada-conversacional.md`
3. ler os arquivos da trilha `docs/copilot/conversacional/`
4. respeitar a arquitetura atual do repositorio
5. registrar progresso no handoff correspondente

## Criterio de qualidade

Se o Copilot tentar:

- tratar os 3 canais como identicos
- chamar isso de chatbot generico
- propor bypass de seguranca
- inventar endpoint que o repo nao tem
- ignorar docs canonicas
- puxar WhatsApp para dentro do escopo imediato sem autorizacao

a execucao deve ser corrigida antes de seguir.
