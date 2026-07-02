import React from 'react';

// Ícones SVG inline (stroke, 24x24). Sem dependência externa.
const PATHS = {
  cases: (<><path d="M8 6h13M8 12h13M8 18h11" /><circle cx="4" cy="6" r="1.1" /><circle cx="4" cy="12" r="1.1" /><circle cx="4" cy="18" r="1.1" /></>),
  gauge: (<><path d="M3.5 15a8.5 8.5 0 1 1 17 0" /><path d="M12 15l4-3.5" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>),
  briefcase: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></>),
  file: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  landmark: (<><path d="M3 21h18" /><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10" /><path d="M12 3l9 5H3z" /></>),
  coins: (<><circle cx="9" cy="9" r="6" /><path d="M14.5 6.2A6 6 0 1 1 17.8 17" /></>),
  shield: (<><path d="M12 3l8 3v5.5c0 4.7-3.4 7.4-8 8.9-4.6-1.5-8-4.2-8-8.9V6z" /><path d="M9 12l2 2 4-4" /></>),
  alert: (<><path d="M12 3.5l9.5 16.5H2.5z" /><path d="M12 10v4.5M12 17.7v.3" /></>),
  report: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>),
  plus: (<path d="M12 5v14M5 12h14" />),
  edit: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  trash: (<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  upload: (<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>),
  download: (<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" /></>),
  paperclip: (<path d="M21 9l-9.5 9.5a4.5 4.5 0 0 1-6.4-6.4L14 3.2a3 3 0 0 1 4.2 4.2L9.4 16" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>),
  chevronRight: (<path d="M9 6l6 6-6 6" />),
  help: (<><circle cx="12" cy="12" r="9" /><path d="M9.4 9a2.6 2.6 0 0 1 4.4 1.6c0 1.3-1.6 1.7-2 2.6" /><path d="M12 17.4v.2" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.2" /></>),
  check: (<path d="M5 12l5 5L20 6" />),
  folder: (<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
};

export function Icon({ name, size = 16, className, strokeWidth = 1.8, style }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">{p}</svg>
  );
}

// Marca da aplicação (escudo + check) para a topbar.
export function BrandMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 3v5.5c0 4.7-3.4 7.4-8 8.9-4.6-1.5-8-4.2-8-8.9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
