export interface DailySummaryInput {
  unitName: string;
  date: string;
  stats: {
    totalOpen: number;
    newSinceYesterday: number;
    completedYesterday: number;
    overdue: number;
    critical: number;
    dueToday: number;
    byArea: Array<{ areaName: string; open: number; overdue: number }>;
    topOverdue: Array<{ title: string; daysSince: number; areaName: string }>;
  };
}

export function buildDailySummaryPrompt(input: DailySummaryInput): string {
  const { unitName, date, stats } = input;
  const byAreaText = stats.byArea
    .map((a) => `  - ${a.areaName}: ${a.open} abertas, ${a.overdue} atrasadas`)
    .join('\n');
  const topOverdueText = stats.topOverdue.length
    ? stats.topOverdue.map((t) => `  - "${t.title}" (${t.areaName}) — ${t.daysSince} dias em atraso`).join('\n')
    : '  (nenhuma)';

  return `Você é um assistente de gestão operacional para a unidade "${unitName}".

Gere um resumo diário conciso e objetivo para o gestor da unidade.

DATA: ${date}
ESTATÍSTICAS:
- Atividades abertas: ${stats.totalOpen}
- Novas desde ontem: ${stats.newSinceYesterday}
- Concluídas ontem: ${stats.completedYesterday}
- Atrasadas: ${stats.overdue}
- Críticas abertas: ${stats.critical}
- Vencem hoje: ${stats.dueToday}

POR ÁREA:
${byAreaText || '  (sem dados por área)'}

PRINCIPAIS ATRASOS:
${topOverdueText}

INSTRUÇÕES:
- Tom: objetivo e profissional, português brasileiro
- Máximo 200 palavras no summary
- highlights: até 4 pontos de atenção mais importantes
- alertCount: número de itens que exigem ação imediata
- Não repita números exatos em todos os destaques — priorize o mais crítico

Responda APENAS com JSON válido:
{
  "summary": string (máx 600 chars),
  "highlights": string[] (máx 5 itens, frases curtas),
  "alertCount": number
}`;
}
