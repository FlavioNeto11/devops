# Catalogo inicial de campos

## Objetivo

Servir como semente da base de conhecimento do assistente para explicacao de campos, ajuda contextual e sugestao de preenchimento.

## Observacao

Este catalogo inicial nao pretende ser exaustivo.
Ele deve crescer junto com a implementacao.

## Campos e grupos conhecidos

### Autenticacao SICAT
- `email`: identificador do usuario no SICAT
- `password`: credencial do usuario do SICAT

### Contexto CETESB
- `integrationAccountId`: conta interna de integracao
- `sessionContextId`: contexto operacional de sessao para a conta ativa
- `partnerCode`: codigo do parceiro na CETESB
- `partnerDocument`: CPF/CNPJ do parceiro
- `accountType`: tipo de conta operacional ativa

### Manifesto - dados conhecidos a partir da documentacao atual
- `responsibleName`: nome do responsavel
- `manifestType`: tipo do manifesto
- `expeditionDate`: data de expedicao
- `generator`: participante gerador
- `carrier`: participante transportador
- `receiver`: participante destinador
- `residues`: residuos associados
- `recaptchaToken`: campo tecnico do fluxo de integracao
- `manCodigo`: identificador externo na CETESB
- `manNumero`: numero externo do manifesto
- `external_hash_code`: hash externo retornado

## Estrutura recomendada para evolucao

Para cada campo relevante, documentar:
- nome tecnico
- nome amigavel
- tela(s)
- tipo
- obrigatoriedade
- quem preenche
- quando aparece
- validacoes
- erros comuns
- explicacao para usuario simples
- se a IA pode sugerir
- se a IA pode preencher
- se a IA pode executar acao relacionada

## Exemplo recomendado

```json
{
  "fieldKey": "manifestType",
  "label": "Tipo do manifesto",
  "screen": "/manifestos/novo",
  "required": true,
  "dataType": "enum",
  "explainerShort": "Define a natureza da operacao do manifesto.",
  "commonMistakes": [
    "escolher tipo incompatível com a conta ativa"
  ],
  "aiCapabilities": {
    "canExplain": true,
    "canSuggest": true,
    "canAutofill": false
  }
}
```
