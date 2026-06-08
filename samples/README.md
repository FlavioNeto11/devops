# `samples/` — vazio (por design)

As aplicações de exemplo (`aplicacao1/2/3`) foram **removidas**: os apps reais da plataforma vivem
em [`apps/`](../apps/) (`sicat`, `gymops`, `rmambiental`) e servem como exemplos vivos.

## Onde olhar agora
- **Modelo parametrizável (Helm)**: [`templates/app-template/`](../templates/app-template/).
- **Como criar um app novo**: [`docs/standards/golden-path.md`](../docs/standards/golden-path.md).
- **Exemplos reais**: [`apps/sicat`](../apps/sicat) (full-stack + IA + OIDC), [`apps/gymops`](../apps/gymops)
  (monorepo Next.js+Fastify), [`apps/rmambiental`](../apps/rmambiental) (SPA estática).

> Esta pasta é mantida só para evitar quebrar caminhos antigos. Não adicione exemplos aqui — use
> `apps/` (apps reais) ou `templates/app-template` (modelo).
