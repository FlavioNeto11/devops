// capabilities.js — helpers PUROS do catálogo de blocos de capacidade do Forge.
// O catálogo (specs/baseline/capabilities.json) é assado no FRONTEND do reqhub e enviado nas tools
// forge.* (mesmo padrão do `grounding`): o backend NÃO lê o arquivo — ele NORMALIZA o que recebe e
// VALIDA fail-closed (a IA nunca seleciona um bloco fora do conjunto conhecido / fora do blueprint /
// fora da stack / em conflito). Princípio ai-no-hardcoded-heuristics: nada de mapa de sinônimos;
// o conjunto canônico vem do catálogo declarativo, o código só computa filtragem/ordem.

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Normaliza um item do catálogo recebido (defensivo contra payload parcial).
function normBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const id = str(b.id);
  if (!id) return null;
  return {
    id,
    title: str(b.title) || id,
    description: str(b.description),
    category: str(b.category),
    requires: arr(b.requires).map(str).filter(Boolean),
    conflicts_with: arr(b.conflicts_with).map(str).filter(Boolean),
    compatible_stacks: arr(b.compatible_stacks).map(str).filter(Boolean),
    reuses: arr(b.reuses).map(str).filter(Boolean),
    reference: arr(b.reference).filter((r) => r && typeof r === 'object'),
    work_order_guidance: str(b.work_order_guidance),
    verification: arr(b.verification).filter((v) => v && typeof v === 'object'),
    default_adrs: arr(b.default_adrs).map(str).filter(Boolean),
  };
}

// Índice do catálogo: { ids:Set, byId:Map }.
export function catalogIndex(capabilities) {
  const blocks = arr(capabilities).map(normBlock).filter(Boolean);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return { blocks, byId, ids: new Set(byId.keys()) };
}

// Resumo COMPACTO do catálogo para o prompt (id · title · stacks · 1 linha de description).
// Opcional: filtra por stack e marca os blocos default/compatible de um blueprint.
export function summarizeForPrompt(capabilities, { stack = null, defaultBlocks = [], compatibleBlocks = [] } = {}) {
  const { blocks } = catalogIndex(capabilities);
  const def = new Set(arr(defaultBlocks));
  const comp = new Set(arr(compatibleBlocks));
  return blocks
    .filter((b) => !stack || b.compatible_stacks.includes(stack))
    .map((b) => {
      const tag = def.has(b.id) ? ' [default]' : comp.has(b.id) ? ' [compatível]' : '';
      const stacks = b.compatible_stacks.join('/');
      return `- ${b.id} (${stacks})${tag}: ${b.title}. ${b.description}`;
    })
    .join('\n');
}

// Filtra uma lista de ids ao conjunto CONHECIDO (fail-closed). Retorna {kept, dropped:[{id,reason}]}.
export function filterKnownBlocks(ids, knownSet) {
  const kept = [];
  const dropped = [];
  for (const raw of arr(ids)) {
    const id = str(raw);
    if (!id) continue;
    if (knownSet.has(id)) kept.push(id);
    else dropped.push({ id, reason: 'desconhecido (fora do catálogo)' });
  }
  return { kept, dropped };
}

// Valida a SELEÇÃO de blocos de um produto (fase de arquitetura), fail-closed:
//  - existe no catálogo; é compatível com a stack; está em default∪compatible do blueprint;
//  - não viola conflicts_with entre os selecionados.
// Sempre inclui os default_blocks do blueprint (ex.: observabilidade) e os `requires` transitivos.
export function validateSelection(selected, { stack, capabilities, defaultBlocks = [], compatibleBlocks = [] } = {}) {
  const { byId } = catalogIndex(capabilities);
  const allowed = new Set([...arr(defaultBlocks), ...arr(compatibleBlocks)]);
  const dropped = [];
  const chosen = new Set(arr(defaultBlocks).filter((id) => byId.has(id))); // defaults sempre entram

  for (const raw of arr(selected)) {
    const id = str(raw);
    if (!id || chosen.has(id)) continue;
    const blk = byId.get(id);
    if (!blk) { dropped.push({ id, reason: 'desconhecido (fora do catálogo)' }); continue; }
    if (stack && !blk.compatible_stacks.includes(stack)) { dropped.push({ id, reason: `incompatível com a stack ${stack}` }); continue; }
    if (allowed.size && !allowed.has(id)) { dropped.push({ id, reason: 'fora do blueprint (não default nem compatível)' }); continue; }
    chosen.add(id);
  }

  // fecho transitivo de requires (puxa dependências que existam e sejam compatíveis)
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...chosen]) {
      for (const req of byId.get(id)?.requires || []) {
        if (!chosen.has(req) && byId.has(req) && (!stack || byId.get(req).compatible_stacks.includes(stack))) { chosen.add(req); changed = true; }
      }
    }
  }

  // conflitos: se dois conflitantes ficaram, mantém o primeiro pela ordem do catálogo e dropa o outro
  const conflictsDropped = [];
  for (const id of [...chosen]) {
    if (!chosen.has(id)) continue;
    for (const c of byId.get(id)?.conflicts_with || []) {
      if (chosen.has(c)) { chosen.delete(c); conflictsDropped.push({ id: c, reason: `conflita com ${id}` }); }
    }
  }

  return { valid: [...chosen], dropped: [...dropped, ...conflictsDropped] };
}
