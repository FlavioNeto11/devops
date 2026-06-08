const AREA_KEYWORDS: Record<string, string[]> = {
  administrativo: ['admin', 'administrativ', 'documento', 'contrato', 'juridico'],
  marketing: ['marketing', 'campanha', 'redes sociais', 'comunicacao', 'mkt'],
  coordenacao: ['coordena', 'escala', 'turma', 'professor', 'treinamento'],
  manutencao: ['manutencao', 'estrutura', 'equipamento', 'chamado', 'reparo', 'obra'],
  lider: ['lider', 'gestao', 'reuniao', 'estrategia', 'diretoria'],
  financeiro: ['financeiro', 'financ', 'pagar', 'receber', 'caixa', 'conta'],
};

export function matchAreaByListName(listName: string): string | null {
  const normalized = listName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const [areaKey, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some((kw) => normalized.includes(kw))) return areaKey;
  }
  return null;
}
