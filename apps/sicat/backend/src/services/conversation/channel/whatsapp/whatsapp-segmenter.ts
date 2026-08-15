/**
 * Empacotamento de blocos em MENSAGENS do WhatsApp (fase 4).
 *
 * Puro e sem dependencia de config: os tetos sao INJETADOS. Separado do renderer de proposito -
 * juntos, a matriz de teste viraria "21 familias x N cenarios de tamanho"; separados, este modulo
 * prova suas invariantes com blocos sinteticos e o renderer prova conteudo sem depender de tamanho.
 *
 * INVARIANTES QUE ESTE MODULO SUSTENTA
 *
 *  1. **Bloco eh ATOMO** - nunca atravessa fronteira de segmento. Um item de MTR partido entre a
 *     bolha 1 e a 2 faz o operador ler o numero errado e ligar para o destinador errado; eh
 *     exatamente a falha que a fase existe para impedir.
 *  2. **A segunda mensagem eh GANHA, nao consequencia de estouro** - so nasce quando sobram
 *     `minLeftoverBlocksForExtraSegment` blocos INTEIROS depois de encher o segmento 1. Cada
 *     mensagem eh paga (o Twilio cobra por mensagem) e uma rajada le como spam; bloqueio do numero
 *     pelo operador eh dano permanente de canal, nao incidente.
 *  3. **Descarte NUNCA eh silencioso** - quando um bloco descartavel nao cabe, entra uma nota
 *     dizendo QUANTOS ficaram de fora. Truncagem silenciosa eh a classe de falha que a escada de
 *     honestidade elimina.
 *  4. **Bloco obrigatorio nunca eh descartado** - header/scope/note/affordance carregam a contagem
 *     honesta e a saida para o SICAT; sao eles que tornam o segmento 1 AUTOSSUFICIENTE, e eh isso
 *     que autoriza o `userNotified: true` no primeiro envio.
 *
 * O marcador `(n/N)` NAO eh emitido aqui (o compositor o adiciona no `finalizeSegment`), mas o
 * espaco dele eh RESERVADO na segunda passada: contar depois seria estourar o teto no final.
 */

import { cutAtGrapheme, type RenderBlock } from './whatsapp-render-blocks.js';

export type SegmenterOptions = {
  /** Alvo de UX por mensagem. Teto MOLE. */
  softChars: number;
  /** Teto DURO por mensagem (folga tecnica contra os 4096 do provedor). */
  hardChars: number;
  maxSegments: number;
  /** Quantos blocos inteiros precisam sobrar para GANHAR um segundo segmento. */
  minLeftoverBlocksForExtraSegment: number;
};

export type SegmentationResult = {
  /** INVARIANTE: `length >= 1`. */
  segments: string[];
  /** Blocos descartaveis que nao couberam. `> 0` sempre acompanha a nota de honestidade. */
  droppedBlocks: number;
};

/** Reserva para `\n\n(n/N)` quando houver mais de um segmento. Sobra folga de proposito. */
const MARKER_RESERVE = 12;

/** Aviso do corte DURO. Cabe dentro do teto de proposito, senao a correcao estouraria o limite. */
const HARD_CUT_NOTICE = '\n[...] Cortei aqui para caber na mensagem; o restante está no SICAT.';

/**
 * Separador entre dois blocos vizinhos.
 *
 * Lista com linha em branco entre os itens dobra a altura da mensagem e mata a varredura no celular;
 * cartoes colados viram um bloco ilegivel. Por isso o separador eh do PAR, nao global.
 */
function separatorBetween(previous: RenderBlock, current: RenderBlock): string {
  if (current.kind === 'item' && (previous.kind === 'item' || previous.kind === 'header' || previous.kind === 'scope')) {
    return '\n';
  }
  if (current.kind === 'scope' && previous.kind === 'header') return '\n';
  if (current.kind === 'note' && previous.kind === 'scope') return '\n';
  if (current.kind === 'affordance' && previous.kind === 'affordance') return '\n';
  return '\n\n';
}

function joinBlocks(blocks: RenderBlock[]): string {
  let output = '';
  let previous: RenderBlock | null = null;
  for (const block of blocks) {
    output += previous ? `${separatorBetween(previous, block)}${block.text}` : block.text;
    previous = block;
  }
  return output;
}

function measure(blocks: RenderBlock[], candidate: RenderBlock): number {
  const last = blocks[blocks.length - 1];
  const separator = last ? separatorBetween(last, candidate).length : 0;
  return separator + candidate.text.length;
}

