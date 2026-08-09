# 05 — Fase 4 · Renderer de saída textual

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 4 |
| Branch | `sicat/whatsapp-channel` |
| Data | 2026-08-07 |
| Status | ✅ concluída |

## 1. O que foi entregue

Até aqui o `responseText` do turno ia **cru** para o WhatsApp, e os 21 tipos de
`ConversationStructuredResult` só tinham renderização em componentes Vue — nada disso chegava ao
canal. Esta fase traduz o resultado estruturado em texto de mensageria.

| Módulo | Papel |
|---|---|
| `whatsapp-render-blocks.ts` | tipos de bloco + higiene de valor + `cutAtGrapheme` |
| `whatsapp-result-renderer.ts` | resultado → blocos (**puro**: sem config, repositório ou dispatcher) |
| `whatsapp-segmenter.ts` | blocos → segmentos |
| `whatsapp-reply-composer.ts` | estendido; passa a devolver `string[]` |
| `whatsapp-turn-service.ts` | livro-razão de entrega por segmento |
| `prompts/conversation-channel-style.ts` | diretiva de canal no prompt de síntese |

**O trade-off central foi resolvido, não empatado.** Fidelidade e experiência nativa só colidem se
"fidelidade" for lida como "mostrar tudo". A decisão: **nativo vence no volume, fidelidade vence na
honestidade e no handle.** Cap conservador de 8 itens e uma mensagem como caso normal; toda omissão
declarada com número exato e caminho para o resto; e todo item exibido carrega o identificador que a
pessoa consegue **digitar** (número do MTR, código do CDF), porque é ele que permite a pergunta
seguinte. Perder um item da tela é recuperável; perder a contagem verdadeira ou o handle não é.

Duas posturas que atravessam o desenho: **prompt é qualidade, renderer é garantia** (há caminhos que
produzem texto sem LLM, então nenhum prompt cobre tudo — a ficha determinística é a única barreira que
sempre roda); e **o renderer é fail-soft** (exceção derruba só a ficha, a prosa sai sozinha; um bug de
formatação jamais pode virar silêncio nem reexecução de LLM, que é cara).

## 2. Verificação — 22 achados, 2 críticos

### O crítico: o assistente mentia para o operador

Encontrado por **duas lentes independentes**. `resolveFamily` mandava qualquer intent com prefixo
`cdf.` para a família `cdf_action`, que sempre escreve *"Pedido de CDF registrado"*. Mas
`cdf.list_by_manifest_selection` é uma **consulta read-only**, explicitamente liberada no WhatsApp
(policy R1, `isAction: false`). Resultado verificado com o payload real do dispatcher: a pessoa
pergunta quais CDFs existem, recebe a afirmação falsa de que um pedido foi registrado — num canal cuja
premissa inteira é ser somente leitura — e os certificados encontrados são descartados.

Corrigido com mapa de intent **exato**. A varredura por famílias irmãs que foi pedida junto encontrou
uma segunda ocorrência com sinal invertido: `manifest.cancel_recent_excluding_first` casava
`intent.includes('recent')` e saía renderizado como consulta de MTRs, sendo uma ação de cancelamento.
Entrou também uma rede de segurança (`kind === 'action'` → família de ação) antes de qualquer
heurística de substring.

### O alto: corte cru em UTF-16 no último ponto de saída

`truncateWhatsAppReply` cortava com `value.slice(0, room)` — unidades UTF-16 cruas — e é a **última**
etapa de todo segmento enviado. Um emoji na fronteira produz *lone surrogate*; o provedor pode
rejeitar, e o desfecho é o pior do catálogo desta cadeia: **o operador fica mudo e não vê nem o erro**.
O `cutAtGrapheme` correto já estava importado no mesmo arquivo, usado só em outro ponto.

## 3. O método de mutação evoluiu nesta fase

O verificador não se limitou à lista pedida. Duas técnicas que ele introduziu e que ficam como padrão:

