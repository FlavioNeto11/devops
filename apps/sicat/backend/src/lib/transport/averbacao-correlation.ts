// Correlação pré-declaração da averbação (PR-I3) — fonte única do marcador deste domínio.
//
// Réplica DELIBERADA dos princípios de `ciot-correlation.ts` (DL-102), NÃO reuso: a averbação é um
// bounded context próprio (REQ-SICAT-0034) e o marcador aqui identifica UMA declaração de embarque
// (`insurance_shipment_declarations`) perante a seguradora/averbadora — vai OU no request
// estruturado do gateway (campo dedicado de "referência do cliente", comum nos webservices reais de
// averbação) OU, no sandbox, como a própria chave do Map em memória. As duas pontas (service que
// cria a linha ANTES da chamada e o gateway que responde/consulta por marcador) DEVEM derivar o
// formato daqui.
//
// O `provider_declaration_ref` só nasce na RESPOSTA da seguradora — nenhum identificador nosso
// existe do lado de lá antes disso. Se a resposta se perder (timeout, pod morto entre o dispatch e
// o commit local), a única forma de perguntar "esta averbação nasceu?" é por este marcador
// determinístico, gravado ANTES da chamada.

const MARKER_PREFIX = '[sicat:';
const MARKER_SUFFIX = ']';

// Ids locais de insurance_shipment_declarations são `insdecl_<hex>`. O padrão aceita qualquer id
// sem espaços/colchetes — mesmo alfabeto de `ciot-correlation.ts`.
const MARKER_PATTERN = /\[sicat:([A-Za-z0-9_.-]+)\]/;

/**
 * Gera o marcador de correlação de uma declaração de averbação. Determinístico: o mesmo
 * `declarationId` sempre produz o mesmo marcador — é o que permite ao reconciliador reconstruir a
 * pergunta a partir da linha local, mesmo depois de o processo que fez o dispatch ter morrido.
 */
export function buildAverbacaoCorrelationMarker(declarationId: string): string {
  const normalized = String(declarationId ?? '').trim();
  if (!normalized) {
    throw new Error('declarationId é obrigatório para gerar o marcador de correlação da averbação.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`declarationId inválido para marcador de correlação da averbação: "${declarationId}"`);
  }
  return `${MARKER_PREFIX}${normalized}${MARKER_SUFFIX}`;
}

/** Extrai o id local da linha `insurance_shipment_declarations` de um marcador — caminho de volta para o reconciliador. */
export function extractDeclarationIdFromMarker(marker: unknown): string | null {
  if (typeof marker !== 'string') return null;
  const match = MARKER_PATTERN.exec(marker);
  return match?.[1] ?? null;
}