/** Enche UM segmento na ordem dos blocos. Devolve o que coube e o que sobrou. */
function fillSegment(
  blocks: RenderBlock[],
  budget: number
): { taken: RenderBlock[]; rest: RenderBlock[] } {
  const taken: RenderBlock[] = [];
  let used = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const cost = measure(taken, block);
    // O primeiro bloco entra SEMPRE: um segmento vazio nao existe, e bloco maior que o teto eh
    // tratado na truncagem dura (com metrica), nunca por descarte mudo.
    if (taken.length > 0 && used + cost > budget) {
      return { taken, rest: blocks.slice(index) };
    }
    taken.push(block);
    used += cost;
  }

  return { taken, rest: [] };
}

function buildDropNotice(count: number): RenderBlock {
  const text = count === 1
    ? 'Cortei 1 item para a mensagem caber aqui. A lista inteira está no SICAT pelo navegador.'
    : `Cortei ${count} itens para a mensagem caber aqui. A lista inteira está no SICAT pelo navegador.`;
  return { kind: 'note', text, droppable: false };
}

function packLeftovers(
  segmentsSoFar: RenderBlock[][],
  leftovers: RenderBlock[]
): number {
  // Ultimo recurso: descarta os DESCARTAVEIS, contabiliza, e devolve os obrigatorios ao ultimo
  // segmento. Header/scope/affordance/protocolo nunca somem.
  const droppable = leftovers.filter((block) => block.droppable);
  const mandatory = leftovers.filter((block) => !block.droppable);
  const last = segmentsSoFar[segmentsSoFar.length - 1];
  if (last) {
    if (droppable.length > 0) last.push(buildDropNotice(droppable.length));
    for (const block of mandatory) last.push(block);
  }
  return droppable.length;
}

function packOnce(blocks: RenderBlock[], options: SegmenterOptions, reserve: number): SegmentationResult {
  const softBudget = Math.max(1, Math.floor(options.softChars) - reserve);
  const maxSegments = Math.max(1, Math.floor(options.maxSegments));
  const minLeftover = Math.max(1, Math.floor(options.minLeftoverBlocksForExtraSegment));

  const packed: RenderBlock[][] = [];
  let remaining = blocks;
  let dropped = 0;

  while (remaining.length > 0) {
    const { taken, rest } = fillSegment(remaining, softBudget);
    packed.push(taken);
    remaining = rest;

    if (remaining.length === 0) break;

    // A SEGUNDA MENSAGEM EH GANHA: sobrando pouco, o resto eh cortado (com nota) em vez de custar
    // outra bolha. Se 2 mensagens nao bastam, o problema eh o escopo da pergunta, nao a formatacao.
    if (packed.length >= maxSegments || remaining.length < minLeftover) {
      dropped += packLeftovers(packed, remaining);
      remaining = [];
    }
  }

  if (packed.length === 0) return { segments: [''], droppedBlocks: 0 };

  const hardLimit = Math.max(1, Math.floor(options.hardChars) - reserve);
  const segments = packed.map((group) => {
    const text = joinBlocks(group);
    if (text.length <= hardLimit) return text;
    // Um bloco sozinho acima do teto duro so acontece se um cap de campo falhou. Corte em grafema +
    // AVISO HONESTO que cabe DENTRO do teto - nunca `slice` cru (lone surrogate = mensagem
    // REJEITADA) e nunca reticencia muda (truncagem invisivel eh a falha que a escada elimina).
    const room = Math.max(1, hardLimit - HARD_CUT_NOTICE.length);
    return `${cutAtGrapheme(text, room)}${HARD_CUT_NOTICE}`;
  });

  return { segments, droppedBlocks: dropped };
}

/**
 * Empacota `blocks` em ate `maxSegments` mensagens.
 *
 * Duas passadas de proposito: a primeira descobre SE havera mais de uma mensagem; a segunda refaz o
 * orcamento reservando espaco para o marcador `(n/N)`. Sem isso, o marcador entraria depois da
 * truncagem e o ultimo segmento estouraria o teto - o desfecho eh mensagem rejeitada e operador mudo.
 */
export function splitIntoSegments(blocks: RenderBlock[], options: SegmenterOptions): SegmentationResult {
  const usable = (Array.isArray(blocks) ? blocks : [])
    .filter((block): block is RenderBlock => Boolean(block && typeof block.text === 'string' && block.text.trim()))
    .map((block) => ({ ...block }));

  if (usable.length === 0) return { segments: [''], droppedBlocks: 0 };

  const first = packOnce(usable.map((block) => ({ ...block })), options, 0);
  if (first.segments.length <= 1) return first;

  return packOnce(usable.map((block) => ({ ...block })), options, MARKER_RESERVE);
}
