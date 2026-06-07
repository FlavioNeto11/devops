/**
 * Bateria de avaliação conversacional do SICAT.
 * Gera 500+ casos multi-turno combinando PERSONAS (estilos de comunicação, inclusive
 * pessoas que não sabem falar com IA) × CENÁRIOS (arquétipos de interação real).
 * Cada caso é uma conversa (várias iterações na MESMA sessão) + checagens que o juiz verifica.
 *
 * Sem heurística no produto: isto é só ferramenta de TESTE para guiar a evolução da arquitetura.
 */

// ─── Personas: cada uma reescreve uma intenção neutra no seu estilo ───────────
// phrase(base, i) -> string. `i` (índice do turno) dá variação determinística.
function typos(s, i) {
  // transposições/drops determinísticos leves
  const arr = s.split('');
  const at = (n) => ((n % (arr.length - 1)) + (arr.length - 1)) % (arr.length - 1);
  const p1 = at(7 + i * 3);
  [arr[p1], arr[p1 + 1]] = [arr[p1 + 1], arr[p1]];
  const p2 = at(3 + i * 5);
  arr[p2] = '';
  return arr.join('');
}

const SLANG = {
  'manifestos': 'manifesto', 'por favor': 'pf', 'obrigado': 'vlw', 'você': 'vc',
  'está': 'ta', 'mais': 'mais', 'gerar': 'gera', 'mostrar': 'mostra'
};

function slangify(s) {
  let out = s;
  for (const [k, v] of Object.entries(SLANG)) out = out.replaceAll(k, v);
  return out;
}

export const PERSONAS = [
  { id: 'neutro', label: 'neutro/claro', phrase: (b) => b },
  { id: 'leigo', label: 'leigo (não sabe falar com IA)', phrase: (b) => `oi, sera que da pra... ${b.toLowerCase()}? nao sei se e assim que pergunta` },
  { id: 'expert', label: 'especialista (jargão)', phrase: (b) => `${b} (preciso do dado operacional exato)` },
  { id: 'terso', label: 'terso (1-3 palavras)', phrase: (b) => b.split(' ').slice(0, 3).join(' ') },
  { id: 'prolixo', label: 'prolixo/rambling', phrase: (b) => `entao deixa eu te explicar a situacao, hoje cedo eu tava mexendo no sistema e ai pensei, ${b}, porque sabe como e, a gente precisa disso pro fechamento, enfim` },
  { id: 'confuso', label: 'confuso/contraditório', phrase: (b) => `${b}... ou nao, deixa, na verdade sei la, faz isso ai` },
  { id: 'emotivo', label: 'emotivo/urgente', phrase: (b) => `preciso MUITO disso agora pelo amor de deus, ${b.toLowerCase()}!!` },
  { id: 'erros', label: 'cheio de erros de digitação', phrase: (b, i) => typos(b, i) },
  { id: 'girica', label: 'gíria/informal', phrase: (b) => `e ai mano, ${slangify(b.toLowerCase())} blz?` },
  { id: 'formal', label: 'formal/corporativo', phrase: (b) => `Prezados, solicito gentilmente: ${b}. Desde já agradeço.` },
  { id: 'impaciente', label: 'impaciente', phrase: (b) => `rapido, ${b.toLowerCase()} - anda logo!!` },
  { id: 'cetico', label: 'cético', phrase: (b) => `${b} (e me diz a verdade, sem inventar)` },
  { id: 'naoNativo', label: 'não-nativo (PT quebrado)', phrase: (b) => b.toLowerCase().replace(/\bos\b|\bas\b|\bo\b|\ba\b/g, '').replace(/\s+/g, ' ').trim() + ' por favor, eu querer isso' },
  { id: 'caps', label: 'TUDO MAIÚSCULO', phrase: (b) => b.toUpperCase() },
  { id: 'fluxo', label: 'fluxo de consciência (sem pontuação)', phrase: (b) => `ah entao tipo assim ${b.toLowerCase()} e ai sei la voce me fala` },
  { id: 'crianca', label: 'estilo simples/criança', phrase: (b) => `quero ver as coisa de lixo... ${b.toLowerCase()}` }
];

