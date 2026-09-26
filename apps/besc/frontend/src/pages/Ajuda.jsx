import React from 'react';
import { Link } from 'react-router-dom';

const SECTIONS = [
  ['o-que-e', 'O que é (e o que não é)'],
  ['passo-a-passo', 'Passo a passo'],
  ['telas', 'As telas do sistema'],
  ['doc', 'Checklist documental'],
  ['juridico', 'Checklist jurídico'],
  ['tokenizacao', 'Tokenização e caução (desativadas)'],
  ['pendencias', 'Pendências automáticas'],
  ['status', 'Status do caso'],
  ['risco', 'Matriz de risco'],
  ['relatorios', 'Relatórios'],
  ['glossario', 'Glossário'],
  ['privacidade', 'Privacidade e aviso legal'],
];

// respeita prefers-reduced-motion: sem animação de scroll quando o usuário pede redução de movimento
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth');

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
  const top = () => window.scrollTo({ top: 0, behavior: scrollBehavior() });
  return (
    <div className="card help-section" id={id}>
      <div className="card-head"><h2>{title}</h2><div className="spacer" style={{ flex: 1 }} /><button className="btn ghost sm back-top" onClick={top}>↑ topo</button></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export default function Ajuda() {
  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  };

  return (
    <>
      <div className="crumbs"><Link to="/">Início</Link> / Ajuda</div>

      <div className="help-hero">
        <h1>Como usar a Plataforma de Pesquisa e Recuperação de Ativos Legados</h1>
        <p>Este é um sistema simples de <strong>levantamento e organização</strong>: você cadastra os casos ligados às ações do antigo <strong>BESC</strong> (banco incorporado pelo Banco do Brasil), organiza os documentos, responde checklists e o sistema aponta sozinho <strong>o que ainda falta</strong> para que advogados possam avaliar se existe um direito e como confirmá-lo na fonte oficial (escriturador, depositário ou tribunal).</p>
        <p><strong>Mudança de rumo (ADR-010):</strong> documento antigo é tratado como <strong>evidência legada</strong>, nunca como ativo. Cada caso de levantamento virou uma <Link to="/recuperacao">reivindicação</Link>, que só passa de POSSÍVEL DIREITO a DIREITO CONFIRMADO com confirmação externa. Marketplace, tokenização e caução foram desativados.</p>
        <p><strong>Ele não decide nada por você</strong> — ele organiza e mostra as pendências. Não tokeniza, não oferece investimento, não consulta tribunais e não é aconselhamento jurídico.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <Link className="btn primary" to="/cases/new">+ Cadastrar um caso</Link>
          <Link className="btn" to="/casos">Ver casos</Link>
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
            <li>Não recebe pagamentos, não oferece investimento e não calcula valor oficial.</li>
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
          <Step n="5" title="Acompanhe a reivindicação">
            <p>Em <strong>Reivindicações</strong>, envie as evidências (cada arquivo recebe hash), classifique o tipo de documento e a natureza da fonte, e veja a jornada. As etapas de cadeia de titularidade, validação externa e registro ainda não existem nesta fase e aparecem como não disponíveis.</p>
          </Step>
          <Step n="6" title="Acompanhe pendências e status">
            <p>Na aba <strong>Resumo</strong> e <strong>Pendências</strong>, veja o que falta. Quando não houver pendências bloqueantes/altas, você pode marcar o caso como <strong>Apto para estruturação</strong>.</p>
          </Step>
          <Step n="7" title="Gere os relatórios">
            <p>Na aba <strong>Relatórios</strong>, gere o relatório completo ou os específicos (resumo, pendências, riscos, para advogado).</p>
          </Step>
        </Section>

        <Section id="telas" title="3. As telas do sistema">
          <h3>Painel principal (lista de casos)</h3>
          <p>Mostra todos os casos com status, percentual de documentação, número de pendências, valor alegado e risco. O valor alegado não é reconhecido nem de mercado. Clique numa linha para abrir o caso; use a busca e o filtro por status.</p>
          <h3>Detalhe do caso</h3>
          <p>O coração do sistema, dividido em abas:</p>
          <ul>
            <li><strong>Resumo</strong> — visão geral, status e botões de decisão.</li>
            <li><strong>Dados</strong> — os dados cadastrais do caso.</li>
            <li><strong>Processos</strong> — os processos judiciais.</li>
            <li><strong>Documentos</strong> — o checklist documental.</li>
            <li><strong>Jurídico</strong> — perguntas jurídicas de levantamento.</li>
            <li><strong>Laudo (alegação)</strong> — registro histórico de laudo informado pela parte; não fixa valor.</li>
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

        <Section id="tokenizacao" title="6. Tokenização e caução (desativadas)">
          <p>As abas de tokenização e de caução foram retiradas (ADR-010). A pesquisa de reconciliação concluiu que uma cautela antiga não é ação atual, que um laudo privado não fixa valor e que um token ou bloqueio digital não cria propriedade nem garantia. Os dados já preenchidos continuam guardados no caso, para histórico.</p>
          <p>Garantia sobre ação escritural só existe quando constituída e averbada na infraestrutura oficial (escriturador ou depositário). Isso depende de um ativo já confirmado, o que ainda não é possível nesta fase.</p>
        </Section>

        <Section id="pendencias" title="7. Pendências automáticas">
          <p>O sistema gera a lista de pendências sozinho, e a recalcula a cada alteração. Cada pendência tem uma <strong>severidade</strong>:</p>
          <ul>
            <li><span className="badge b-red">Bloqueante</span> — impede declarar o caso “apto” (ex.: titularidade não comprovada).</li>
            <li><span className="badge b-amber">Alta</span> — importante (ex.: falta o número do processo, falta parecer).</li>
            <li><span className="badge b-blue">Média</span> — relevante (ex.: falta cálculo atualizado, falta análise regulatória).</li>
            <li><span className="badge b-grey">Informativa</span> — bom ter (ex.: definir o custodiante documental).</li>
          </ul>
          <p>Pendências marcadas <span className="pill legal">requer validação jurídica</span> dependem de um profissional. O botão <em>Resolver →</em> leva você direto à aba que resolve aquela pendência.</p>
        </Section>

        <Section id="status" title="8. Status do caso">
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
          <p className="muted small">“Apto para estruturação” significa apenas que o <em>levantamento documental</em> está completo — não que exista direito confirmado.</p>
        </Section>

        <Section id="risco" title="9. Matriz de risco">
          <p>O sistema calcula um <strong>risco jurídico indicativo</strong> — Baixo, Médio, Alto ou <strong>Indeterminado</strong> — combinando fatores: titularidade comprovada, fase processual/trânsito em julgado, risco de prescrição, liquidez, possibilidade de cessão, jurisprudência e evidência documental.</p>
          <p>Se algum fator essencial estiver <strong>não verificado</strong> (titularidade, cessão, fase, liquidez), o risco fica <strong>Indeterminado</strong> — o sistema não “chuta” risco baixo sobre incerteza. É um indicador organizacional, <strong>não</strong> um parecer.</p>
        </Section>

        <Section id="relatorios" title="10. Relatórios">
          <p>Na aba <strong>Relatórios</strong> do caso, cada relatório abre em nova aba, pronto para imprimir ou salvar em PDF, sempre com o aviso legal:</p>
          <ul>
            <li><strong>Relatório completo do caso</strong> — tudo em um documento.</li>
            <li><strong>Checklist de pendências</strong> e <strong>Lista de documentos faltantes</strong>.</li>
            <li><strong>Resumo executivo</strong> e <strong>Matriz de riscos</strong>.</li>
            <li><strong>Para advogado</strong>. Os relatórios de estratégia, de parceiro de tokenização e de análise de caução foram removidos (ADR-010).</li>
          </ul>
        </Section>

        <Section id="glossario" title="11. Glossário">
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
              <tr><td>Tokenização</td><td>Representar um ativo como token digital. Fora do escopo (ADR-010); token não cria propriedade.</td></tr>
              <tr><td>Valor mobiliário</td><td>Título ou contrato de investimento coletivo sujeito à regulação da CVM (Lei 6.385/1976, art. 2º). A plataforma não oferta valores mobiliários.</td></tr>
              <tr><td>FIDC</td><td>Fundo de Investimento em Direitos Creditórios, regulado pela CVM (Resolução CVM 175/2022, Anexo II). Fora do escopo da plataforma (ADR-010).</td></tr>
              <tr><td>KYC</td><td>“Conheça seu cliente” — identificação dos participantes.</td></tr>
              <tr><td>Whitelist</td><td>Lista de participantes autorizados.</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="privacidade" title="12. Privacidade e aviso legal">
          <p>O sistema guarda <strong>dados pessoais</strong> (CPF, documentos). O acesso aos casos e às reivindicações exige login com permissão; ainda assim, não exponha os dados sem necessidade. Você pode <strong>excluir</strong> um caso a qualquer momento pelo botão “Excluir caso” no detalhe.</p>
          <p><strong>Aviso legal.</strong> Esta ferramenta é de organização e levantamento documental. <strong>Não</strong> constitui aconselhamento jurídico, parecer, oferta ou distribuição de valores mobiliários, nem recomendação de investimento. Toda conclusão jurídica, regulatória ou de valor é de responsabilidade dos profissionais habilitados que utilizarem o material.</p>
          <div className="row" style={{ marginTop: 10 }}><Link className="btn primary" to="/cases/new">+ Cadastrar um caso</Link></div>
        </Section>
      </div>
    </>
  );
}
