// Glossario canonico do processo BESC. Fonte unica de verdade — servido por
// GET /glossary e exposto em /meta.reference.glossary. Definicoes concisas e fieis
// ao dominio (ver documentos institucionais). pt-BR na prosa, chaves em ingles.
export const GLOSSARY = [
  { id: 'gl_besc', term: 'BESC', definition: 'Banco do Estado de Santa Catarina, incorporado pelo Banco do Brasil (autorização do BACEN, 2008). Suas ações não são mais negociadas em mercado e hoje são utilizadas apenas na esfera judicial.', seeAlso: ['incorporacao', 'bescval'] },
  { id: 'gl_bescval', term: 'Bescval', definition: 'Besc Distribuidora de Títulos e Valores Mobiliários S.A., incorporada pelo Banco do Brasil (homologação BACEN em 2021); frações remanescentes foram leiloadas na B3.', seeAlso: ['besc', 'incorporacao'] },
  { id: 'gl_incorporacao', term: 'Incorporação', definition: 'Absorção do BESC (e da Bescval) pelo Banco do Brasil, por deliberação da União (acionista majoritária). O BB sucedeu o BESC em direitos e obrigações.', seeAlso: ['sub_rogacao', 'age'] },
  { id: 'gl_sub_rogacao', term: 'Sub-rogação', definition: 'Transferência ao Banco do Brasil das obrigações do antigo BESC ao incorporá-lo; a responsabilidade passou a ser compartilhada com a União.', seeAlso: ['incorporacao', 'menor_onerosidade'] },
  { id: 'gl_dacao_pagamento', term: 'Dação em pagamento', definition: 'Extinção de uma dívida entregando ao credor bem ou direito diferente de dinheiro (aqui, as ações/direitos BESC), com aceite do credor.', seeAlso: ['compensacao', 'quitacao'] },
  { id: 'gl_caucao', term: 'Caução', definition: 'Garantia (bem ou direito) vinculada a um juízo para assegurar uma obrigação; direitos ilíquidos tendem a ser recusados como caução.', seeAlso: ['substituicao_penhora', 'menor_onerosidade'] },
  { id: 'gl_substituicao_penhora', term: 'Substituição de penhora', definition: 'Troca do bem penhorado por outro oferecido pelo devedor; as ações BESC ocupam o 2º grau na hierarquia de penhora do CPC.', seeAlso: ['caucao', 'menor_onerosidade'] },
  { id: 'gl_compensacao', term: 'Compensação', definition: 'Encontro de contas: extinção recíproca de dívida e crédito até o valor coincidente, quando credor e devedor são a mesma relação.', seeAlso: ['quitacao', 'conversao'] },
  { id: 'gl_quitacao', term: 'Quitação', definition: 'Reconhecimento formal de que uma obrigação foi satisfeita/extinta.', seeAlso: ['compensacao', 'homologacao'] },
  { id: 'gl_conversao', term: 'Conversão (em numerário)', definition: 'Transformar o direito/ação em valor monetário equivalente para liquidar a obrigação.', seeAlso: ['compensacao'] },
  { id: 'gl_cartula', term: 'Cártula', definition: 'O certificado/título físico da ação; objeto da perícia de autenticidade.', seeAlso: ['escriturador', 'pericia'] },
  { id: 'gl_escriturador', term: 'Escriturador', definition: 'Instituição que mantinha o registro escritural das ações; fonte primária de titularidade e posição acionária.', seeAlso: ['cartula'] },
  { id: 'gl_age', term: 'AGE (Assembleia Geral Extraordinária)', definition: 'Assembleia societária que deliberou a conversão/incorporação; o valor de conversão fixado pela AGE do BB foi rejeitado por parte dos acionistas.', seeAlso: ['incorporacao', 'agio'] },
  { id: 'gl_pnd', term: 'PND', definition: 'Plano Nacional de Desestatização; em 2008 o BESC e o BESCRI foram excluídos do PND para viabilizar a incorporação pelo Banco do Brasil.', seeAlso: ['incorporacao'] },
  { id: 'gl_transito', term: 'Trânsito em julgado', definition: 'Momento em que a decisão judicial não admite mais recurso; torna o direito certo e exigível.', seeAlso: ['homologacao'] },
  { id: 'gl_pericia', term: 'Perícia', definition: 'Exame técnico da autenticidade da cártula e da atualização do valor desde a aquisição; produz o laudo pericial.', seeAlso: ['cartula', 'atualizacao_monetaria'] },
  { id: 'gl_atualizacao_monetaria', term: 'Atualização monetária', definition: 'Correção do valor pago na aquisição até o presente, com base na data e no preço de aquisição (não no valor de conversão da AGE do BB, que foi rejeitado); gera o ágio.', seeAlso: ['agio', 'pericia'] },
  { id: 'gl_agio', term: 'Ágio', definition: 'Diferença (expressiva, no caso BESC) entre o valor atualizado apurado na perícia e o valor originalmente pago/reconhecido.', seeAlso: ['atualizacao_monetaria'] },
  { id: 'gl_homologacao', term: 'Homologação', definition: 'Chancela judicial que dá eficácia a um acordo/quitação/compensação, encerrando a etapa judicial.', seeAlso: ['transito', 'quitacao'] },
  { id: 'gl_menor_onerosidade', term: 'Menor onerosidade (CPC art. 805)', definition: 'Princípio de que a execução se faça pelo modo menos gravoso ao devedor; base para oferecer as ações como garantia/pagamento.', seeAlso: ['caucao', 'substituicao_penhora'] },
  { id: 'gl_fidc', term: 'FIDC', definition: 'Fundo de Investimento em Direitos Creditórios — veículo típico para estruturar o lastro creditório numa eventual tokenização.', seeAlso: ['tokenizacao'] },
  { id: 'gl_vasp', term: 'VASP / BCB', definition: 'Prestador de Serviços de Ativos Virtuais sob o Marco Legal de Ativos Virtuais e a competência do Banco Central; relevante ao enquadrar um token.', seeAlso: ['tokenizacao'] },
  { id: 'gl_cvm40', term: 'CVM — Parecer de Orientação 40', definition: 'Entendimento da CVM sobre quando cripto/tokens são valores mobiliários e atraem sua regulação de oferta/registro.', seeAlso: ['fidc', 'tokenizacao'] },
  { id: 'gl_tokenizacao', term: 'Tokenização', definition: 'Representação de um ativo/direito por tokens em registro distribuído; aqui é o objetivo futuro, para o qual esta plataforma organiza a base documental.', seeAlso: ['fidc', 'cvm40', 'vasp'] },
];
