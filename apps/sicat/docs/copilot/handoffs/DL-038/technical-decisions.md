# Technical Decisions — DL-038

## D-038.1 — Migrar layout sem reescrever backend contracts
O layout foi refatorado no frontend preservando os endpoints e contratos já usados em produção (`/v1/manifestos`, `/v1/jobs/{id}`, etc.).

## D-038.2 — Rotas dedicadas por tela Stitch
Cada tela de design foi materializada em view própria para rastreabilidade e manutenção:
- `/login`
- `/dashboard`
- `/manifestos`
- `/manifestos/novo`
- `/manifestos/:id`
- `/jobs`
- `/sessao`

## D-038.3 — Shell global autenticado no `App.vue`
A navegação e composição principal foram centralizadas no `App.vue`, removendo acoplamento visual antigo com cabeçalho local.

## D-038.4 — Design system incremental no CSS base
Foi adotada abordagem incremental em `base.css`, adicionando classes `sicat-*` inspiradas no Stitch para evitar ruptura imediata do código existente.
