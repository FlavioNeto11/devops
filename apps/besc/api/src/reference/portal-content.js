// Conteudo institucional estruturado do portal BESC. Fiel aos documentos fornecidos
// (proposta de valor, historico da incorporacao, base legal, mecanismos). Servido em
// /meta.reference e consumido pela Home, pela pagina de Referencia e pelo Roadmap.
// Nao e aconselhamento juridico — organizacao de conhecimento.

// Proposta de valor (fonte: "PORQUE UTILIZAR AS BESCS PARA QUITACAO DE PASSIVOS").
export const VALUE_PROPOSITION = [
  {
    key: 'seguranca',
    title: 'Segurança',
    summary: 'Uso exclusivamente judicial, com perícia de autenticidade e atualização monetária.',
    body: 'As ações do BESC são utilizadas apenas na esfera JUDICIAL, pois não são mais comercializadas em mercado desde que o BACEN autorizou a incorporação do BESC pelo Banco do Brasil. No processo, as ações são periciadas quanto à autenticidade e é feita a análise de sua atualização monetária, com os laudos periciais anexados para averiguação legal.',
  },
  {
    key: 'liquidez',
    title: 'Liquidez',
    summary: 'Reconhecidas por tribunais como idôneas; 2º grau na hierarquia de penhora do CPC.',
    body: 'Muitos tribunais reconhecem as ações do BESC como idôneas, ocupando o 2º grau na hierarquia de penhoras do Código de Processo Civil. A responsabilidade sobre o BESC era da União (99%) antes da incorporação e, após, ficou compartilhada entre Banco do Brasil e União — há documentação de todo o processo de incorporação comprovando essa responsabilidade.',
  },
  {
    key: 'versatilidade',
    title: 'Versatilidade',
    summary: 'Aplicáveis a passivos tributários, bancários e junto a empresas privadas.',
    body: 'As ações do BESC podem ser utilizadas na quitação de passivos TRIBUTÁRIOS, BANCÁRIOS e junto a EMPRESAS PRIVADAS, pela responsabilidade compartilhada entre Banco do Brasil e União. Também são muito usadas para substituição de penhora ou garantia de execuções.',
  },
  {
    key: 'jurisprudencia',
    title: 'Jurisprudência',
    summary: 'Negativa em 1ª instância; consolida-se favoravelmente do 2º grau ao STJ/STF.',
    body: 'Por ser tema ainda pouco difundido, há decisões desfavoráveis em 1ª instância. A jurisprudência positiva cresce a partir da 2ª instância, onde os tribunais já conhecem melhor a matéria, e se consolida na 3ª instância (STJ e STF).',
  },
];

// Linha do tempo da incorporacao (fontes: "INCORPORACAO BESC" + comunicados BACEN/BB).
export const HISTORY_TIMELINE = [
  { date: '2007', title: 'Notícias da incorporação', text: 'Tornou-se pública a intenção de incorporar o BESC pelo Banco do Brasil.' },
  { date: '01/11/2007', title: 'AGE do BESC — grupamento', text: 'Grupamento de 503.932.710.389 ações em lotes de 3 mil, resultando em 167.977.568 ações BESC.' },
  { date: '20/02/2008', title: 'Exclusão do PND', text: 'BESC e BESCRI excluídos do Plano Nacional de Desestatização para viabilizar a incorporação.' },
  { date: '30/09/2008', title: 'Assembleia de aprovação', text: 'Assembleia dos acionistas do Banco do Brasil aprova a incorporação; proporção final apurada em 1/12,133 (BB–BESC).' },
  { date: '2008–2009', title: 'Prazo de conversão/venda', text: 'Acionistas tiveram 30 dias para converter em ações do BB (1/12,133) ou vender por R$ 2,4468/ação.' },
  { date: '30/12/2020', title: 'Bescval — protocolo de incorporação', text: 'Anunciada a incorporação da Bescval (Besc DTVM) pelo Banco do Brasil.' },
  { date: '01/06/2021', title: 'Bescval — homologação BACEN', text: 'BACEN aprova a incorporação da Bescval; BB sucede em todos os direitos e obrigações.' },
  { date: '28/07/2021', title: 'Bescval — leilão das frações', text: 'Frações remanescentes agrupadas e vendidas em leilão na B3; pagamento aos titulares em 13/08/2021.' },
];

// Mecanismos de liquidacao com acoes BESC.
export const MECHANISMS = [
  { key: 'compensacao', title: 'Compensação / Quitação', when: 'Quando o credor é (ou sucede) o próprio BESC — típico contra o Banco do Brasil, sub-rogado. Encontro de contas até o valor coincidente.' },
  { key: 'conversao', title: 'Conversão em numerário', when: 'Transformar o direito/ação em valor equivalente para liquidar a obrigação, via avaliação judicial.' },
  { key: 'dacao_pagamento', title: 'Dação em pagamento', when: 'Entregar as ações/direitos ao credor em lugar de dinheiro, com aceite e homologação — usado contra bancos, empresas e Fazendas.' },
  { key: 'substituicao_penhora', title: 'Substituição de penhora', when: 'Trocar o bem penhorado pelas ações BESC (2º grau na hierarquia do CPC), invocando a menor onerosidade (art. 805).' },
  { key: 'caucao', title: 'Caução / garantia', when: 'Oferecer as ações como garantia em execução ou recurso; sujeita à aceitação do juízo (direitos ilíquidos podem ser recusados).' },
];

// Base legal invocada (organizacional, nao exaustiva).
export const LEGAL_BASIS = [
  { key: 'sub_rogacao', title: 'Sub-rogação (incorporação)', text: 'O Banco do Brasil sucedeu o BESC em direitos e obrigações ao incorporá-lo; a responsabilidade é compartilhada com a União (acionista majoritária à época).' },
  { key: 'menor_onerosidade', title: 'Menor onerosidade — CPC art. 805', text: 'A execução deve fazer-se pelo modo menos gravoso ao devedor; fundamento para oferecer as ações como garantia ou pagamento.' },
  { key: 'hierarquia_penhora', title: 'Hierarquia de penhora (CPC)', text: 'As ações do BESC são reconhecidas por tribunais como idôneas e situam-se no 2º grau da ordem de penhora.' },
  { key: 'pericia', title: 'Perícia e atualização monetária', text: 'A atualização é feita pela data e preço de aquisição da cártula, não pelo valor de conversão da AGE do BB (rejeitado pelos acionistas), o que gera o ágio.' },
];

// Padrao jurisprudencial observado no acervo.
export const JURISPRUDENCE_PATTERN = {
  summary: 'A aceitação das ações do BESC evolui por instância.',
  stages: [
    { instance: '1ª instância', note: 'Predomínio de decisões desfavoráveis — tema ainda pouco difundido.' },
    { instance: '2ª instância (TJ/TRF)', note: 'Jurisprudência positiva cresce; tribunais já conhecem a matéria.' },
    { instance: '3ª instância (STJ/STF)', note: 'Consolidação favorável em temas de compensação, substituição de penhora e quitação.' },
  ],
  disclaimer: 'Panorama organizacional a partir do acervo cadastrado. Cada caso depende de avaliação judicial, comprovação de titularidade e homologação. Requer validação jurídica.',
};
