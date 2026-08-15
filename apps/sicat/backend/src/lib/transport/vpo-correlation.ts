// Correlação pré-aquisição do VPO (PR-D1) — fonte única do marcador deste domínio.
//
// Réplica DELIBERADA dos princípios de `lib/transport/ciot-correlation.ts` (DL-102), NÃO reuso: o
// VPO é um bounded context próprio e o marcador aqui não acopla ao módulo CIOT — as duas pontas
// (service que grava o marcador ANTES da chamada e o gateway que responde/consulta por marcador)
// derivam o formato a partir DESTE arquivo, nunca do irmão CIOT.
//
// A referência remota do VPO (`vpo_allocations.provider_reference`) só nasce na RESPOSTA do
// provedor. Se a resposta se perder, a única forma de perguntar "isto nasceu?" é por este marcador
// determinístico, gravado ANTES da chamada.

const MARKER_PREFIX = '[sicat-vpo:';
const MARKER_SUFFIX = ']';

// Ids locais de vpo_allocations são `vpoalloc_<hex>`. O padrão aceita qualquer id sem espaços/colchetes.
const MARKER_PATTERN = /\[sicat-vpo:([A-Za-z0-9_.-]+)\]/;

/**
 * Gera o marcador de correlação de uma aquisição de VPO. Determinístico: o mesmo `vpoAllocationId`
 * sempre produz o mesmo marcador — é o que permite ao reconciliador reconstruir a pergunta a partir
 * da linha local, mesmo depois de o processo que fez o dispatch ter morrido.
 */
export function buildVpoCorrelationMarker(vpoAllocationId: string): string {
  const normalized = String(vpoAllocationId ?? '').trim();
  if (!normalized) {
    throw new Error('vpoAllocationId é obrigatório para gerar o marcador de correlação do VPO.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`vpoAllocationId inválido para marcador de correlação do VPO: "${vpoAllocationId}"`);
  }
  return `${MARKER_PREFIX}${normalized}${MARKER_SUFFIX}`;
}

/** Extrai o id local da linha `vpo_allocations` de um marcador — caminho de volta para o reconciliador. */
export function extractVpoAllocationIdFromMarker(marker: unknown): string | null {
  if (typeof marker !== 'string') return null;
  const match = MARKER_PATTERN.exec(marker);
  return match?.[1] ?? null;
}
