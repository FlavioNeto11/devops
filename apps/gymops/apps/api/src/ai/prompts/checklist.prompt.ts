export function buildChecklistPrompt(input: {
  activityTitle: string;
  activityDescription?: string;
  areaName: string;
  templateChecklist?: string[];
}): string {
  const existing = input.templateChecklist?.length
    ? `\nCHECKLIST DO TEMPLATE (já garantido):\n${input.templateChecklist.map((i) => `- ${i}`).join('\n')}`
    : '';

  return `Você é um assistente de gestão operacional.

Sugira itens de checklist para a seguinte atividade:

TÍTULO: "${input.activityTitle}"
${input.activityDescription ? `DESCRIÇÃO: "${input.activityDescription}"` : ''}
ÁREA: ${input.areaName}${existing}

INSTRUÇÕES:
- Sugira itens práticos e acionáveis para executar essa atividade
- Máximo 12 itens
- Se já há checklist de template, sugira apenas itens COMPLEMENTARES
- Marque itens opcionais com optional: true
- rationale: breve explicação de por que o item é importante (opcional)

Responda APENAS com JSON válido:
{
  "items": [
    { "text": string, "rationale": string (opcional), "optional": boolean }
  ]
}`;
}
