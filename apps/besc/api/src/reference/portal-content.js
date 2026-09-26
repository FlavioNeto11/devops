// Conteúdo institucional do portal — ADR-010 (Passo 2/3/8).
//
// Duas categorias, nunca misturadas:
//   PLATFORM_FACTS     fatos que a plataforma afirma, cada um com fonte primária (statement() recusa
//                      fato sem sourceRef ou de natureza que não pode ser fato).
//   THIRD_PARTY_CLAIMS o que materiais de terceiros (consultoria/material comercial, petições, laudos
//                      privados) afirmam. Preservado para pesquisa e rastreabilidade; servido só na
//                      Referência, sempre com aviso e com o contraponto da reconciliação.
//
// Base: repo besc, relatorio/02 e docs/reconciliation (01-conflict-matrix, 03-invalidated-
// assumptions, 04-jurisprudence-reassessment). A versão anterior deste arquivo (proposta de valor,
// mecanismos, "30 dias para converter ou vender", "2º grau na hierarquia de penhora") foi
// reclassificada: nada foi apagado do histórico do git.
import { statement, VERIFICATION } from '../recovery/domain/source-claims.js';
import { getOrigin } from '../recovery/domain/asset-origins.js';

// ---------------------------------------------------------------------------
// Posicionamento (Passo 3/8)
// ---------------------------------------------------------------------------
export const POSITIONING = Object.freeze({
  name: 'Plataforma de Pesquisa e Recuperação de Ativos Legados',
  tagline: 'Organizamos a evidência de direitos societários antigos e o caminho para confirmá-los na fonte oficial.',
  principles: Object.freeze([
    'Um documento antigo é evidência histórica. Não é um ativo.',
    'Ações BESC não existem mais: foram convertidas em ações do Banco do Brasil em 11/02/2009.',
    'Quem confirma a titularidade é o escriturador ou o depositário central, não a plataforma.',
    'Laudo privado não prova titularidade nem fixa valor.',
    'Decisão judicial provisória não prova existência, valor nem liquidez de um direito.',
    'Sem confirmação externa, não existe ativo registrado.',
    'A plataforma não oferece investimento, promessa de retorno nem desconto de dívida.',
    'Tokenização e blockchain estão fora do escopo desta fase (ADR-010).',
  ]),
  journey: Object.freeze(['POSSÍVEL DIREITO', 'DIREITO CONFIRMADO', 'ATIVO REGISTRADO']),
});

// ---------------------------------------------------------------------------
// PLATFORM_FACTS — linha do tempo derivada dos eventos societários da origem BESC
// ---------------------------------------------------------------------------
const NATURE_BY_LEVEL = { PRIMARY: 'PRIMARY_CORPORATE_DOCUMENT', SECONDARY: 'PRESS', UNVERIFIED: 'UNKNOWN' };
const STATUTE_EVENTS = new Set(['besc-1990-nominatividade', 'besc-2008-exclusao-pnd']);
const TITLES = {
  'besc-1987-grupamento': 'Grupamento de 1987 (não verificado)',
  'besc-1990-nominatividade': 'Fim das ações ao portador',
  'besc-1999-proes': 'PROES: União assume o controle',
  'besc-2007-grupamento': 'AGE do BESC: grupamento 3.000:1',
  'besc-2008-exclusao-pnd': 'Exclusão do PND',
  'besc-2008-protocolo': 'Protocolo e Justificação de Incorporação',
  'besc-2008-age': 'AGEs aprovam a incorporação',
  'besc-2008-recesso': 'Direito de recesso',
  'besc-2009-aprovacao-bcb': 'Aprovação do Banco Central',
  'besc-2009-conversao': 'Conversão automática em ações do BB',
  'besc-2009-isin-segregado': 'ISINs segregados (aumentos de 2000 e 2002)',
  'besc-2009-fracoes': 'Venda das frações',
  'bescleasing-bescredi-2010': 'BESC Leasing e BESCREDI',
  'bescval-2021': 'Incorporação da Bescval',
  'bbas3-2024-desdobramento': 'Desdobramento de BBAS3',
};
const brDate = (iso) => iso.split('-').reverse().join('/');

function timelineFromOrigin() {
  const besc = getOrigin('BESC');
  return [...besc.corporateEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const nature = STATUTE_EVENTS.has(e.id) ? 'STATUTE' : NATURE_BY_LEVEL[e.verificationLevel] || 'UNKNOWN';
      const s = statement({
        id: e.id,
        text: e.description,
        nature,
        sourceRef: e.verificationLevel === 'PRIMARY' ? e.source : null,
        attributedTo: e.verificationLevel === 'PRIMARY' ? null : e.source,
        warning: e.verificationLevel === 'UNVERIFIED'
          ? 'Citado em material anterior; não localizado em fonte primária. Se confirmado, cautelas anteriores exigem divisor adicional.'
          : e.verificationLevel === 'SECONDARY' ? 'Fonte secundária; conferir no comunicado oficial do emissor.' : null,
      });
      return Object.freeze({ date: brDate(e.date), title: TITLES[e.id] || e.type, verificationLevel: e.verificationLevel, ...s });
    });
}

