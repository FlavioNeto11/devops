# Fallback e handoff

## Objetivo

Definir o que a camada conversacional faz quando:
- nao entende com confianca;
- nao pode executar;
- precisa de mais contexto;
- precisa transferir o usuario para outro canal ou para a interface principal.

## Tipos de fallback

### Fallback 1 - pedir clarificacao
Quando a intencao e ambigua.

Exemplo:
"quero ver isso"
A IA deve perguntar:
"Voce quer ver o status, o documento ou o historico do manifesto?"

### Fallback 2 - contexto insuficiente
Quando a acao depende de manifesto, conta ou tela.

Exemplo:
"cancela"
A IA deve pedir:
"Qual manifesto voce quer cancelar?"

### Fallback 3 - bloqueio por politica
Quando o canal ou o perfil nao pode executar.

Exemplo:
cancelamento via WhatsApp sem contexto suficiente.

### Fallback 4 - redirecionamento de canal
Quando outro canal e mais apropriado.

Exemplos:
- abrir plataforma principal para operacao administrativa
- abrir app simplificado para confirmacao estruturada
- usar popup interno para ajuda de tela

### Fallback 5 - handoff para humano / suporte
Quando:
- a situacao for anomala
- houver erro operacional nao explicado
- houver conflito de permissao
- houver baixa confianca persistente em fluxo sensivel

## Tipos de handoff

### Handoff para tela
Levar o usuario para a tela certa na plataforma.

### Handoff para fluxo guiado
Abrir fluxo especifico no app simplificado.

### Handoff para suporte operacional
Registrar necessidade de atendimento humano.

### Handoff para processo formal
Quando a governanca exigir procedimento fora da conversa.

## Respostas recomendadas

### Quando puder explicar, explique
"Eu nao posso cancelar por aqui sem confirmar o manifesto e a permissao, mas posso te levar para a tela correta."

### Quando puder redirecionar, redirecione
"No portal, abra Manifestos > Detalhe do manifesto e confirme a acao."

### Quando puder manter contexto, mantenha
"Ja deixei o manifesto selecionado no painel para voce revisar."

## Regra de UX

Fallback nunca deve soar como erro seco.
Ele deve preservar orientacao e proximo passo.
