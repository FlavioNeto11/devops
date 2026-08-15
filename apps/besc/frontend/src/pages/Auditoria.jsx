import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Banner, SkeletonList, HelpCallout, LegalStatusBadge, ListingBadge } from '../ui.jsx';
import { Icon } from '../icons.jsx';

// Mensagem amigável para os erros mais comuns desta área (403 = escopo não concedido).
function friendly(msg) {
  const m = String(msg || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  if (/403|acesso|permiss/i.test(m)) return 'Você não tem acesso concedido a esta consulta. Peça ao Gestor para vinculá-lo ao título.';
  if (/503|indispon/i.test(m)) return 'O serviço de auditoria está indisponível no momento. Tente novamente em instantes.';
  return m || 'Não foi possível carregar os títulos.';
}

// Portal de AUDITORIA (advogado/juiz) — lista dos títulos aos quais o auditor foi vinculado
// (escopo linked). O Gestor (escopo all) vê todos. Somente leitura.
export default function Auditoria() {
  const [titles, setTitles] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api.auditor.titles()
      .then((t) => { if (alive) setTitles(Array.isArray(t) ? t : []); })
      .catch((e) => { if (alive) setError(friendly(e.message)); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <div className="crumbs"><Link to="/">Início</Link> / Auditoria</div>
      <div className="pgtitle"><h1><Icon name="gavel" size={22} /> Portal de auditoria</h1></div>

      <HelpCallout title="Consulta qualificada e somente leitura">
        Esta área é destinada a <strong>advogados e juízes</strong> designados. Você vê apenas os títulos aos
        quais o Gestor concedeu acesso e <strong>não pode alterar nada</strong>. <strong>Seu acesso é registrado
        na trilha de auditoria</strong> — a consulta qualificada é rastreável por desenho, não é vigilância oculta.
      </HelpCallout>

      <Banner kind="err">{error}</Banner>

      {!titles && !error && <SkeletonList count={4} lines={2} />}

      {titles && titles.length === 0 && (
        <div className="card"><div className="empty">
          <h3>Nenhum título vinculado ao seu acesso</h3>
          <p className="muted">
            Quando o Gestor conceder acesso a um título específico, ele aparecerá aqui para consulta.
          </p>
        </div></div>
      )}

      {titles && titles.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Títulos acessíveis ({titles.length})</h3></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Título</th><th>Estado jurídico</th><th>Publicação</th><th></th></tr>
              </thead>
              <tbody>
                {titles.map((t) => (
                  <tr
                    key={t.id}
                    className="clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/auditoria/titulos/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/auditoria/titulos/${t.id}`); }
                    }}
                  >
                    <td><div style={{ fontWeight: 600 }}>{t.label}</div></td>
                    <td><LegalStatusBadge status={t.legal_status} /></td>
                    <td><ListingBadge status={t.listing_status} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link className="btn sm" to={`/auditoria/titulos/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        Consultar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