export const HISTORY_TIMELINE = Object.freeze(timelineFromOrigin());

export const SHARE_CONVERSION = Object.freeze({
  summary: 'Relações de substituição aplicadas automaticamente em 11/02/2009 às posições registradas no escriturador.',
  disclaimer: 'A relação vale para posições registradas. Uma cautela física não é posição: a quantidade e a titularidade atuais só são confirmadas pelo escriturador do Banco do Brasil.',
  sourceRef: 'Protocolo e Justificação de Incorporação 11/09/2008, item 5.2; comunicado BB 06/02/2009',
  verification: VERIFICATION.PLATFORM_VERIFIED_FACT,
  ratios: Object.freeze([
    { from: '1 ação ON do Banco do Brasil', to: '12,13308922 ações ON do BESC' },
    { from: '1 ação ON do Banco do Brasil', to: '12,13308922 ações PNA do BESC' },
    { from: '1 ação ON do Banco do Brasil', to: '12,13308922 ações PNB do BESC' },
    { from: '1 ação ON do Banco do Brasil', to: '1.592,261627 ações ON da BESCRI' },
    { from: '1 ação ON do Banco do Brasil', to: '90.994,324415154 ações ON da Bescval (2021)' },
  ]),
  notes: Object.freeze([
    'Grupamento de 01/11/2007 (3.000:1), anterior à conversão: cautelas emitidas antes dele representam 3.000 vezes menos ações atuais.',
    'Um grupamento em 28/05/1987 é citado em material anterior, mas não foi localizado em fonte primária (não verificado).',
    'Dissidentes podiam exercer recesso de 06/10 a 04/11/2008, a R$ 2,44675527 por ação BESC.',
    'Frações de ações do BB foram vendidas em bolsa em 2009 e o produto rateado; valores de cadastro desatualizado ficaram retidos à disposição.',
    'Em 16/04/2024 as ações do BB foram desdobradas (1 nova para cada existente); fonte secundária.',
  ]),
});

export const LEGAL_BASIS = Object.freeze([
  { key: 'lsa_227', title: 'Lei 6.404/1976, art. 227', ...statement({ id: 'lsa_227', text: 'Na incorporação, a incorporadora sucede a incorporada em todos os direitos e obrigações, e a incorporada se extingue (arts. 219, II e 227).', nature: 'STATUTE', sourceRef: 'Lei 6.404/1976, arts. 219, II e 227' }) },
  { key: 'lsa_35', title: 'Lei 6.404/1976, arts. 34 e 35', ...statement({ id: 'lsa_35', text: 'A propriedade da ação escritural presume-se pelo registro na conta de depósito aberta em nome do acionista nos livros da instituição depositária (escriturador).', nature: 'STATUTE', sourceRef: 'Lei 6.404/1976, arts. 34 e 35' }) },
  { key: 'lsa_137', title: 'Lei 6.404/1976, arts. 136, 137 e 230', ...statement({ id: 'lsa_137', text: 'O acionista dissidente de incorporação tem direito de recesso (reembolso) em prazo decadencial contado da publicação da ata.', nature: 'STATUTE', sourceRef: 'Lei 6.404/1976, arts. 136, 137 e 230' }) },
  { key: 'lei_8021', title: 'Lei 8.021/1990, arts. 4º e 5º', ...statement({ id: 'lei_8021', text: 'Vedou a emissão e a circulação de ações ao portador; as existentes deveriam ser convertidas em nominativas.', nature: 'STATUTE', sourceRef: 'Lei 8.021/1990, arts. 4º e 5º' }) },
  { key: 'lei_4595', title: 'Lei 4.595/1964, arts. 4º e 10', ...statement({ id: 'lei_4595', text: 'Competência do Conselho Monetário Nacional e do Banco Central sobre o Sistema Financeiro Nacional, incluindo a aprovação de incorporações de instituições financeiras.', nature: 'STATUTE', sourceRef: 'Lei 4.595/1964' }) },
  { key: 'decreto_6380', title: 'Decreto 6.380/2008', ...statement({ id: 'decreto_6380', text: 'Excluiu o BESC e a BESCRI do Programa Nacional de Desestatização.', nature: 'STATUTE', sourceRef: 'Decreto 6.380, de 20/02/2008' }) },
  { key: 'lsa_169', title: 'Lei 6.404/1976, art. 169, §3º', ...statement({ id: 'lsa_169', text: 'Frações de ações resultantes de operações societárias podem ser agrupadas e vendidas em bolsa, com rateio do produto aos titulares.', nature: 'STATUTE', sourceRef: 'Lei 6.404/1976, art. 169, §3º' }) },
  { key: 'cc_369', title: 'Código Civil, art. 369', ...statement({ id: 'cc_369', text: 'A compensação só se efetua entre dívidas líquidas, vencidas e de coisas fungíveis.', nature: 'STATUTE', sourceRef: 'Código Civil (Lei 10.406/2002), art. 369' }) },
]);

