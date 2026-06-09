import React from 'react';

/** Bloco de carregamento (shimmer). Respeita prefers-reduced-motion (via CSS). */
export function Skeleton({ w = '100%', h = 14, r = 6, style }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Grade de cards (ex.: Overview). */
export function CardSkeleton({ count = 8 }) {
  return (
    <div className="cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton w="55%" h={26} />
          <Skeleton w="40%" h={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

/** Tabela (linhas x colunas). */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}><Skeleton h={12} w={c === 0 ? '70%' : '50%'} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de cards (ex.: Apps, usuários). */
export function ListSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="app-card">
          <Skeleton w="32%" h={16} />
          <Skeleton w="60%" h={11} style={{ marginTop: 10 }} />
          <Skeleton w="80%" h={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
