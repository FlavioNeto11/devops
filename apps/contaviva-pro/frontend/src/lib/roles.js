// roles.js — mapa único papel->rótulo pt-BR + tom semântico do badge (bloco contas-acesso).
// Fonte da verdade da UI para nomes de papéis: usado na tabela de usuários, no select de criação e
// no rodapé da sidebar, evitando o idioma misto ('member' cru na tabela vs 'membro' no select) e
// representando corretamente papéis vindos da API que não têm superfície própria (ex.: manager).
// Domain-agnostic quanto a papéis desconhecidos: cai num rótulo capitalizado legível.

const ROLE_PT = { admin: 'Administrador', manager: 'Gerente', member: 'Membro' };
const ROLE_TONE = { admin: 'success', manager: 'warning', member: 'neutral' };

export function roleLabel(role) {
  const key = String(role || '').toLowerCase().trim();
  if (ROLE_PT[key]) return ROLE_PT[key];
  if (!key) return '—';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function roleTone(role) {
  return ROLE_TONE[String(role || '').toLowerCase().trim()] || 'neutral';
}

// papéis atribuíveis pela UI de criação (decisão de produto sobre 'manager' fica em aberto).
export const ASSIGNABLE_ROLES = ['member', 'admin'];
