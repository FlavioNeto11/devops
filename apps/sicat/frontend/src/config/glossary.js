/**
 * Glossário central do SICAT — fonte única de LINGUAGEM SIMPLES.
 *
 * O público do app são operadores leigos. Toda sigla/termo técnico tem aqui um
 * NOME SIMPLES (`simple`), uma EXPLICAÇÃO curta em linguagem comum (`explain`) e,
 * quando ajuda, um EXEMPLO (`example`). Labels de navegação, títulos e o
 * componente `SicatHelpHint` ("O que é isto?") consomem este mapa — assim a
 * linguagem fica consistente e fácil de manter num lugar só.
 *
 * Entrada: { term, simple, explain, example? }
 *  - term:    o nome técnico/oficial (ex.: "MTR" / "Manifesto de Transporte de Resíduos")
 *  - simple:  o nome do dia a dia, sem jargão (ex.: "Manifesto")
 *  - explain: 1–2 frases que qualquer pessoa entende
 *  - example: opcional, um caso concreto
 */

export const GLOSSARY = {
  // ---- Documentos principais ----
  mtr: {
    term: 'MTR — Manifesto de Transporte de Resíduos',
    simple: 'Manifesto',
    explain: 'É a autorização para transportar o lixo (resíduo) de um lugar para outro. Acompanha a carga durante a viagem.',
    example: 'Levar borra de tinta da fábrica até a empresa que vai tratar.'
  },
  dmr: {
    term: 'DMR — Declaração de Movimentação de Resíduos',
    simple: 'Declaração mensal',
    explain: 'Um resumo, no fim do período, de tudo que foi movimentado. A CETESB usa para conferir o que entrou e saiu.',
    example: 'No fim do mês, a lista de todos os manifestos daquele mês.'
  },
  cdf: {
    term: 'CDF — Certificado de Destinação Final',
    simple: 'Certificado final',
    explain: 'O comprovante de que o resíduo teve o destino correto — foi tratado ou descartado do jeito certo.',
    example: 'A prova de que aquele lixo foi realmente incinerado/aterrado.'
  },
  mtr_provisorio: {
    term: 'MTR Provisório',
    simple: 'Manifesto de emergência',
    explain: 'Um manifesto rápido para quando o transporte precisa sair sem toda a documentação pronta. Regulariza depois.'
  },

  // ---- Quem participa ----
  gerador: {
    term: 'Gerador',
    simple: 'Quem produz o lixo',
    explain: 'A empresa que gerou o resíduo. É de onde a carga sai.'
  },
  transportador: {
    term: 'Transportador',
    simple: 'Quem leva o lixo',
    explain: 'A empresa ou pessoa que transporta o resíduo até o destino.'
  },
  destinador: {
    term: 'Destinador',
    simple: 'Quem recebe e dá o destino',
    explain: 'A empresa que recebe o resíduo e faz o tratamento ou descarte correto.'
  },

  // ---- Campos do manifesto ----
  lote: {
    term: 'Lote',
    simple: 'Quantas cópias criar',
    explain: 'Quantos manifestos iguais você quer criar de uma vez. Use 1 para criar só um.',
    example: 'Se vão sair 3 caminhões iguais hoje, você pode usar 3.'
  },
  expedicao: {
    term: 'Data de expedição',
    simple: 'Dia da saída',
    explain: 'O dia em que a carga sai para transporte.'
  },
  acondicionamento: {
    term: 'Acondicionamento',
    simple: 'Embalagem',
    explain: 'Como o resíduo está embalado para o transporte.',
    example: 'Tambor, bombona, sacos, a granel…'
  },
  classe: {
    term: 'Classe do resíduo',
    simple: 'Grau de perigo',
    explain: 'O quanto o resíduo é perigoso. Classe I = perigoso; Classe II = não perigoso.',
    example: 'Solvente é Classe I; entulho comum costuma ser Classe II.'
  },
  estado_fisico: {
    term: 'Estado físico',
    simple: 'Sólido, líquido ou pastoso',
    explain: 'A forma do resíduo: sólido, líquido ou pastoso.'
  },
  tratamento: {
    term: 'Tratamento / destino',
    simple: 'O que será feito com o lixo',
    explain: 'O que o destino vai fazer com o resíduo.',
    example: 'Incineração, aterro, reciclagem, coprocessamento…'
  },
  cadri: {
    term: 'CADRI',
    simple: 'Licença para resíduo perigoso',
    explain: 'Uma autorização da CETESB exigida para certos resíduos perigosos. Marque se o seu resíduo precisa dela.'
  },
  quantidade: {
    term: 'Quantidade',
    simple: 'Quanto está sendo levado',
    explain: 'A quantidade do resíduo na unidade escolhida (litros, peças, m³…).'
  },
  peso: {
    term: 'Peso',
    simple: 'Peso em toneladas',
    explain: 'O peso total da carga, em toneladas.'
  },

  // ---- Acesso / contas ----
  cnpj_cpf: {
    term: 'CNPJ ou CPF',
    simple: 'O número da empresa ou o seu',
    explain: 'O número da sua empresa (CNPJ, 14 dígitos) ou o seu número de pessoa (CPF, 11 dígitos). Pode digitar só os números.'
  },
  conta_cetesb: {
    term: 'Conta da CETESB (SIGOR)',
    simple: 'Seu acesso ao site da CETESB',
    explain: 'O mesmo login e senha que você usa no site da CETESB (SIGOR). O SICAT usa essa conta para enviar o MTR no seu lugar.'
  },
  senha_cetesb: {
    term: 'Senha da CETESB',
    simple: 'A senha do site da CETESB',
    explain: 'A senha que você usa para entrar no site da CETESB — não é a senha do SICAT.'
  },
  partner_code: {
    term: 'Código do parceiro',
    simple: 'Um número que a CETESB te deu',
    explain: 'Um número que identifica sua empresa na CETESB. O SICAT busca esse número automaticamente pelo seu CNPJ/CPF.'
  },
  sicat: {
    term: 'SICAT',
    simple: 'Este sistema',
    explain: 'O sistema que você está usando agora. Ele facilita criar e enviar os documentos da CETESB por você.'
  },

  // ---- Transporte (DL-103, programa "SICAT Transporte") ----
  ciot: {
    term: 'CIOT — Conhecimento de Informações de Transporte Rodoviário',
    simple: 'Registro do frete no órgão',
    explain: 'Um número emitido antes da viagem, provando que o frete e a forma de pagamento do transportador autônomo foram registrados corretamente.',
    example: 'Vinculado ao motorista e à placa antes de sair para a estrada.'
  },
  mdfe: {
    term: 'MDF-e — Manifesto Eletrônico de Documentos Fiscais',
    simple: 'Manifesto de carga (documento fiscal)',
    explain: 'Reúne as notas fiscais e os conhecimentos de transporte de uma viagem em um único documento eletrônico.'
  },
  cte: {
    term: 'CT-e — Conhecimento de Transporte Eletrônico',
    simple: 'Nota fiscal do frete',
    explain: 'O documento fiscal que comprova a prestação do serviço de transporte da carga.'
  },
  rntrc: {
    term: 'RNTRC — Registro Nacional de Transportadores Rodoviários de Cargas',
    simple: 'Registro do transportador na ANTT',
    explain: 'Cadastro obrigatório na ANTT para transportar carga de terceiros por rodovia.'
  },
  vpo: {
    term: 'VPO — Vale-Pedágio Obrigatório',
    simple: 'Pedágio pago à parte do frete',
    explain: 'O valor do pedágio da viagem, pago separado do frete — nunca somado a ele.'
  },
  piso_minimo_frete: {
    term: 'Piso mínimo de frete',
    simple: 'Valor mínimo que pode ser pago pelo frete',
    explain: 'O valor abaixo do qual a lei não permite contratar o transporte, para proteger o transportador autônomo.'
  },
  pgr: {
    term: 'PGR — Programa de Gerenciamento de Risco',
    simple: 'Plano de segurança para cargas perigosas',
    explain: 'Documento que descreve como prevenir e responder a acidentes no transporte de produtos perigosos.'
  },
  rctr_c: {
    term: 'RCTR-C — Seguro de Responsabilidade do Transportador Rodoviário de Carga',
    simple: 'Seguro da carga transportada',
    explain: 'Cobre danos à carga durante o transporte rodoviário.'
  },
  rc_dc: {
    term: 'RC-DC — Seguro de Responsabilidade Civil do Destinatário da Carga',
    simple: 'Seguro de carga perigosa',
    explain: 'Cobre danos causados por acidentes com produtos perigosos durante o transporte.'
  },
  rc_v: {
    term: 'RC-V — Seguro de Responsabilidade Civil do Transportador (Veículo)',
    simple: 'Seguro de danos a terceiros',
    explain: 'Cobre danos causados a terceiros pelo veículo durante o transporte da carga.'
  }
};

/** Retorna a entrada do glossário (ou null). */
export function getGlossaryTerm(key) {
  return GLOSSARY[key] || null;
}

/** Nome simples do termo (cai no termo técnico se não houver). */
export function simpleName(key) {
  const t = GLOSSARY[key];
  return t ? t.simple || t.term : key;
}

/** Texto pronto "Nome simples (SIGLA)" para labels de navegação/títulos. */
export function labelWithAcronym(key, acronym) {
  const t = GLOSSARY[key];
  const base = t ? t.simple : key;
  return acronym ? `${base} (${acronym})` : base;
}
