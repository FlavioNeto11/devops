import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { getAiConfig } from './ai-config.js';
import { retrieveKnowledge, buildKnowledgeContextBlock } from './knowledge/conversation-knowledge-service.js';

/**
 * Agente de DIAGNÓSTICO operacional (Fase 3 — loop agêntico multi-step ReAct).
 *
 * Encadeia tools READ-ONLY (list_manifests, list_jobs, get_dashboard_overview,
 * list_cdf_certificates, get_audit_trail, get_operations_overview), raciocinando
 * entre os passos, para produzir um diagnóstico fundamentado + próximos passos.
 *
 * SEGURANÇA: o loop NUNCA executa ações sensíveis/mutações — só leitura. Qualquer
 * tool fora da allow-list é recusada. Há um teto de passos (anti-loop). A execução
 * real das tools é delegada ao dispatcher (mesma plumbing/contexto), via `dispatch`.
 */

type LooseRecord = Record<string, unknown>;

const READ_ONLY_TOOL_NAMES = new Set<string>([
  'list_manifests',
  'list_jobs',
  'get_dashboard_overview',
  'list_cdf_certificates',
  'get_audit_trail',
  'get_operations_overview'
]);

// Definições (formato OpenAI function-tool) que o agente pode chamar no diagnóstico.
const DIAGNOSTIC_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_manifests',
      description: 'Lista os manifestos do contexto atual (status, datas de expedição, indicador de CDF). Use para entender o que existe e em que estado.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filtro de status interno (opcional).' },
          dateFrom: { type: 'string', description: 'Data inicial YYYY-MM-DD (opcional, só se houver período explícito).' },
          dateTo: { type: 'string', description: 'Data final YYYY-MM-DD (opcional).' },
          pageSize: { type: 'number', description: 'Quantidade a listar (ex.: 50).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_jobs',
      description: 'Lista jobs operacionais (fila/erros/DLQ). Use para detectar falhas e reprocessamentos pendentes.',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', description: 'Filtro de status (ex.: ERROR, dlq) — opcional.' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_overview',
      description: 'Panorama operacional (saúde, filas, workers, métricas). Use para o contexto geral.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_cdf_certificates',
      description: 'Lista certificados CDF/CDR já emitidos. Use para saber o que já foi certificado.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

export type DiagnosticDispatch = (toolName: string, toolArgs: LooseRecord) => Promise<unknown>;

export type OperationalDiagnosisResult = {
  answer: string;
  steps: number;
  evidence: Array<{ tool: string; args: LooseRecord; result: unknown }>;
};

function compactToolResult(result: unknown): unknown {
  // Mantém só o essencial para o raciocínio, limitando tamanho do contexto.
  try {
    const text = JSON.stringify(result);
    if (text.length <= 3500) return result;
    return JSON.parse(text.slice(0, 3500));
  } catch {
    return { note: 'resultado nao serializavel' };
  }
}

function today(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Executa o loop de diagnóstico. Retorna o texto do diagnóstico + a trilha de evidências.
 */
export async function runOperationalDiagnosis(input: {
  question: string;
  dispatch: DiagnosticDispatch;
  maxSteps?: number;
}): Promise<OperationalDiagnosisResult> {
  const config = getAiConfig();
  const llm = new ChatOpenAI({
    apiKey: config.openAiApiKey,
    model: config.openAiAgentModel,
    temperature: 0
  }).bindTools(DIAGNOSTIC_TOOLS as unknown as LooseRecord[]);

  const knowledgeBlock = buildKnowledgeContextBlock(await retrieveKnowledge(input.question, { k: 5 }));
  const maxSteps = Math.max(2, Math.min(input.maxSteps ?? 5, 7));

  const messages: Array<AIMessage | HumanMessage | SystemMessage | ToolMessage> = [
    new SystemMessage(
      'Voce e o agente de DIAGNOSTICO operacional do SICAT (MTR/CETESB). ' +
      'Investigue o pedido do usuario consultando as tools de LEITURA disponiveis, uma de cada vez, ' +
      'RACIOCINANDO entre os passos: a cada resultado, decida o proximo dado necessario ou se ja pode concluir. ' +
      'Cruze evidencias (manifestos, status, CDF, jobs/erros) para responder de verdade — nao apenas liste dados. ' +
      'Voce NUNCA executa acoes sensiveis (criar/submeter/cancelar/imprimir/receber/gerar CDF); apenas leitura. ' +
      'Baseie-se SOMENTE nas evidencias retornadas; nao invente numeros, status ou datas. ' +
      `Data operacional atual: ${today()}. ` +
      'Quando tiver evidencia suficiente, PARE de chamar tools e escreva um diagnostico claro em portugues: ' +
      'situacao atual, o que esta pendente/em risco e os proximos passos seguros e concretos. ' +
      (knowledgeBlock ? `\n\n${knowledgeBlock}` : '')
    ),
    new HumanMessage(`Pedido do usuario: ${input.question}`)
  ];

  const evidence: Array<{ tool: string; args: LooseRecord; result: unknown }> = [];
  let steps = 0;

  for (let i = 0; i < maxSteps; i += 1) {
    const aiMessage = await llm.invoke(messages) as AIMessage;
    messages.push(aiMessage);
    const toolCalls = Array.isArray(aiMessage.tool_calls) ? aiMessage.tool_calls : [];
    if (toolCalls.length === 0) {
      break; // o agente concluiu (resposta final)
    }
    steps += 1;

    for (const call of toolCalls) {
      const name = String(call.name || '');
      const toolCallId = String(call.id || `${name}_${i}`);
      const args = (call.args && typeof call.args === 'object' ? call.args : {}) as LooseRecord;

      if (!READ_ONLY_TOOL_NAMES.has(name)) {
        messages.push(new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: 'Tool nao permitida no diagnostico: somente leitura.' })
        }));
        continue;
      }

      let result: unknown;
      try {
        result = await input.dispatch(name, args);
      } catch (error: unknown) {
        result = { error: (error as { message?: string })?.message || 'falha ao consultar' };
      }
      const compact = compactToolResult(result);
      evidence.push({ tool: name, args, result: compact });
      messages.push(new ToolMessage({
        tool_call_id: toolCallId,
        content: JSON.stringify(compact).slice(0, 4000)
      }));
    }
  }

  // Garante uma conclusão textual mesmo que o teto de passos seja atingido.
  const lastMessage = messages[messages.length - 1];
  let answer = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' ? lastMessage.content.trim() : '';
  if (!answer) {
    const closing = await llm.invoke([
      ...messages,
      new HumanMessage('Conclua agora o diagnostico com base nas evidencias coletadas: situacao, pendencias/riscos e proximos passos seguros.')
    ]) as AIMessage;
    answer = typeof closing.content === 'string' ? closing.content.trim() : '';
  }

  return { answer, steps, evidence };
}
