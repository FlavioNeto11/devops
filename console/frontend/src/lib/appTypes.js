// Taxonomia de aplicações da plataforma (espelha projects.app_type no pm-api e o
// label devops.flavioneto/app-type nos recursos k8s). Fonte canônica do vocabulário
// visual: portal CMS ≠ produto/sistema ≠ ferramenta interna.
export const APP_TYPES = {
  cms_portal: { label: 'Portal CMS', short: 'CMS', badge: 'badge-accent', icon: 'file-text' },
  product_software: { label: 'Produto', short: 'Produto', badge: 'badge-ok', icon: 'layers' },
  platform_tool: { label: 'Interno', short: 'Interno', badge: 'badge-muted', icon: 'package' },
};

// Aceita tanto camelCase (rota /me) quanto snake_case (rota /projects, linhas do banco).
export const appTypeOf = (p) => p?.appType || p?.app_type || 'product_software';
export const isPortal = (p) => appTypeOf(p) === 'cms_portal';
export const isProduct = (p) => appTypeOf(p) === 'product_software';
export const typeMeta = (t) => APP_TYPES[t] || APP_TYPES.product_software;

/**
 * Lookup chave-de-app (label part-of / key do projeto) -> app_type, a partir da
 * lista de projetos do pm-api. Usado por Apps/Publicações/Health para rotular
 * recursos vivos do cluster mesmo antes de os Deployments ganharem o label novo.
 */
export function appTypeLookup(projects) {
  const map = {};
  for (const p of projects || []) {
    const t = appTypeOf(p);
    if (p.key) map[p.key] = t;
    if (p.k8s_label_selector) map[p.k8s_label_selector] = t;
  }
  return map;
}
