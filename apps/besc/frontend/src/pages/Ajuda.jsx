import React from 'react';
import { Link } from 'react-router-dom';

const SECTIONS = [
  ['o-que-e', 'O que é (e o que não é)'],
  ['passo-a-passo', 'Passo a passo'],
  ['telas', 'As telas do sistema'],
  ['doc', 'Checklist documental'],
  ['juridico', 'Checklist jurídico'],
  ['tokenizacao', 'Tokenização e regulatório'],
  ['caucao', 'Uso como caução'],
  ['pendencias', 'Pendências automáticas'],
  ['status', 'Status do caso'],
  ['risco', 'Matriz de risco'],
  ['relatorios', 'Relatórios'],
  ['glossario', 'Glossário'],
  ['privacidade', 'Privacidade e aviso legal'],
];

const Ex = ({ children }) => (
  <div className="example-box"><span className="ex-label">Exemplo do que preencher</span>{children}</div>
);

const Step = ({ n, title, children }) => (
  <div className="step">
    <div className="step-n">{n}</div>
    <div className="step-body"><h4>{title}</h4>{children}</div>
  </div>
);

function Section({ id, title, children }) {
  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return (
    <div className="card help-section" id={id}>
      <div className="card-head"><h2>{title}</h2><div className="spacer" style={{ flex: 1 }} /><button className="btn ghost sm back-top" onClick={top}>↑ topo</button></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export default function Ajuda() {
  const go = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <>
      <div className="crumbs"><Link to="/">Casos</Link> / Ajuda</div>

      <div className="help-hero">
        <h1>Como usar a Plataforma de Levantamento BESC Tokenização</h1>
        <p>Este é um sistema simples de <strong>levantamento e organização</strong>: você cadastra os casos ligados às ações do antigo <strong>BESC</strong> (banco incorporado pelo Banco do Brasil), organiza os documentos, responde checklists e o sistema aponta sozinho <strong>o que ainda falta</strong> para que advogados, consultores e tokenizadores possam depois avaliar a viabilidade de uma tokenização ou o uso desses direitos como garantia (caução) em processos.</p>
        <p><strong>Ele não decide nada por você</strong> — ele organiza e mostra as pendências. Não tokeniza de verdade, não consulta tribunais e não é aconselhamento jurídico.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <Link className="btn primary" to="/cases/new">+ Cadastrar um caso</Link>
          <Link className="btn" to="/">Ver casos</Link>
        </div>
      </div>

      <div className="help-toc">
        {SECTIONS.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
      </div>

      <div className="stack">
        <Section id="o-que-e" title="1. O que é (e o que não é)">
          <h3>Para que serve</h3>
          <p>Reunir num só lugar tudo sobre cada caso do BESC — titular, ações, processos, documentos e riscos — e gerar <strong>checklists</strong> e <strong>relatórios</strong> mostrando o que já existe e o que falta para estruturar o projeto depois.</p>
          <h3>O que o sistema faz</h3>
          <ul>
            <li>Cadastra casos e processos judiciais.</li>
            <li>Organiza os documentos e marca o status de cada um.</li>
            <li>Levanta pendências <strong>automaticamente</strong> conforme você preenche.</li>
            <li>Classifica um risco jurídico indicativo e o percentual de documentação.</li>
            <li>Gera relatórios prontos para imprimir/PDF.</li>
          </ul>
          <h3>O que o sistema NÃO faz</h3>
          <ul>
            <li>Não emite, cria nem negocia tokens (não há blockchain).</li>
            <li>Não consulta tribunais nem puxa andamentos automaticamente — tudo é digitado.</li>
            <li>Não tem login, pagamento nem cálculo oficial de valores.</li>
            <li>Não dá parecer jurídico. As conclusões são sempre dos profissionais.</li>
          </ul>
        </Section>

        <Section id="passo-a-passo" title="2. Passo a passo (o fluxo recomendado)">
          <p className="muted">Você pode preencher na ordem que quiser, mas esta é a sequência que rende resultado mais rápido. A cada preenchimento, as pendências e o status se recalculam sozinhos.</p>
          <Step n="1" title="Cadastre o caso">
            <p>Clique em <strong>+ Novo caso</strong> e preencha os dados do titular e das ações (quem é, CPF/CNPJ, quantas ações, classe, origem).</p>
            <Ex>“João da Silva”, CPF 123.456.789-00, tipo <em>Espólio</em>, 1.200 ações <em>ON</em>, origem “herança do pai”.</Ex>
          </Step>
          <Step n="2" title="Cadastre o(s) processo(s) judicial(is)">
            <p>Na aba <strong>Processos</strong>, adicione o processo de origem do direito, se houver (número, tribunal, fase, valores).</p>
            <Ex>Número no padrão CNJ: <em>0001234-56.2010.8.24.0023</em>, tribunal “TJSC”, fase “Com sentença”.</Ex>
          </Step>
          <Step n="3" title="Organize os documentos">
            <p>Na aba <strong>Documentos</strong>, marque o status de cada documento à medida que os recebe e confere.</p>
            <Ex>Recebeu a certidão de óbito → marque <em>Recebido</em>; conferiu que está correta → <em>Validado</em>.</Ex>
          </Step>
          <Step n="4" title="Responda o checklist jurídico">
            <p>Na aba <strong>Jurídico</strong>, responda o que já se sabe (o direito existe? pode ser cedido? há risco de prescrição?). O que ficar “Não avaliado” vira pendência.</p>
          </Step>
          <Step n="5" title="Preencha a tokenização e o regulatório">
            <p>Na aba <strong>Tokenização</strong>, descreva o que o token representaria e responda os itens regulatórios (é valor mobiliário? precisa de estrutura via FIDC?).</p>
          </Step>
          <Step n="6" title="Avalie o uso como caução (se aplicável)">
            <p>Na aba <strong>Caução</strong>, ative e preencha se pretende oferecer o direito como garantia em outro processo.</p>
          </Step>
          <Step n="7" title="Acompanhe pendências e status">
            <p>Na aba <strong>Resumo</strong> e <strong>Pendências</strong>, veja o que falta. Quando não houver pendências bloqueantes/altas, você pode marcar o caso como <strong>Apto para estruturação</strong>.</p>
          </Step>
          <Step n="8" title="Gere os relatórios">
            <p>Na aba <strong>Relatórios</strong>, gere o relatório completo ou os específicos (para advogado, para parceiro de tokenização, para análise de caução).</p>
          </Step>
        </Section>

        <Section id="telas" title="3. As telas do sistema">
          <h3>Painel principal (lista de casos)</h3>
          <p>Mostra todos os casos com status, percentual de documentação, número de pendências, valor estimado e risco. Clique numa linha para abrir o caso; use a busca e o filtro por status.</p>
          <h3>Detalhe do caso</h3>
          <p>O coração do sistema, dividido em abas:</p>
          <ul>
            <li><strong>Resumo</strong> — visão geral, status e botões de decisão.</li>
            <li><strong>Dados</strong> — os dados cadastrais do caso.</li>
            <li><strong>Processos</strong> — os processos judiciais.</li>
            <li><strong>Documentos</strong> — o checklist documental.</li>
            <li><strong>Jurídico</strong> — perguntas jurídicas de levantamento.</li>
            <li><strong>Tokenização</strong> — o que tokenizar + regulatório.</li>
            <li><strong>Caução</strong> — uso como garantia em processos de terceiros.</li>
            <li><strong>Pendências</strong> — o que falta, calculado automaticamente.</li>
            <li><strong>Relatórios</strong> — geração dos relatórios.</li>
          </ul>
          <p>No topo do detalhe há os botões <strong>Editar dados</strong>, <strong>Relatório completo</strong> e <strong>Excluir caso</strong>.</p>
        </Section>

        <Section id="doc" title="4. Checklist documental">
          <p>Cada documento tem um <strong>status</strong>. Vá avançando conforme o andamento:</p>
          <table className="data">
            <thead><tr><th>Status</th><th>Quando usar</th></tr></thead>
            <tbody>
              <tr><td><strong>Pendente</strong></td><td>Ainda não tem o documento.</td></tr>
              <tr><td><strong>Recebido</strong></td><td>Recebeu, mas ainda não conferiu.</td></tr>
              <tr><td><strong>Em análise</strong></td><td>Está conferindo/analisando.</td></tr>
              <tr><td><strong>Validado</strong></td><td>Conferido e correto — conta para o percentual.</td></tr>
              <tr><td><strong>Rejeitado</strong></td><td>Documento inválido/incorreto.</td></tr>
              <tr><td><strong>Necessita complementação</strong></td><td>Falta algo (página, assinatura, etc.).</td></tr>
            </tbody>
          </table>
          <p>Alguns documentos são <strong>condicionais</strong> — só aparecem como obrigatórios quando fazem sentido. Ex.: <em>certidão de óbito</em> e <em>formal de partilha</em> só entram na conta se o titular for <strong>espólio</strong> ou <strong>herdeiro</strong>; <em>contrato de cessão</em> só para <strong>cessionário</strong>.</p>
          <p>O <strong>percentual de documentação</strong> é: documentos validados ÷ documentos aplicáveis.</p>
          <p><strong>Anexar arquivos:</strong> em cada documento há o botão <strong>Anexar</strong> para subir o arquivo em si (PDF, imagem, etc., até 15 MB por arquivo). Ao anexar, o status vira “Recebido” automaticamente. Depois você pode <strong>baixar/abrir</strong> ou <strong>remover</strong> o anexo. Vários arquivos podem ser anexados ao mesmo documento.</p>
          <Ex>Marque no campo “Fonte/origem” de onde veio cada documento (ex.: “cartório 2º ofício”, “autos do processo, fls. 45”) e anexe o PDF correspondente.</Ex>
        </Section>

        <Section id="juridico" title="5. Checklist jurídico">
          <p>São perguntas de <strong>levantamento</strong>, respondidas com <em>Sim / Não / Parcial / Não avaliado / Não se aplica</em>. Elas cobrem: se o direito existe, se é transferível, se pode ser cedido, se serve de caução, risco de prescrição, discussão de liquidez, jurisprudência favorável/contrária, se o juiz pode recusar como garantia e se precisa de parecer/avaliação externa.</p>
          <p><strong>Importante:</strong> todas exigem validação de um advogado. Responder “Não avaliado” é honesto — e gera pendência para lembrar de resolver.</p>
          <Ex>“Pode ser cedido?” → se ainda não há confirmação jurídica, deixe <em>Não avaliado</em>; use o campo de observações para anotar “aguardando parecer do Dr. Fulano”.</Ex>
        </Section>

        <Section id="tokenizacao" title="6. Checklist de tokenização e regulatório">
          <p>Aqui você levanta <strong>o que</strong> seria tokenizado e o <strong>enquadramento</strong>, sem executar nada. Descreva: o que exatamente será tokenizado, qual o lastro, quem custodia os documentos, quem valida o lastro, valor estimado, e as escolhas técnicas (fracionamento, smart contract, blockchain, whitelist, KYC, etc.).</p>
          <p>Os itens marcados <span className="pill legal">requer validação</span> são regulatórios (é valor mobiliário? precisa de registro/dispensa? estrutura via FIDC? enquadra no marco de ativos virtuais/BCB? PLD-FT? LGPD? tributação?) — todos dependem de assessoria jurídica/CVM.</p>
          <Ex>Em “O que será tokenizado”, escreva no campo de definição: “direito creditório reconhecido na sentença do processo nº ... — parcela de X ações ON”.</Ex>
        </Section>

        <Section id="caucao" title="7. Uso como caução/garantia">
          <p>Use esta aba se pretende oferecer o direito como <strong>garantia em um processo de terceiro</strong> (execução fiscal, trabalhista, cível, substituição de penhora, etc.). Ative a avaliação e preencha o tipo de processo, o valor da dívida, o valor de garantia necessário (a cobertura % é calculada), prazo, remuneração, risco de recusa e quem assume o risco.</p>
          <p>Direitos ilíquidos/litigiosos costumam ser <strong>recusados</strong> como garantia — o laudo de avaliação, o trânsito em julgado e um parecer reduzem esse risco. A aceitação final é sempre decisão do juízo.</p>
          <Ex>Execução fiscal de R$ 200.000 → “valor necessário de garantia” R$ 200.000; se você oferece um direito estimado em R$ 260.000, a cobertura mostra 130%.</Ex>
        </Section>

        <Section id="pendencias" title="8. Pendências automáticas">
          <p>O sistema gera a lista de pendências sozinho, e a recalcula a cada alteração. Cada pendência tem uma <strong>severidade</strong>:</p>
          <ul>
            <li><span className="badge b-red">Bloqueante</span> — impede declarar o caso “apto” (ex.: titularidade não comprovada).</li>
            <li><span className="badge b-amber">Alta</span> — importante (ex.: falta o número do processo, falta parecer).</li>
            <li><span className="badge b-blue">Média</span> — relevante (ex.: falta cálculo atualizado, falta análise regulatória).</li>
            <li><span className="badge b-grey">Informativa</span> — bom ter (ex.: definir o custodiante documental).</li>
          </ul>
          <p>Pendências marcadas <span className="pill legal">requer validação jurídica</span> dependem de um profissional. O botão <em>Resolver →</em> leva você direto à aba que resolve aquela pendência.</p>
        </Section>

        <Section id="status" title="9. Status do caso">
          <p>O status caminha em grande parte <strong>sozinho</strong> conforme você preenche; as decisões (declarar apto, não apto, arquivar) exigem sua confirmação.</p>
          <table className="data">
            <thead><tr><th>Status</th><th>Significado</th></tr></thead>
            <tbody>
              <tr><td><strong>Novo</strong></td><td>Caso recém-criado.</td></tr>
              <tr><td><strong>Documentação incompleta</strong></td><td>Há pendência bloqueante (ex.: titularidade).</td></tr>
              <tr><td><strong>Em análise jurídica</strong></td><td>Base reunida; aguarda avaliação jurídica.</td></tr>
              <tr><td><strong>Aguardando cálculo</strong></td><td>Falta o valor atualizado do direito.</td></tr>
              <tr><td><strong>Aguardando parecer</strong></td><td>Falta o parecer jurídico formal.</td></tr>
              <tr><td><strong>Apto para estruturação</strong></td><td>Levantamento completo, sem pendências bloqueantes/altas (confirmação manual).</td></tr>
              <tr><td><strong>Apto com ressalvas</strong></td><td>Suficiente para seguir, com ressalvas registradas.</td></tr>
              <tr><td><strong>Não apto</strong></td><td>Há impedimento relevante (decisão manual).</td></tr>
              <tr><td><strong>Arquivado</strong></td><td>Caso encerrado/suspenso.</td></tr>
            </tbody>
          </table>
          <p className="muted small">“Apto para estruturação” significa apenas que o <em>levantamento documental</em> está completo — não que a tokenização/garantia é juridicamente viável.</p>
        </Section>

        <Section id="risco" title="10. Matriz de risco">
          <p>O sistema calcula um <strong>risco jurídico indicativo</strong> — Baixo, Médio, Alto ou <strong>Indeterminado</strong> — combinando fatores: titularidade comprovada, fase processual/trânsito em julgado, risco de prescrição, liquidez, possibilidade de cessão, jurisprudência e evidência documental.</p>
          <p>Se algum fator essencial estiver <strong>não verificado</strong> (titularidade, cessão, fase, liquidez), o risco fica <strong>Indeterminado</strong> — o sistema não “chuta” risco baixo sobre incerteza. É um indicador organizacional, <strong>não</strong> um parecer.</p>
        </Section>

        <Section id="relatorios" title="11. Relatórios">
          <p>Na aba <strong>Relatórios</strong> do caso, cada relatório abre em nova aba, pronto para imprimir ou salvar em PDF, sempre com o aviso legal:</p>
          <ul>
            <li><strong>Relatório completo do caso</strong> — tudo em um documento.</li>
            <li><strong>Checklist de pendências</strong> e <strong>Lista de documentos faltantes</strong>.</li>
            <li><strong>Resumo executivo</strong> e <strong>Matriz de riscos</strong>.</li>
            <li><strong>Para advogado</strong>, <strong>para parceiro de tokenização</strong> e <strong>para análise de caução</strong>.</li>
          </ul>
        </Section>

        <Section id="glossario" title="12. Glossário">
          <table className="data">
            <thead><tr><th>Termo</th><th>O que é</th></tr></thead>
            <tbody>
              <tr><td>Ações ON</td><td>Ordinárias — dão direito a voto.</td></tr>
              <tr><td>Ações PNA / PNB</td><td>Preferenciais (classes A/B) — em geral sem voto, com preferência em dividendos.</td></tr>
              <tr><td>Escriturador</td><td>Instituição que mantém o registro das ações (custódia escritural).</td></tr>
              <tr><td>Espólio</td><td>Conjunto de bens/direitos de uma pessoa falecida, antes da partilha.</td></tr>
              <tr><td>Cessionário</td><td>Quem recebeu o direito de outra pessoa por cessão.</td></tr>
              <tr><td>Direito litigioso</td><td>Direito/crédito que está sendo discutido em um processo.</td></tr>
              <tr><td>Direito creditório</td><td>Crédito a receber (ex.: indenização reconhecida).</td></tr>
              <tr><td>Lastro</td><td>O que dá respaldo real ao ativo/token.</td></tr>
              <tr><td>Caução</td><td>Garantia oferecida num processo para assegurar uma obrigação.</td></tr>
              <tr><td>Tokenização</td><td>Representar um direito/ativo como token digital (aqui, apenas planejado).</td></tr>
              <tr><td>Valor mobiliário</td><td>Título de investimento sujeito à regulação da CVM.</td></tr>
              <tr><td>FIDC</td><td>Fundo de Investimento em Direitos Creditórios — estrutura comum para recebíveis.</td></tr>
              <tr><td>KYC</td><td>“Conheça seu cliente” — identificação dos participantes.</td></tr>
              <tr><td>Whitelist</td><td>Lista de participantes autorizados.</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="privacidade" title="13. Privacidade e aviso legal">
          <p>O sistema guarda <strong>dados pessoais</strong> (CPF, documentos). Mesmo sem login, use-o em ambiente controlado e não exponha os dados sem necessidade. Você pode <strong>excluir</strong> um caso a qualquer momento pelo botão “Excluir caso” no detalhe.</p>
          <p><strong>Aviso legal.</strong> Esta ferramenta é de organização e levantamento documental. <strong>Não</strong> constitui aconselhamento jurídico, parecer, oferta ou distribuição de valores mobiliários, nem recomendação de investimento. Toda conclusão jurídica, regulatória ou de valor é de responsabilidade dos profissionais habilitados que utilizarem o material.</p>
          <div className="row" style={{ marginTop: 10 }}><Link className="btn primary" to="/cases/new">+ Cadastrar um caso</Link></div>
        </Section>
      </div>
    </>
  );
}
