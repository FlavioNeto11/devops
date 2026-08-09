/**
 * Diretiva de ESTILO POR CANAL para a redação (fase 4 da cadeia `whatsapp-channel-sicat`).
 *
 * O canal já circulava no serviço até a policy (`ConversationContext.channel`) e parava ali: um grep
 * por `channel` em `llm-provider.ts` e em `conversation-prompt-defaults.ts` dava ZERO. Resultado: a
 * mesma redação escrita para uma tela de navegador saía numa bolha de celular.
 *
 * ┌─ TRÊS DECISÕES QUE ESTE MÓDULO CARREGA ───────────────────────────────────────────────────────┐
 * │ 1. **Bloco ADICIONAL, nunca edição do prompt existente.** Segue o precedente de                │
 * │    `MANIFEST_STATUS_VOCABULARY_HINT`. Blast radius = uma comparação de string, bloco testável  │
 * │    isolado, e o caminho do navegador recebe ZERO tokens novos.                                 │
 * │ 2. **Portão explícito.** `channel !== 'whatsapp'` devolve `null` e a lista de SystemMessages    │
 * │    sai BYTE-A-BYTE idêntica à de hoje. É isso que prova que a fase não mexeu no chat web.       │
 * │ 3. **NÃO injetar no planner (`buildSystemPrompt`).** A escolha de TOOL não pode variar por      │
 * │    canal — isso seria mudança de CORREÇÃO disfarçada de formatação, e quem diferencia canal é  │
 * │    a policy.                                                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ A exigência de CITAR O NÚMERO na primeira frase não é estilo: `validateIntentResponseGuardrails`
 * REPROVA redação que não cite um número da evidência (ou não declare a ausência). Uma diretiva que
 * só pedisse brevidade faria TODA resposta de WhatsApp cair no template determinístico do dispatcher
 * — exatamente o texto de navegador que esta fase existe para matar — e o sintoma observado seria "o
 * prompt não fez efeito", não "a resposta foi reprovada". O bloco tem de ser CÚMPLICE do guardrail.
 *
 * ⚠️ Prompt é QUALIDADE; o renderer é GARANTIA. `shouldBypassNaturalSynthesis` produz texto SEM LLM
 * (diagnóstico, rascunhos, prévias), e nenhum bloco de prompt alcança esse caminho. Este módulo
 * melhora o texto quando há LLM; a ficha determinística é a barreira que SEMPRE roda.
 *
 * Sem acento nas diretivas, no mesmo estilo dos hints já injetados.
 */

const WHATSAPP_STYLE_DIRECTIVE = [
  'CANAL DE ENTREGA: WHATSAPP (mensagem de celular, somente leitura).',
  '- Escreva no maximo 2 frases. A ficha com os dados vem DEPOIS, montada pelo sistema:',
  '  NAO liste os itens, NAO repita item por item. Cite no maximo 1 exemplo.',
  '- A PRIMEIRA frase precisa trazer o numero que veio da evidencia (quantos, de que periodo)',
  '  ou dizer explicitamente que nao havia nada.',
  '- Proibido: tabela, cabecalho (#), link com rotulo [texto](url), lista com recuo, bullet.',
  '  Negrito e *assim*, com UM asterisco.',
  '- Nao mande clicar em botao, aba, menu ou icone: aqui nao existe tela. Se a acao so existe',
  '  no SICAT, escreva "no SICAT pelo navegador".',
  '- Nao prometa anexo, PDF, planilha nem arquivo: por este canal voce nao envia arquivos.',
  '- Nao peca confirmacao e nunca escreva \'responda confirmo ...\'.',
  '- Nao invente numero de MTR, data nem situacao que nao esteja na evidencia.'
].join('\n');

/**
 * Bloco de estilo do canal, ou `null` quando não há nada a acrescentar.
 *
 * `null` para TUDO que não seja exatamente `'whatsapp'` — inclusive `undefined`, string vazia e
 * canais futuros. Falha FECHADA: um canal novo herda o comportamento atual em vez de herdar
 * instruções escritas para mensageria.
 */
export function buildChannelStyleDirective(channel: string | null | undefined): string | null {
  if (typeof channel !== 'string') return null;
  return channel.trim().toLowerCase() === 'whatsapp' ? WHATSAPP_STYLE_DIRECTIVE : null;
}
