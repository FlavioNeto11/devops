// Destino dos caminhos da tese antiga (marketplace, carteira, títulos, aluguéis, gate) — ADR-010.
import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';

export default function Desativado() {
  return (
    <div className="empty">
      <h3><Icon name="lock" size={16} /> Funcionalidade desativada</h3>
      <p>
        O marketplace de títulos, a carteira de investidor, a emissão de tokens, os aluguéis e o gate de
        go-live foram desativados (ADR-010). A plataforma passou a tratar documentos antigos como evidência
        de um possível direito, a ser confirmado na fonte oficial de registro, e não como ativo negociável.
      </p>
      <p className="row" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn sm primary">Ir para o início</Link>
        <Link to="/referencia" className="btn sm">Entender a mudança</Link>
      </p>
    </div>
  );
}
