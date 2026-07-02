// Navegação da sidebar. O motor (generate-ui) anexa grupos de domínio.
export const nav = [
  { group: '', items: [
    { label: 'Painel', to: '/', icon: '◧' },
    { label: 'Registros', to: '/records', icon: '▤' },
    { label: 'Assistente', to: '/assistant', icon: '✨' },
  ] },
  { group: 'Conta', items: [
    { label: 'Perfil', to: '/profile', icon: '◔' },
    { label: 'Usuários', to: '/admin/users', icon: '◍', adminOnly: true },
  ] },
];