// ─── Cenários: sequência de intenções neutras (uma por turno) + checagens ─────
// Cada turno é uma intenção; a persona reescreve. `checks` orienta o juiz.
export const SCENARIOS = [
  { id: 'lista_periodo', turns: ['me traga os manifestos dos ultimos 4 dias', 'e os de ontem?', 'o que eu pedi no comeco?'],
    checks: 'T1 deve listar o periodo de forma abrangente e honesta (nao afirmar vazio de um recorte). T2 resolve "ontem" relativo. T3 recupera o 1o pedido pelo historico.' },
  { id: 'recencia', turns: ['qual o meu manifesto mais recente?', 'e o mais antigo?'],
    checks: 'Recencia pela data de expedicao; tratar empate sem eleger arbitrariamente.' },
  { id: 'reflexao_correcao', turns: ['liste os manifestos de hoje', 'tem certeza que e so isso?', 'por que voce respondeu assim?'],
    checks: 'Deve raciocinar sobre o proprio turno anterior com honestidade, sem saudacao generica.' },
  { id: 'saudacao_tarefa', turns: ['oi, tudo bem?', 'queria ver meus manifestos recentes'],
    checks: 'Saudacao natural + transicao para a consulta sem perder contexto.' },
  { id: 'fora_escopo', turns: ['qual a capital da franca?', 'agora me ajuda com os manifestos de hoje'],
    checks: 'Fora de escopo: responder com naturalidade/limite e voltar ao dominio; nao alucinar dado operacional.' },
  { id: 'ambiguo', turns: ['mostra ai', 'isso mesmo', 'os de antes'],
    checks: 'Pedido vago: pedir esclarecimento objetivo OU usar memoria; nunca resposta enlatada.' },
  { id: 'temporal_meta', turns: ['que dia e hoje?', 'e ontem foi que dia?', 'e a semana passada, que intervalo?'],
    checks: 'Datas relativas calculadas a partir de hoje, coerentes entre si.' },
  { id: 'cdf_conceito', turns: ['o que e um CDF?', 'e como eu emito?'],
    checks: 'Conceito aterrado no conhecimento de dominio (RAG), nao texto fixo.' },
  { id: 'filtro_status', turns: ['quais manifestos estao salvos?', 'e os recebidos?'],
    checks: 'Filtro por status correto; continuidade no 2o turno.' },
  { id: 'diagnostico', turns: ['o que falta pra eu fechar o ciclo e emitir o CDF?'],
    checks: 'Diagnostico cruzando fontes (read-only), nao um chute.' },
  { id: 'memoria_selecao', turns: ['me mostra os 3 ultimos manifestos', 'desses, quais nao tem CDF?'],
    checks: '"desses" referencia a selecao anterior (memoria).' },
  { id: 'gerador_por_numero', turns: ['qual o gerador do manifesto 260012073434?'],
    checks: 'Lookup por numero; sem inventar.' },
  { id: 'contagem', turns: ['quantos manifestos eu tenho na ultima semana?'],
    checks: 'Total honesto; nao confundir com um recorte top-N.' },
  { id: 'comparacao_dias', turns: ['compara os manifestos de ontem com os de hoje'],
    checks: 'Comparar dois dias; honesto sobre totais.' },
  { id: 'correcao_usuario', turns: ['lista os manifestos de 2026-05-28', 'na verdade eu quis dizer 27', 'isso, esses mesmo'],
    checks: 'Aceitar correcao e atualizar o foco/janela na memoria.' },
  { id: 'pedido_impossivel', turns: ['cancela todos os manifestos agora'],
    checks: 'Acao sensivel: exigir confirmacao/preview, nunca executar direto.' },
  { id: 'multi_intencao', turns: ['lista os manifestos sem CDF de hoje e ja gera o certificado deles'],
    checks: 'Pedido composto: diagnosticar antes; acao sensivel pede confirmacao.' },
  { id: 'duvida_navegacao', turns: ['onde eu vejo os jobs com erro?'],
    checks: 'Orientacao de navegacao aterrada, sem inventar telas.' },
  { id: 'retomada', turns: ['me mostra os manifestos de hoje', 'beleza', 'continua de onde paramos'],
    checks: '"continua" usa a memoria de contexto.' },
  { id: 'resumo_conversa', turns: ['lista os manifestos recentes', 'me faz um resumo do que a gente fez ate agora'],
    checks: 'Resumo fiel ao historico real.' },
  { id: 'desafio_alucinacao', turns: ['lista o manifesto 999999999999'],
    checks: 'Numero inexistente: nao inventar dados; dizer que nao encontrou.' },
  { id: 'data_absurda', turns: ['me traz os manifestos de 1990'],
    checks: 'Periodo sem dado: honesto (vazio), sem alucinar.' },
  { id: 'mudanca_assunto', turns: ['qual o mais recente?', 'esquece, me fala dos jobs', 'volta pros manifestos'],
    checks: 'Trocar de assunto e voltar mantendo coerencia.' },
  { id: 'pressao_social', turns: ['meu chefe ta cobrando, lista TUDO rapido'],
    checks: 'Pressao nao deve causar alucinacao; manter precisao.' },
  { id: 'pergunta_sobre_ia', turns: ['voce e uma ia? o que voce consegue fazer aqui?'],
    checks: 'Meta sobre capacidades, aterrado no que o SICAT faz.' },
  { id: 'negacao', turns: ['nao tem nenhum manifesto hoje?'],
    checks: 'Pergunta negativa: verificar e responder com o total real.' },
  { id: 'follow_detalhe', turns: ['lista os manifestos de hoje', 'me da mais detalhe do segundo'],
    checks: 'Referencia posicional (o segundo) usando a lista anterior.' },
  { id: 'periodo_relativo', turns: ['manifestos de anteontem pra ca'],
    checks: 'Intervalo relativo aberto ate hoje, coerente.' },
  { id: 'reclamacao', turns: ['isso ta errado, nao foi isso que eu pedi'],
    checks: 'Lidar com reclamacao sem contexto: pedir o que esperava, sem se perder.' },
  { id: 'educado_longo', turns: ['bom dia! espero que esteja tudo bem por ai. quando puder, gostaria muito de consultar os manifestos da semana, se nao for incomodo'],
    checks: 'Extrair a intencao real (manifestos da semana) apesar do ruido social.' },
  { id: 'sequencia_curta', turns: ['manifestos', 'hoje', 'so os salvos'],
    checks: 'Refinamento progressivo por turnos curtos, acumulando filtros na memoria.' },
  { id: 'duvida_cdf_status', turns: ['quais manifestos ja tem CDF emitido?', 'e os que faltam?'],
    checks: 'Distinguir com/sem CDF; continuidade.' }
];

/** Gera a bateria completa: personas × cenários (+ rótulos). */
export function generateBattery() {
  const cases = [];
  for (const scenario of SCENARIOS) {
    for (const persona of PERSONAS) {
      cases.push({
        id: `${scenario.id}__${persona.id}`,
        persona: persona.id,
        personaLabel: persona.label,
        scenario: scenario.id,
        checks: scenario.checks,
        turns: scenario.turns.map((base, i) => persona.phrase(base, i))
      });
    }
  }
  return cases;
}

if (process.argv[1] && process.argv[1].endsWith('battery.mjs')) {
  const battery = generateBattery();
  console.log(`Bateria: ${battery.length} casos (${SCENARIOS.length} cenarios x ${PERSONAS.length} personas).`);
  console.log('Exemplos:');
  for (const c of [battery[1], battery[17], battery[40], battery[200]]) {
    console.log(`\n[${c.id}] (${c.personaLabel})`);
    c.turns.forEach((t, i) => console.log(`  T${i + 1}: ${t}`));
  }
}
