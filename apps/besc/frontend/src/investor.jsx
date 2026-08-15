import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

// ---- modo demonstração (gate regulatório) ----
// Enquanto go_live for false, TODA a área do investidor exibe um aviso/watermark persistente.
// A fonte da verdade é a API (GET /portal/mode → {goLive}); em falha de rede, assumimos
// demonstração (fail-safe: melhor mostrar o aviso a mais do que a menos).
export function useInvestorMode() {
  const [state, setState] = useState({ loading: true, goLive: false });
  useEffect(() => {
    let alive = true;
    api.investor.mode()
      .then((d) => { if (alive) setState({ loading: false, goLive: !!(d && d.goLive) }); })
      .catch(() => { if (alive) setState({ loading: false, goLive: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}

// Watermark de demonstração: visualmente óbvio (faixa listrada âmbar fixa no topo do conteúdo)
// mas NÃO bloqueia a navegação. Mostrado sempre que o ambiente não está "no ar" (go_live=false)
// ou quando um payload da API vem marcado como demonstração.
export function DemoWatermark({ show = true }) {
  if (!show) return null;
  return (
    <div className="demo-watermark" role="note" aria-label="Ambiente de demonstração">
      <span className="dw-ic" aria-hidden="true"><Icon name="alert" size={16} /></span>
      <span>
        <strong>Ambiente de demonstração</strong> — nenhum valor mobiliário está sendo ofertado.
        Os dados servem apenas para simulação e não constituem oferta, recomendação ou compromisso.
      </span>
    </div>
  );
}
