import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';

const STATUS = {
  pronto: { cls: 'b-green', label: 'Pronto' },
  em_curso: { cls: 'b-amber', label: 'Em curso' },
  planejado: { cls: 'b-grey', label: 'Planejado' },
  diferido: { cls: 'b-grey', label: 'Diferido' },
  fora: { cls: 'b-grey', label: 'Fora do escopo atual' },
};

const PHASES = [
  { id: 'A', status: 'pronto', title: 'A — Conhecimento / portal', body: 'Base institucional (o que são as BESCs, histórico da incorporação, base legal, custos), biblioteca de documentos, jurisprudência pesquisável, glossário e página de referência. É o que transforma a ferramenta em um portal do processo.', links: [['/biblioteca', 'Biblioteca'], ['/jurisprudencia', 'Jurisprudência'], ['/referencia', 'Referência']] },
  { id: 'B', status: 'pronto', title: 'B — Levantamento aprimorado (perícia, mecanismo, credor)', body: 'Cadastro de caso com mecanismo de liquidação (compensação, dação, caução…), credor-alvo e módulo de perícia / atualização monetária (autenticidade da cártula, valor atualizado, ágio). Registra o laudo — não calcula o valor oficial.', links: [['/casos', 'Casos']] },
  { id: 'C', status: 'em_curso', title: 'C — Custos (cartório / honorários)', body: 'Tabela de custas 2024 transcrita como referência. Falta o estimador por caso (custas + honorários de cartório + êxito), que só avança com a conferência oficial dos valores.', links: [['/referencia', 'Tabela de custas']] },
  { id: 'D', status: 'planejado', title: 'D — Processo / timeline judicial', body: 'Linha do tempo estruturada do rito (inicial → caução/substituição → perícia judicial → sentença → recursos → trânsito → homologação), com data e status por marco. Dá visão de onde cada caso está.' },
  { id: 'E', status: 'planejado', title: 'E — Tokenização (índice de prontidão)', body: 'O checklist de tokenização já existe por caso; falta um índice agregado de prontidão (documentação + pendências regulatórias + risco + perícia) e uma visão de portfólio de casos aptos. A estruturação real (FIDC, oferta) permanece fora de escopo.' },
  { id: 'F', status: 'diferido', title: 'F — Governança (login / multiusuário / auditoria)', body: 'Ausente por decisão de produto (operador único, sem login). Pré-condição para quando houver mais de um operador ou exposição externa — integraria o Keycloak da plataforma. Não é prioridade agora.' },
  { id: 'G', status: 'fora', title: 'G — Integrações futuras', body: 'Consulta automática a tribunais, feed de índices de correção (IGP-M/IPCA/SELIC) e trilho on-chain / smart contract. Explicitamente fora do escopo atual; o campo de índice monetário já deixa o gancho preparado.' },
];

export default function Roadmap() {
  return (
    <>
      <div className="help-hero">
        <h1>Roadmap do processo BESC</h1>
        <p>
          O caminho completo — do levantamento das ações e da apuração pericial, passando pela escolha
          do mecanismo de liquidação e pela jurisprudência de apoio, até a futura tokenização. Abaixo,
          o que já está no ar e o que ainda falta, de forma honesta.
        </p>
      </div>

      {PHASES.map((p) => {
        const s = STATUS[p.status];
        return (
          <div key={p.id} className="phase-card">
            <div className="pc-head">
              <h3>{p.title}</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <span className={`badge ${s.cls}`}>{s.label}</span>
            </div>
            <p>{p.body}</p>
            {p.links && (
              <div className="row" style={{ marginTop: 8 }}>
                {p.links.map(([to, lbl]) => <Link key={to} to={to} className="btn sm ghost">{lbl} <Icon name="chevronRight" size={13} /></Link>)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
