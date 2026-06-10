// tools.js — contrato PADRONIZADO de tools de IA da plataforma.
//
// Toda funcionalidade de app exposta à IA vira uma AiTool com:
//   - inputSchema/outputSchema ESTRUTURAIS (qualquer objeto com .parse(), ex.: Zod)
//   - authorize(ctx): a IA NUNCA tem mais permissão que o usuário — a checagem é
//     por IDENTIDADE/escopo (OIDC/sessão do app), não pelo canal
//   - risk R1 (leitura) | R3 (mutação) | R4 (destrutiva)
//   - mutação roda SEMPRE dry-run primeiro (preview); execução real exige
//     confirmedToolCallId; R4 exige confirmação SEMPRE (mesmo com dry-run ok)
//
// O dispatcher é puro/sem IO próprio: quem fornece execute/authorize é o app
// (adapter). Erros são tipados para o grafo decidir (negar ≠ pedir confirmação).

export const TOOL_RISKS = Object.freeze(['R1', 'R3', 'R4']);

export class AiToolError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.name = 'AiToolError';
    this.code = code;
    Object.assign(this, extra);
  }
}
export class AiToolDeniedError extends AiToolError {
  constructor(toolName, reason) {
    super('TOOL_DENIED', `tool "${toolName}" negada: ${reason || 'sem permissao'}`, { toolName, reason });
    this.name = 'AiToolDeniedError';
  }
}
export class AiToolConfirmationRequiredError extends AiToolError {
  constructor(toolName, preview) {
    super('TOOL_CONFIRMATION_REQUIRED', `tool "${toolName}" requer confirmacao do usuario`, { toolName, preview });
    this.name = 'AiToolConfirmationRequiredError';
  }
}
export class AiToolInvalidInputError extends AiToolError {
  constructor(toolName, cause) {
    super('TOOL_INVALID_INPUT', `input invalido para a tool "${toolName}"`, { toolName, cause });
    this.name = 'AiToolInvalidInputError';
  }
}

function parseWith(schema, value, toolName, kind) {
  if (!schema || typeof schema.parse !== 'function') return value; // schema opcional (saída)
  try {
    return schema.parse(value);
  } catch (err) {
    if (kind === 'input') throw new AiToolInvalidInputError(toolName, err);
    // saída inválida não derruba o turno: sinaliza para o VERIFY/observabilidade
    throw new AiToolError('TOOL_INVALID_OUTPUT', `saida invalida da tool "${toolName}"`, { toolName, cause: err });
  }
}

/** Valida o shape mínimo de uma AiTool no registro (fail-fast no boot do app). */
export function assertValidTool(tool) {
  const problems = [];
  if (!tool || typeof tool !== 'object') problems.push('tool ausente');
  else {
    if (!tool.name || typeof tool.name !== 'string') problems.push('name obrigatorio');
    if (!tool.description) problems.push('description obrigatoria');
    if (!TOOL_RISKS.includes(tool.risk)) problems.push(`risk deve ser ${TOOL_RISKS.join('|')}`);
    if (typeof tool.execute !== 'function') problems.push('execute() obrigatorio');
    if (typeof tool.authorize !== 'function') problems.push('authorize() obrigatorio');
    if (tool.mutates && tool.risk === 'R1') problems.push('mutates exige risk R3/R4');
    if (tool.risk !== 'R1' && !tool.mutates) problems.push('risk R3/R4 exige mutates: true');
  }
  if (problems.length) {
    throw new AiToolError('TOOL_SHAPE_INVALID', `tool invalida${tool?.name ? ` (${tool.name})` : ''}: ${problems.join('; ')}`);
  }
  return tool;
}

/** Registry simples de tools (por app), com recorte por specialist. */
export function createToolRegistry(tools = []) {
  const byName = new Map();
  const register = (tool) => {
    assertValidTool(tool);
    if (byName.has(tool.name)) throw new AiToolError('TOOL_DUPLICATE', `tool duplicada: ${tool.name}`);
    byName.set(tool.name, tool);
    return tool;
  };
  for (const t of tools) register(t);
  return {
    register,
    get: (name) => byName.get(name) || null,
    list: () => [...byName.values()],
    forSpecialist: (specialist) => [...byName.values()].filter((t) => !t.specialist || t.specialist === specialist),
  };
}

/**
 * Despacha uma tool aplicando o contrato completo:
 *   authorize → (mutates? dry-run → preview/confirmação) → execute → validar saída.
 *
 * Retorna { status: 'executed'|'preview', output, dryRun } ou lança erro tipado.
 * - R1: executa direto (após authorize).
 * - R3: sem confirmedToolCallId → roda dry-run (se suportado) e retorna 'preview'
 *        com o resultado simulado; com confirmação → executa real.
 * - R4: SEMPRE exige confirmedToolCallId (dry-run antes, se suportado).
 */
export async function dispatchTool(tool, rawInput, ctx) {
  assertValidTool(tool);
  const input = parseWith(tool.inputSchema, rawInput, tool.name, 'input');

  const auth = await tool.authorize({ ...ctx, dryRun: false });
  if (!auth || auth.allowed !== true) {
    throw new AiToolDeniedError(tool.name, auth?.reason);
  }

  const confirmed = Boolean(ctx?.confirmedToolCallId);

  if (tool.mutates && !confirmed) {
    if (tool.supportsDryRun) {
      const preview = await tool.execute(input, { ...ctx, dryRun: true });
      return { status: 'preview', dryRun: true, output: parseWith(tool.outputSchema, preview, tool.name, 'output') };
    }
    throw new AiToolConfirmationRequiredError(tool.name, null);
  }

  if (tool.risk === 'R4' && !confirmed) {
    throw new AiToolConfirmationRequiredError(tool.name, null);
  }

  const output = await tool.execute(input, { ...ctx, dryRun: false });
  return { status: 'executed', dryRun: false, output: parseWith(tool.outputSchema, output, tool.name, 'output') };
}