export const PLATFORM_FACTS = Object.freeze({
  historyTimeline: HISTORY_TIMELINE,
  shareConversion: SHARE_CONVERSION,
  legalBasis: LEGAL_BASIS,
});

// ---------------------------------------------------------------------------
// THIRD_PARTY_CLAIMS — preservado, rotulado, com contraponto. Nunca na Home.
// ---------------------------------------------------------------------------
const RECON = 'repo besc: docs/reconciliation';
const claim = (id, nature, attributedTo, fields, text, rebuttal, rebuttalRef) => Object.freeze({
  ...fields,
  ...statement({ id, text, nature, attributedTo, verification: VERIFICATION.SOURCE_CLAIM }),
  rebuttal,
  rebuttalRef,
});

const MATERIAL = 'material comercial de consultoria ("Por que utilizar as BESCs para quitação de passivos"), acervo da biblioteca';
const PETITIONS = 'petições e laudos privados do acervo';

export const THIRD_PARTY_CLAIMS = Object.freeze({
  warning: 'As afirmações abaixo são de terceiros (material comercial, petições, laudos privados). A plataforma NÃO as endossa. Cada uma traz o contraponto da pesquisa de reconciliação.',
  valueProposition: Object.freeze([
    claim('vp_seguranca', 'COMMERCIAL_MATERIAL', MATERIAL, { key: 'seguranca', title: 'Segurança' },
      'As ações do BESC são usadas apenas na esfera judicial; são periciadas quanto à autenticidade e atualização monetária.',
      'Perícia documental pode atestar a autenticidade do papel. Não prova titularidade atual nem fixa valor: a titularidade é confirmada no escriturador e a relação de troca foi fixada em 2008.',
      `${RECON}/05-valuation-reassessment.md`),
    claim('vp_liquidez', 'COMMERCIAL_MATERIAL', MATERIAL, { key: 'liquidez', title: 'Liquidez' },
      'Tribunais reconhecem as ações do BESC como idôneas, no 2º grau da hierarquia de penhora do CPC; a responsabilidade é compartilhada entre Banco do Brasil e União.',
      'As decisões do acervo que aceitaram cautelas são, em sua maioria, provisórias e sobre garantia do juízo. O TJSC (2025) negou liquidez imediata e o STJ manteve negativa de compensação por iliquidez. Não há "responsabilidade compartilhada com a União": o BB é sucessor universal.',
      `${RECON}/04-jurisprudence-reassessment.md`),
    claim('vp_versatilidade', 'COMMERCIAL_MATERIAL', MATERIAL, { key: 'versatilidade', title: 'Versatilidade' },
      'As ações do BESC podem quitar passivos tributários, bancários e com empresas privadas, e substituir penhoras.',
      'Quitação de tributo com cautela não tem base no CTN (art. 156). Compensação exige dívidas líquidas e fungíveis (CC art. 369). Garantia aceita em cognição sumária não é pagamento.',
      `${RECON}/03-invalidated-assumptions.md`),
    claim('vp_jurisprudencia', 'COMMERCIAL_MATERIAL', MATERIAL, { key: 'jurisprudencia', title: 'Jurisprudência' },
      'A jurisprudência é negativa em 1ª instância e se consolida favoravelmente do 2º grau ao STJ/STF.',
      'Não há precedente do STJ ou do STF que firme tese favorável: os julgados do STJ no acervo não conheceram do mérito (Súmula 7). A maioria das decisões favoráveis é de 1º grau ou provisória.',
      `${RECON}/04-jurisprudence-reassessment.md`),
  ]),
  mechanisms: Object.freeze([
    claim('mec_compensacao', 'PETITION', PETITIONS, { key: 'compensacao', title: 'Compensação / Quitação' },
      'Encontro de contas contra o Banco do Brasil, sub-rogado, até o valor coincidente.',
      'Exige crédito líquido e fungível (CC art. 369). O STJ manteve acórdão que negou a compensação por falta de liquidez.',
      `${RECON}/04-jurisprudence-reassessment.md`),
    claim('mec_conversao', 'PETITION', PETITIONS, { key: 'conversao', title: 'Conversão em numerário' },
      'Transformar a ação em valor equivalente, por avaliação judicial, para liquidar obrigações.',
      'A conversão que existiu foi societária e automática (ações BESC em ações do BB, 11/02/2009). Pleitos de "conversão" hoje são pedidos de regularização da posição no escriturador, não de dinheiro.',
      `${RECON}/03-invalidated-assumptions.md`),
    claim('mec_dacao', 'PETITION', PETITIONS, { key: 'dacao_pagamento', title: 'Dação em pagamento' },
      'Entregar as ações ao credor em lugar de dinheiro, com aceite e homologação.',
      'Dação depende de aceite do credor e de o devedor ter o bem. Sem posição confirmada no escriturador não há o que dar.',
      `${RECON}/03-invalidated-assumptions.md`),
    claim('mec_substituicao', 'PETITION', PETITIONS, { key: 'substituicao_penhora', title: 'Substituição de penhora' },
      'Trocar o bem penhorado pelas ações BESC, 2º grau na hierarquia do CPC, pela menor onerosidade (art. 805).',
      'Cautela não é "ação negociada em bolsa" (CPC art. 835, III) sem posição escritural. A menor onerosidade não obriga o credor a aceitar bem de liquidez não demonstrada.',
      `${RECON}/03-invalidated-assumptions.md`),
    claim('mec_caucao', 'PETITION', PETITIONS, { key: 'caucao', title: 'Caução / garantia' },
      'Oferecer as ações como garantia em execução ou recurso.',
      'Aceitação de caução em cognição sumária decide a garantia do juízo, não valor, existência ou liquidez. Houve liminar favorável revertida pelo colegiado (TJSP, AI 2087469-50.2023).',
      `${RECON}/04-jurisprudence-reassessment.md`),
  ]),
  legalTheses: Object.freeze([
    claim('tese_sub_rogacao', 'PETITION', PETITIONS, { key: 'sub_rogacao', title: 'Responsabilidade compartilhada com a União' },
      'O Banco do Brasil sucedeu o BESC e a responsabilidade é compartilhada com a União, acionista majoritária à época.',
      'A sucessão é do BB, a título universal (Lei 6.404, art. 227). A pesquisa não localizou fonte para responsabilidade da União perante acionistas do BESC.',
      `${RECON}/01-conflict-matrix.md`),
    claim('tese_hierarquia', 'PETITION', PETITIONS, { key: 'hierarquia_penhora', title: 'Hierarquia de penhora' },
      'As ações do BESC situam-se no 2º grau da ordem de penhora e são reconhecidas como idôneas.',
      'Nenhuma decisão do acervo fixa essa posição de forma definitiva. As aceitações são provisórias e caso a caso.',
      `${RECON}/04-jurisprudence-reassessment.md`),
    claim('tese_divida_publica', 'PETITION', PETITIONS, { key: 'divida_publica', title: 'Equiparação a título público' },
      'As ações BESC seriam títulos de dívida pública, equiparados a dinheiro, de notória liquidez.',
      'O BESC era sociedade anônima de economia mista (CVM 1104). Ação não é título de dívida pública. Cartilha conjunta STN/RFB/PGFN/MPF alerta contra essa oferta.',
      `${RECON}/03-invalidated-assumptions.md`),
    claim('tese_pericia_agio', 'PRIVATE_APPRAISAL', 'laudos privados de atualização monetária do acervo', { key: 'pericia', title: 'Perícia, atualização e ágio' },
      'A atualização deve ser feita pela data e preço de aquisição da cártula, não pelo valor da AGE do BB, o que gera o ágio.',
      'Laudo privado é alegação de parte. A relação de troca e o reembolso de recesso foram fixados em 2008; atualizar o preço de compra de uma cautela não cria valor de mercado nem direito reconhecido.',
      `${RECON}/05-valuation-reassessment.md`),
  ]),
  jurisprudencePattern: Object.freeze({
    ...statement({ id: 'jur_pattern', text: 'A aceitação das ações do BESC evolui por instância: desfavorável no 1º grau, crescente no 2º grau e consolidada no STJ/STF.', nature: 'COMMERCIAL_MATERIAL', attributedTo: MATERIAL, verification: VERIFICATION.SOURCE_CLAIM }),
    rebuttal: 'A reavaliação das 99 decisões do acervo não confirma o padrão. Cerca de 79 são decisões com dispositivo; a maioria é provisória. Nenhuma tem trânsito verificado por certidão. O STJ não firmou tese.',
    rebuttalRef: `${RECON}/04-jurisprudence-reassessment.md`,
  }),
});
