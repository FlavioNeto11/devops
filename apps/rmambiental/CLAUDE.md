---
title: "RM Ambiental — Manual para Claude Code"
status: canonical
applies_to: [rmambiental]
updated: 2026-06-09
language: pt-BR
---

# RM Ambiental — Manual para Claude Code

> **Comece por aqui.** As fronteiras de operação e a matriz de decisão vivem no
> [`AGENTS.md`](./AGENTS.md) — leia antes de agir. Este arquivo traz o contexto específico do Claude.
>
> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Máquina:
> [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** esses conteúdos —
> aponte. Padrão desta camada: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).

## O que é RM Ambiental

Portal institucional premium (site corporativo) da **RM Ambiental Brasil** — reinterpretação moderna do
site atual, **não** uma cópia. **Somente-frontend** (SPA Vite/React estática): sem backend, banco, auth
ou segredo. Servido por nginx sob o subpath `/rmambiental/`, host `dev.nvit.com.br` (e `nvit.localhost`
no dev local), basePath `/rmambiental`. Encaixa na esteira como um app `frontend` puro
(`expose: true`, `stripPrefix: false`, `priority: 10`).

## Ordem de leitura

1. Este arquivo.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras + matriz de decisão (obrigatório antes de agir).
3. [`README.md`](./README.md) — setup técnico, estrutura `src/` e placeholders a personalizar.
4. [`docs/status.md`](./docs/status.md) — estado deployado, gaps e próximos passos.

## Stack & decisões de arquitetura

| Aspecto | Decisão | Por quê |
|---|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5 | SPA estática leve, build rápido |
| Estilo | Tailwind CSS 3 (`tailwind.config.js`) + tokens em `index.css` | design system corporativo dark |
| Animação | Framer Motion 11 | scroll reveal, contadores, micro-interações, modal |
| Ícones | `lucide-react` | SVG, sem imagens de terceiros |
| Rotas | `react-router-dom` 6 (`/`, `/solucoes`, `/contato`), base `/rmambiental` | roteamento client-side |
| Backend | — (nenhum) | site institucional puro |
| Auth | — (nenhum) | não há área logada |
| Runtime | nginx:alpine servindo `dist/` | imagem mínima, MIME-safe |
| Deploy | Kubernetes (esteira da plataforma) + Argo CD | padrão; `apps/rmambiental/k8s` via auto-sync |

## Armadilhas conhecidas

1. **Base path quebrado** → o build deve embutir `/rmambiental/`; `vite.config.ts` lê
   `process.env.VITE_BASE_PATH` (default `/rmambiental/`). Traefik **não faz strip**; quem ajusta o
   subpath é o build + o nginx, não o ingress.
2. **Assets servindo `application/octet-stream`** (SPA quebra) → o `nginx.conf` usa **prefixo + alias
   estático** para `/rmambiental/assets/` e `/rmambiental/images/` (nunca `alias` com captura de
   regex). E os nomes de asset usam separador por ponto (`[name].[hash].js`) em `vite.config.ts` para
   evitar cache antigo do Cloudflare. Ver TROUBLESHOOTING da plataforma (seções 13/14).
3. **Conteúdo placeholder tratado como real** → números de autoridade
   (`src/components/AuthoritySection.tsx`), cases (`src/data/projects.ts`) e contato
   (`src/lib/site.ts`, campos `AJUSTAR`) são **ilustrativos**. Não publicar como fato sem dado real.
4. **Imagens** → o portal é 100% SVG/CSS hoje; fotos reais (com direitos) vão em
   `public/images/` e são servidas por `/rmambiental/images/` (rota já prevista no nginx).

## Variáveis de ambiente chave

```bash
# Build-time (frontend) — única var do app
VITE_BASE_PATH=/rmambiental/   # subpath; casar com basePath do devops.yaml; default já é /rmambiental/
```

> Não há variáveis de runtime (sem backend). No build da imagem, `VITE_BASE_PATH` vem de
> `devops.yaml > services.frontend.build.args` (default em `vite.config.ts`).

## Como trabalhar aqui

- **Rodar local:** `npm install` → `npm run dev` (http://localhost:5173/rmambiental/) → `npm run build`
  → `npm run preview`.
- **Adicionar/ajustar conteúdo:** editar `src/lib/site.ts`, `src/data/*.ts`, `src/components/`,
  `src/pages/`; seguir [`../../docs/standards/golden-path.md`](../../docs/standards/golden-path.md)
  para mudanças que toquem a esteira.
- **Build da imagem (lab):** `docker build -t rmambiental-frontend:local apps/rmambiental`.
- **Publicar/reverter:** `scripts/publish-app.ps1 -App rmambiental` (com aprovação) ou commit dos
  manifests (Argo auto-sync); rollback em
  [`../../docs/runbooks/rollback.md`](../../docs/runbooks/rollback.md).
- **Debugar:** [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) → logs
  `kubectl logs -n apps deploy/rmambiental-frontend`.

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, segredos, GitOps, imagens, recursos) + as específicas de `rmambiental` listadas no
[`AGENTS.md`](./AGENTS.md) §8 (somente-frontend; frontend sem strip; `priority 10`; conteúdo honesto).
