# Plano de fases de implementacao

## Visao geral

A camada conversacional deve ser implementada em fases pequenas, com criterio de pronto claro e sem prometer mais do que o backend atual suporta.

## Fase 1 - Base canonica e governanca
Entregas:
- documentacao canonica desta trilha
- matriz de intencoes e actions
- regras de seguranca por canal
- catalogo inicial de telas
- catalogo inicial de campos
- tool contracts fase 1

## Fase 2 - Dominio conversacional no backend
Entregas:
- rotas conversacionais
- repositorios e schema inicial
- conversation service
- policy service
- context service
- dispatcher de tools
- llm provider abstraction
- logs e trilha de execucao

## Fase 3 - Popup interno na plataforma
Entregas:
- launcher do assistente
- painel de conversa
- integracao com rota/tela/contexto
- tools consultivas
- copiloto de navegacao
- sugestao de campo e explicacao de tela

## Fase 4 - App simplificado tipo chat
Entregas:
- rota propria do app simplificado
- thread conversacional
- cards de acao
- autenticacao e conta ativa
- fluxos guiados simples
- documentos e historico

## Fase 5 - WhatsApp operacional
Entregas:
- adaptador de canal
- vinculacao de identidade
- politicas especificas
- consultas e orientacoes
- acoes permitidas com confirmacao
- handoffs e redirecionamentos

## Fase 6 - Homepage e posicionamento
Entregas:
- novo capitulo visual na home
- narrativa multicanal
- integracao com experiencia canvas atual
- posicionamento do diferencial conversacional

## Fase 7 - Hardening e telemetria
Entregas:
- dashboards e metricas da camada conversacional
- testes de risco
- fluxos de fallback
- trilha de auditoria consolidada
- governanca de prompts e base de conhecimento

## Ordem recomendada

Fase 1 -> Fase 2 -> Fase 3 -> Fase 6 -> Fase 4 -> Fase 5 -> Fase 7

## Justificativa da ordem

- primeiro fecha o que a IA pode ser e fazer;
- depois cria o nucleo tecnico;
- depois cria o copiloto interno, mais facil pela infraestrutura existente;
- em seguida comunica na home;
- depois expande para app simplificado;
- por fim abre o canal WhatsApp com mais seguranca;
- encerra com hardening e governanca refinada.
