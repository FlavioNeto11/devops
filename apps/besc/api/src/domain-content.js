// Enums canonicos do CONTEUDO do portal (biblioteca institucional + jurisprudencia).
// Mantido SEPARADO de domain.js para que o motor de derivacoes de caso (pendencias/
// status/risco/relatorios) permaneca intocado. Estes enums fluem pelo /meta.contentEnums
// e alimentam facetas/filtros e rotulos no frontend (via useLabel).

export const CONTENT_ENUMS = {
  // tipos de item da biblioteca institucional
  // Curadoria 2026-07-10 (docs/evolution/11-curadoria-conteudo.md): kinds `custos` e
  // `comunicado_bacen` removidos junto com todos os seus itens; `atualizacao_monetaria`
  // criado para laudos/modelos de atualização (antes classificados como `modelo`).
  library_kind: {
    fundamento: 'Fundamento / proposta de valor',
    historia: 'Histórico da incorporação',
    base_legal: 'Base legal / parecer',
    modelo: 'Modelo de petição',
    atualizacao_monetaria: 'Atualização monetária (laudos e modelos)',
    laudo: 'Laudo pericial',
    video: 'Vídeo explicativo',
    outro: 'Outro',
  },
  // tribunais / orgaos observados no acervo
  tribunal: {
    STJ: 'STJ', STF: 'STF',
    TJSP: 'TJSP', TJSC: 'TJSC', TJGO: 'TJGO', TJMT: 'TJMT', TJRS: 'TJRS',
    TJPB: 'TJPB', TJBA: 'TJBA', TJAM: 'TJAM', TJDF: 'TJDFT', TJRJ: 'TJRJ',
    TJPR: 'TJPR', TJMG: 'TJMG',
    TRF3: 'TRF3', TRF4: 'TRF4',
    CNJ: 'CNJ (normativo)',
    outro: 'Outro / não identificado',
  },
  instancia: {
    primeira: '1ª instância (sentença/decisão)',
    segunda: '2ª instância (TJ/TRF)',
    superior_STJ: 'Superior (STJ)',
    STF: 'STF',
    administrativa: 'Administrativa / normativa',
  },
  // natureza do credor / passivo liquidado com as acoes BESC
  creditor_category: {
    banco_do_brasil: 'Banco do Brasil (sub-rogado do BESC)',
    bancos_privados: 'Bancos privados',
    empresas_privadas: 'Empresas privadas',
    caixa_economica: 'Caixa Econômica Federal',
    tributos_federais: 'Tributos federais / União',
    tributos_estaduais: 'Tributos estaduais (ICMS)',
    tributos_municipais: 'Tributos municipais',
    outros: 'Outros / geral',
  },
  // mecanismo juridico aplicado na decisao (multi)
  mechanism: {
    compensacao: 'Compensação',
    quitacao: 'Quitação',
    conversao: 'Conversão em numerário',
    dacao_pagamento: 'Dação em pagamento',
    substituicao_penhora: 'Substituição de penhora',
    caucao: 'Caução / garantia',
    penhora: 'Penhora',
  },
  // resultado da decisao para a tese das acoes BESC
  outcome: {
    favoravel: 'Favorável',
    parcial: 'Parcialmente favorável',
    desfavoravel: 'Desfavorável',
    indefinido: 'Indefinido / a classificar',
  },
};

// Rotulos de categoria para agrupamento no frontend (paralelo aos *_CATEGORY_LABELS de domain.js)
export const CONTENT_CATEGORY_LABELS = {
  libraryKind: CONTENT_ENUMS.library_kind,
  creditorCategory: CONTENT_ENUMS.creditor_category,
};
