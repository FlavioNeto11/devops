# Plano executavel

## Fase 1 - Fechar o dominio canonico

### Objetivo
Consolidar a documentacao e o vocabulário do dominio conversacional.

### Status consolidado desta fase
- Concluida no eixo documental.
- Escopo desta fase nao inclui implementacao tecnica em `src/` ou `frontend/`.
- Tudo que depende de rotas/repositorios/schema da camada conversacional permanece planejado para a Fase 2 em diante.

### Donos primarios
- `orquestrador-mtr`
- `documentador-mtr`

### Entregas
- docs copilot da camada conversacional
- matriz de intencoes
- matriz de seguranca
- catalogo inicial de telas e campos
- contratos conceituais de tools

### Criterio de pronto
- existe trilha canonica coesa
- existe taxonomia de intents
- existe politica por canal
- existe base minima para prompts e tools
- diferenca entre "implementado no repositorio" e "planejado para fases futuras" esta explicita

## Fase 2 - Backend base da conversa

### Objetivo
Criar o dominio tecnico conversacional no backend.

### Donos primarios
- `orquestrador-mtr`
- `programador-backend-mtr`
- `postgres-queue-mtr`
- `documentador-mtr`

### Entregas
- schema inicial SQL
- repositories de conversa
- routes de conversa
- conversation service
- policy service
- context service
- llm provider abstraction
- tool dispatcher

### Criterio de pronto
- backend consegue abrir sessao conversacional
- backend consegue registrar turnos
- backend consegue executar tools consultivas
- backend registra auditoria da conversa

## Fase 3 - Popup interno na plataforma

### Objetivo
Entregar o primeiro copiloto usavel no shell autenticado.

### Donos primarios
- `orquestrador-mtr`
- `frontend-vue-ux-mtr`
- `programador-backend-mtr`
- `tester-qa-mtr`

### Entregas
- launcher do assistente
- painel lateral ou popup
- composer + thread
- contexto da tela atual
- chamadas ao backend conversacional
- respostas consultivas e explicativas
- navegacao assistida

### Criterio de pronto
- usuario autenticado consegue conversar dentro do portal
- assistente entende a rota atual
- assistente explica tela e campos
- assistente consulta manifesto e status
- assistente respeita permissao e conta ativa

## Fase 4 - Homepage do diferencial

### Objetivo
Incorporar a camada conversacional como grande diferencial da home.

### Donos primarios
- `frontend-vue-ux-mtr`
- `documentador-mtr`

### Entregas
- novo capitulo visual premium
- narrativa multicanal
- copy e posicionamento
- integracao com linguagem atual da home

### Criterio de pronto
- a home apresenta o diferencial conversacional claramente
- nao vira bloco de texto
- nao quebra os canvases atuais

## Fase 5 - App simplificado tipo chat

### Objetivo
Criar a superficie conversacional externa do ecossistema SICAT.

### Donos primarios
- `frontend-vue-ux-mtr`
- `programador-backend-mtr`
- `tester-qa-mtr`

### Entregas
- rota/app conversacional
- thread, cards, quick actions
- autenticacao e conta ativa
- consulta operacional
- documentos e historico

### Criterio de pronto
- usuario simples consegue usar o SICAT em modo conversacional proprio

## Fase 6 - Hardening da primeira onda

### Objetivo
Consolidar observabilidade, validacao, fallback e readiness da camada conversacional nativa (popup interno + app light), sem abrir canal externo.

### Donos primarios
- `orquestrador-mtr`
- `programador-backend-mtr`
- `dashboard-observability-mtr`
- `frontend-vue-ux-mtr`
- `tester-qa-mtr`
- `documentador-mtr`

### Entregas
- fechamento dos gaps de cobertura automatizada da Fase 5
- telemetria essencial da camada conversacional
- testes minimos de regressao e governanca consultiva
- fallback e handoff consolidados
- readiness da primeira onda

### Criterio de pronto
- riscos conhecidos da primeira onda mitigados
- cobertura minima automatizada para consultas guiadas e bloqueio consultivo
- observabilidade e fallback suficientes para rollout controlado

## Fase 7 - WhatsApp operacional (segunda onda)

### Objetivo
Abrir canal externo WhatsApp com politicas especificas e governanca por risco, somente apos fechamento do hardening da primeira onda.

### Donos primarios
- `orquestrador-mtr`
- `programador-backend-mtr`
- `integrador-cetesb-mtr`
- `tester-qa-mtr`
- `documentador-mtr`

### Entregas
- adaptador de canal
- webhook inbound/outbound
- vinculacao telefone -> usuario
- consultas e orientacoes
- acoes controladas com confirmacao
- logs e auditoria por canal

### Criterio de pronto
- usuario validado consegue consultar e receber orientacao no WhatsApp
- acoes sensiveis seguem gates fortes
- politicas de canal externo validadas em QA dedicado
