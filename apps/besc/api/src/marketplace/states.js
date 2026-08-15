// Maquina de estado JURIDICO do titulo (docs/evolution/04 + ADR-008). 7 estados;
// disponibilidade e derivada (nunca coluna editavel). So o Gestor transiciona, com
// reason + evidencia. Transicao fora da matriz -> 409 (mesmo padrao do guard de status
// do levantamento em server.js).

export const LEGAL_STATUSES = {
  unjudged: 'Não julgado',
  ruled_favorable: 'Julgado favorável',
  ruled_against: 'Julgado desfavorável',
  under_appeal: 'Em recurso',
  reinstated: 'Reativado',
  defeated: 'Definitivamente negado',
  archived: 'Arquivado',
};

// estados que aceitam NOVAS contratacoes (espelha title_available() no SQL)
export const AVAILABLE_STATES = new Set(['unjudged', 'ruled_favorable', 'reinstated']);

// matriz de transicoes permitidas (from -> [to...])
export const TRANSITIONS = {
  unjudged: ['ruled_favorable', 'ruled_against', 'archived'],
  ruled_favorable: ['ruled_against', 'archived'],
  ruled_against: ['under_appeal', 'defeated', 'reinstated'],
  under_appeal: ['reinstated', 'defeated'],
  reinstated: ['ruled_against', 'archived'],
  defeated: ['archived'],
  archived: ['unjudged', 'ruled_favorable', 'ruled_against', 'under_appeal', 'reinstated'], // reabertura manual
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

// efeito em cascata da transicao sobre contratos/alugueis/tokens (docs/evolution/04 §E.4)
// -> retorna a acao a executar pela camada de servico.
export function cascadeFor(to) {
  if (to === 'ruled_against' || to === 'under_appeal') return 'suspend';       // congela obrigacoes
  if (to === 'reinstated' || to === 'ruled_favorable' || to === 'unjudged') return 'reactivate';
  if (to === 'defeated') return 'defeat';                                       // dispara resolucao
  if (to === 'archived') return 'freeze_only';
  return 'none';
}