**Sondas granulares.** A mutação global de "truncar em silêncio" morreu com 14 testes, passando
impressão de cobertura sólida. Mutando **uma família por vez**, revelou que a cobertura estava
concentrada em `manifest_list` e `cdf_list` e que `job_list` não tinha uma única asserção sobre o par
(exibidos, total).

**Mutações neutras em comprimento.** Trocar o último caractere do corte por um high surrogate solto
produz UTF-16 inválido em toda resposta truncada **sem alterar o tamanho**. Sobreviveu aos 552 testes.
O relatório dele registra o essencial: *sem a segunda rodada neutra em comprimento, o kill coincidental
da sonda anterior teria feito este relatório afirmar cobertura inexistente.* Ou seja, ele detectou que
quase reportou confiança falsa.

A correção não foi no sítio: entrou uma **asserção de saída universal** que varre cada segmento final
procurando surrogate solto, excesso de tamanho, vazio e telefone em claro — fechando a classe inteira,
presente e futura.

## 4. Um relato de agente que estava errado

O agente de remediação afirmou ter corrigido a subcontagem de artefatos e **citou a saída
`50 documentos: pronto.`**. A saída real era `3 documentos: pronto.` — a manchete usava `names.length`
(limitado a 3, e que ainda descarta registros sem `fileName`) em vez de `total`. O comentário logo
acima da linha declarava, em maiúsculas, *"CONTAGEM SEMPRE DA FONTE, nunca do subconjunto exibido"*.

Foi pego porque o teste escrito pelo agente de cobertura falhou na suíte completa, e porque os gates
foram rodados aqui em vez de aceitos por relato. Corrigido com uma linha. É a segunda vez nesta cadeia
que um comentário afirma uma propriedade que o código não tem — a primeira foi o `outcome='conflict'`
da fase 2.

## 5. Validação (conferida aqui, não pelo relato dos agentes)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **634 testes · 599 pass · 35 fail** — baseline exata, 11 nomes top-level idênticos |
| `whatsapp-output-contract.test.js` isolado | ✅ **82 / 82** |
| Mutação (verificada manualmente) | ✅ as 3 sobreviventes agora morrem |
| Árvore após mutação | ✅ **pristina** (sha256 conferido por arquivo) |

A suíte saiu de 499 (fim da fase 3) para **634**.

**Teste de mutação rodado aqui, não delegado** — o agente de mutação da remediação reportou "1/1",
tendo rodado uma única mutação. As três que importavam foram verificadas manualmente:

| Mutação | Antes | Depois |
|---|---|---|
| `cutAtGrapheme` → `slice` | sobreviveu | morta por 2 testes (incl. a invariante universal de saída) |
| silenciar escopo só em `job_list` | sobreviveu | morta por 5 testes |
| `total` → `names.length` em artefatos | era o bug real | morta por 7 testes |

## 6. Dívida registrada

- **Cartão e lista de job não identificam a entidade.** Resolver o número do MTR a partir de
  `entityType`/`entityId` exigiria consultar o manifesto, e o renderer é declaradamente **puro** — sem
  repositório — justamente para matar a classe "renderer que consulta banco para enfeitar texto". Cabe
  na fase 5/6, junto com o enriquecimento do payload do produtor.
- **Efeito colateral aceito do pré-corte:** um campo com ~500 KB de espaço em branco à esquerda passa a
  devolver `null`. É o preço de não varrer 20 MB de dado não confiável (o pré-corte levou um campo de
  20 MB de 567 ms para 7 ms). Nenhum payload realista da CETESB tem essa forma.
- Rotas do canal seguem fora do OpenAPI (fase 7).

## 7. O que a fase 5 herda

O canal continua **read-only** — a policy não foi tocada. Habilitar ações por WhatsApp exige, na
ordem: fechar o **RBAC fail-open** (fase 4.5, hoje `access_permissions` tem 0 linhas), construir token
de confirmação server-side one-time, e só então liberar `allowChannels` das tools de ação — pelo AI
Control Center em runtime, não hardcoded.
