# CRM-lite — contrato de agentes (AGENTS.md)

## Fronteiras de operação (ver ../../AGENTS.md §5)
- **Seguras (autônomas):** editar código/testes em `apps/crm/**`; rodar build/test locais.
- **Com aprovação:** build de imagem, apply no cluster, qualquer deploy, mudança de manifesto fora de `apps/crm/k8s`.
- **Proibidas:** segredos em git; tocar `platform/**`, `.github/**`, `specs/**`; force push.

## Blast-radius (esteira)
`product_scope: crm` → o guard só permite `apps/crm/**`. Registrado em
`specs/products/crm/product.json`.

## Validação
`npm test` / `npm run build` em cada serviço; smoke em `apps/crm/test/smoke.mjs`;
health de cada serviço (`/crm/api/health` etc.).
