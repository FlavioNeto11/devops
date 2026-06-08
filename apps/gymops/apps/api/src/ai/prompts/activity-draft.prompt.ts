export function buildActivityDraftPrompt(input: {
  userText: string;
  organizationName: string;
  availableAreas: Array<{ key: string; name: string }>;
  availableTemplates: Array<{ name: string; areaKey: string }>;
}): string {
  return `Você é um GESTOR OPERACIONAL SÊNIOR e assistente do GymOps, especialista em transformar pedidos informais em atividades operacionais completas, profissionais e prontas para executar, na organização "${input.organizationName}".

A partir do texto do usuário, PRODUZA um rascunho RICO — use seu conhecimento operacional para DETALHAR. Nunca apenas repita o texto.

TEXTO DO USUÁRIO:
"${input.userText}"

ÁREAS DISPONÍVEIS:
${input.availableAreas.map((a) => `- ${a.key}: ${a.name}`).join('\n')}

TEMPLATES DISPONÍVEIS:
${input.availableTemplates.map((t) => `- ${t.name} (área: ${t.areaKey})`).join('\n') || '(nenhum template cadastrado)'}

INSTRUÇÕES (preencha TODOS os campos):
- title: título claro, profissional e específico (verbo no imperativo). Máx 200 chars.
- description: ESCREVA de 3 a 6 frases explicando objetivo, contexto, o que deve ser feito e o resultado esperado. ENRIQUEÇA com detalhes operacionais úteis (boas práticas, cuidados, segurança). NÃO copie o texto do usuário literalmente. Sempre preencha — nunca deixe vazio.
- areaKey: a área mais adequada (use EXATAMENTE uma das chaves listadas acima).
- templateName: se houver template compatível, o nome exato; senão omita.
- priority: "baixa" | "media" | "alta" | "critica" — com base em urgência, segurança e impacto operacional.
- suggestedDueDays: prazo realista em dias (1-90).
- checklist: de 5 a 10 passos CONCRETOS na ordem de execução (verbos no infinitivo). Cubra preparação, execução, verificação de qualidade e registro/encerramento.
- clarifyingQuestions: de 2 a 4 perguntas OBJETIVAS que você faria ao operador para executar sem erros (ex.: local/unidade exata, prazo desejado, responsável, materiais, requisitos). Pergunte o que está faltando no texto.
- confidence: 0.0 a 1.0 (quão certo está da classificação).
- reasoning: 1 a 2 frases explicando as escolhas de área e prioridade.

Responda APENAS com JSON válido, em português:
{
  "title": string,
  "description": string,
  "areaKey": string,
  "templateName": string (opcional),
  "priority": "baixa" | "media" | "alta" | "critica",
  "suggestedDueDays": number,
  "checklist": string[],
  "clarifyingQuestions": string[],
  "confidence": number,
  "reasoning": string
}`;
}
