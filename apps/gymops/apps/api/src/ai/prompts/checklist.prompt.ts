export function buildChecklistPrompt(input: {
  activityTitle: string;
  activityDescription?: string;
  areaName: string;
  templateChecklist?: string[];
}): string {
  const existing = input.templateChecklist?.length
    ? `\nCHECKLIST DO TEMPLATE (já garantido — NÃO repita estes):\n${input.templateChecklist.map((i) => `- ${i}`).join('\n')}`
    : '';

  return `Você é um GESTOR OPERACIONAL SÊNIOR do GymOps. Gere um checklist DETALHADO e acionável para executar a atividade abaixo, com passos concretos na ordem de execução.

TÍTULO: "${input.activityTitle}"
${input.activityDescription ? `DESCRIÇÃO: "${input.activityDescription}"` : ''}
ÁREA: ${input.areaName}${existing}

INSTRUÇÕES:
- Gere de 6 a 12 itens PRÁTICOS e específicos para esta atividade e área (verbos no infinitivo).
- Estruture cobrindo: preparação/materiais, execução, verificação de qualidade/segurança e registro/encerramento.
- Se já existe checklist de template, gere APENAS itens COMPLEMENTARES (não repita os do template).
- optional: true para itens não obrigatórios; false para essenciais.
- rationale: explicação curta de por que o item importa (opcional).
- Não invente requisitos que contrariem a descrição.

Responda APENAS com JSON válido, em português:
{
  "items": [
    { "text": string, "rationale": string (opcional), "optional": boolean }
  ]
}`;
}
