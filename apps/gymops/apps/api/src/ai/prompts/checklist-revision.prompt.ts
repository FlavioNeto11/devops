export function buildChecklistRevisionPrompt(input: {
  activityTitle: string;
  activityDescription?: string;
  areaName: string;
  checklistTitle: string;
  currentItems: Array<{ id: string; text: string; done: boolean }>;
  instruction: string;
}): string {
  const itemsBlock = input.currentItems
    .map((item) => `- id: ${item.id} | concluído: ${item.done ? 'sim' : 'não'} | texto: "${item.text}"`)
    .join('\n');

  return `Você é um GESTOR OPERACIONAL SÊNIOR do GymOps. Revise o checklist EXISTENTE abaixo conforme a instrução do usuário.

ATIVIDADE: "${input.activityTitle}"
${input.activityDescription ? `DESCRIÇÃO: "${input.activityDescription}"` : ''}
ÁREA: ${input.areaName}
CHECKLIST: "${input.checklistTitle}"

ITENS ATUAIS (com ids):
${itemsBlock}

INSTRUÇÃO DO USUÁRIO: "${input.instruction}"

REGRAS:
- Devolva a LISTA COMPLETA revisada, na ordem de execução.
- Item mantido ou com texto ajustado: preserve o MESMO id.
- Item NOVO: não inclua id (omita o campo ou use null).
- Item que a instrução pedir para remover: simplesmente NÃO o inclua na lista.
- NUNCA invente ids; use somente os listados acima.
- Itens já concluídos: evite alterar o texto (mantenha-os como estão), a menos que a instrução peça explicitamente.
- Máximo de 30 itens; textos práticos e específicos (verbos no infinitivo).
- summary: uma frase curta explicando a revisão.

Responda APENAS com JSON válido, em português:
{
  "items": [ { "id": string|null, "text": string } ],
  "summary": string
}`;
}
