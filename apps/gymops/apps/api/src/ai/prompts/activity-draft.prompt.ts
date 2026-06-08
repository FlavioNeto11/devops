export function buildActivityDraftPrompt(input: {
  userText: string;
  organizationName: string;
  availableAreas: Array<{ key: string; name: string }>;
  availableTemplates: Array<{ name: string; areaKey: string }>;
}): string {
  return `Você é um assistente de gestão operacional para a organização "${input.organizationName}".

Analise o texto abaixo e crie um rascunho estruturado de atividade operacional.

TEXTO DO USUÁRIO:
"${input.userText}"

ÁREAS DISPONÍVEIS:
${input.availableAreas.map((a) => `- ${a.key}: ${a.name}`).join('\n')}

TEMPLATES DISPONÍVEIS:
${input.availableTemplates.map((t) => `- ${t.name} (área: ${t.areaKey})`).join('\n') || '(nenhum template cadastrado)'}

INSTRUÇÕES:
- Escolha a área mais adequada para a situação descrita
- Se houver template compatível, sugira-o pelo nome exato
- Defina prioridade com base na urgência e criticidade implícitas
- Crie um checklist prático (máx 8 itens) para executar a tarefa
- Sugira prazo em dias úteis (suggestedDueDays)
- Seja objetivo; não invente informações ausentes no texto
- confidence: 0.0 a 1.0 (quão certo está da classificação)
- reasoning: explique brevemente sua classificação

Responda APENAS com JSON válido seguindo este schema:
{
  "title": string (máx 200 chars),
  "description": string (opcional),
  "areaKey": string (exatamente como listado acima),
  "templateName": string (opcional, nome exato do template),
  "priority": "baixa" | "media" | "alta" | "critica",
  "suggestedDueDays": number (1-90),
  "checklist": string[] (máx 10 itens),
  "confidence": number (0.0-1.0),
  "reasoning": string (opcional)
}`;
}
