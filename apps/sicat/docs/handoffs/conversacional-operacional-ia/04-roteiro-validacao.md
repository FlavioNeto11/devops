# Roteiro de validacao

## Validacao documental
- conferir alinhamento entre `16-camada-conversacional.md` e documentos da pasta `conversacional/`
- conferir coerencia com `docs/copilot/02-arquitetura.md`
- conferir coerencia com `docs/copilot/04-fluxos-operacionais.md`
- conferir coerencia com `docs/cetesb/README.md`

## Validacao backend
- sessao conversacional abre e persiste
- mensagens ficam registradas
- tools consultivas funcionam
- action logs ficam salvos
- correlationId aparece em respostas e logs

## Validacao frontend interno
- assistente aparece no shell autenticado
- contexto da tela e passado corretamente
- respostas sao contextualizadas pela rota
- acoes proibidas sao bloqueadas de forma clara

## Validacao por canal
### WhatsApp
- identidade do canal validada
- consultas basicas funcionam
- acoes sensiveis pedem confirmacao

### App simplificado
- cards e quick actions funcionam
- autenticacao e conta ativa respeitadas

### Popup interno
- copiloto entende a pagina atual
- explica campos e regras

## Validacao homepage
- diferencial conversacional aparece como grande inovacao
- home nao perde qualidade premium
- narracao multicanal fica clara

## Validacao de seguranca
- canal errado nao executa acao
- usuario sem permissao nao contorna regra
- acao de risco exige confirmacao
- logs de auditoria existem

## Validacao de produto
- usuario simples entende como usar
- usuario avancado percebe ganho de produtividade
- diferenca entre canais fica clara
