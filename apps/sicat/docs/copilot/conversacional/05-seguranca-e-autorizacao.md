# Seguranca e autorizacao

## Objetivo

Garantir que a IA seja util sem virar bypass de governanca.

## Principios

1. A IA nunca eleva permissao do usuario.
2. O canal mais simples e o mais restritivo.
3. Acao sensivel sempre deixa trilha.
4. Confirmacao de usuario nao substitui permissao.
5. Contexto insuficiente gera bloqueio, nao improviso.
6. A plataforma principal pode ter mais poder por ter mais contexto.
7. Toda operacao deve respeitar conta CETESB ativa, sessao valida e escopo do usuario.

## Politica por canal

| Tipo | WhatsApp | App simplificado | Assistente interno |
| --- | --- | --- | --- |
| Consulta | permitido | permitido | permitido |
| Explicacao | permitido | permitido | permitido |
| Navegacao | limitado | permitido | permitido |
| Sugestao guiada | limitado | permitido | permitido |
| Acao operacional simples | muito restrito | permitido com policy | permitido com policy |
| Acao sensivel | confirmar + policy forte | confirmar + policy | confirmar + policy + contexto |
| Acao administrativa | bloqueado | bloqueado ou redirecionado | permitido so se perfil permitir |

## Niveis de risco

### R0 - Informacional
Sem impacto operacional.
Ex.: explicar um status.

### R1 - Consultivo contextual
Le dados do sistema, sem alterar estado.
Ex.: consultar pendencias.

### R2 - Preparacao assistida
Prepara ou sugere acao, mas nao altera estado externo.
Ex.: montar rascunho, sugerir preenchimento.

### R3 - Execucao controlada
Altera estado, mas com risco operacional moderado.
Ex.: submit, print, consulta acionavel, troca de foco operacional.

### R4 - Execucao sensivel
Pode gerar impacto regulatorio ou operacional significativo.
Ex.: cancelamento, baixa futura, acao irreversivel.

### R5 - Administrativo / alto impacto
Permissao elevada, multiplas contas, perfis, acesso, seguranca.

## Confirmacoes obrigatorias

Confirmacao explicita para:
- cancelamento
- qualquer acao irreversivel
- operacao em canal externo sem contexto visual
- qualquer acao com impacto em manifestos ja enviados
- qualquer acao por WhatsApp acima de R2

## Step-up authentication

Prever passo adicional para:
- operacoes de alto risco
- contexto de canal externo pouco confiavel
- tentativa de execucao sem sessao recente
- operacao administrativa
- troca de identidade/conta

Exemplos:
- codigo one-time
- link de confirmacao no app
- confirmacao via plataforma principal
- challenge na sessao autenticada

## Bloqueios obrigatorios

Bloquear quando:
- usuario nao autenticado
- conta CETESB nao ativa
- canal nao permitido para a tool
- backend ainda nao implementa a acao
- falta contexto minimo
- baixa confianca do modelo com risco alto
- operacao fora do perfil do usuario

## Auditoria obrigatoria por acao

Toda acao executada deve registrar:
- canal
- usuario
- conta ativa
- intencao classificada
- risk level
- tool chamada
- argumentos
- confirmacao recebida
- correlationId
- resultado
- jobId, se houver
- mensagens relevantes do turno

## Regra pratica de produto

Melhor bloquear com clareza do que executar com ambiguidade.

## Estado implementado na fase 05-domain-rules (chat-copiloto-operacional)

1. Guardrail de contexto ativo: operacoes de manifesto no chat exigem `integrationAccountId` ativo.
2. Guardrail de sessao CETESB: acoes que dependem de sessao (submit/create completo/receive) exigem `sessionContextId`.
3. Confirmacao obrigatoria mantida para R3/R4, incluindo novos intents de lote e recebimento.
4. Permission compatibility: quando `context.metadata.permissionKeys` e informado, a policy bloqueia operacoes fora do escopo (`PERMISSION_DENIED`).
5. Bloqueio seguro de lote: acima de 10 itens, a acao e recusada com orientacao para fatiar o comando.
6. Mensagens de erro operacionais (faltantes, ambiguidade, contexto ausente) foram especializadas para orientar o operador em proximo passo objetivo.
