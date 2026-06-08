export interface DelayAnalysisInput {
  activityTitle: string;
  areaName: string;
  priority: string;
  daysOverdue: number;
  daysSinceLastUpdate: number;
  checklistProgress: { done: number; total: number };
  recentCommentCount: number;
  hasAttachments: boolean;
}

export function buildDelayAnalysisPrompt(input: DelayAnalysisInput): string {
  const checklistText = input.checklistProgress.total > 0
    ? `${input.checklistProgress.done}/${input.checklistProgress.total} itens concluídos`
    : 'sem checklist';

  return `Você é um assistente de gestão operacional.

Analise o contexto de atraso da seguinte atividade:

ATIVIDADE: "${input.activityTitle}"
ÁREA: ${input.areaName}
PRIORIDADE: ${input.priority}
DIAS EM ATRASO: ${input.daysOverdue}
DIAS SEM ATUALIZAÇÃO: ${input.daysSinceLastUpdate}
CHECKLIST: ${checklistText}
COMENTÁRIOS RECENTES: ${input.recentCommentCount}
ANEXOS: ${input.hasAttachments ? 'sim' : 'não'}

INSTRUÇÕES:
- summary: explicação concisa do contexto de risco (máx 300 chars)
- riskLevel: "low" | "medium" | "high" | "critical"
- possibleReasons: até 4 hipóteses para o atraso (baseadas apenas nos dados acima)
- suggestedActions: até 4 ações concretas para desbloqueio
- Não invente informações; fundamente-se apenas nos dados fornecidos

Responda APENAS com JSON válido:
{
  "summary": string,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "possibleReasons": string[],
  "suggestedActions": string[]
}`;
}
