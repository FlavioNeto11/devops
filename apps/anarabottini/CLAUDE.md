---
title: "Ana Rabottini - Manual para Claude Code"
status: canonical
applies_to: [anarabottini]
updated: 2026-06-11
language: pt-BR
---

# Ana Rabottini — Manual para Claude Code

> **Comece por aqui.** As fronteiras de operação e a matriz de decisão vivem no
> [`AGENTS.md`](./AGENTS.md) — leia antes de agir. Este arquivo traz o contexto específico do Claude.
>
> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Máquina:
> [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** esses conteúdos —
> aponte. Padrão desta camada: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).

## O que é este portal

Site institucional/portfólio de **Ana Rabottini** — Neuropsicopedagoga, Psicopedagoga Institucional e
Palestrante Corporativa. Posiciona-a como especialista em **saúde mental corporativa, neurodiversidade
e desenvolvimento humano para adequação à NR-1** (riscos psicossociais no GRO, vigência 2026). Público:
RH, SESMT, gestores e departamentos de pessoas. **Somente-frontend** (SPA Vite/React estática): sem
backend, banco, auth ou segredo. Servido por nginx sob `/anarabottini/`, host `dev.nvit.com.br`
(e `nvit.localhost` no dev). Encaixa na esteira como app `frontend` puro (`expose: true`,
`stripPrefix: false`, `priority: 10`).

## Ordem de leitura

1. Este arquivo.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras + matriz de decisão (obrigatório antes de agir).
3. [`README.md`](./README.md) — setup técnico, estrutura `src/` e placeholders a personalizar.
4. [`docs/status.md`](./docs/status.md) — estado deployado, gaps e próximos passos.

## Stack & decisões de arquitetura

| Aspecto | Decisão | Por quê |
|---|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5 | SPA estática leve, build rápido |
| Estilo | Tailwind CSS 3 + tokens (CSS-vars) em `index.css` | paleta **quente & humanista** (claro) |
| Animação | Framer Motion 11 | scroll reveal, motivo ∞ animado, micro-interações |
| Ícones | `lucide-react` | SVG, sem imagens de terceiros |
| Rotas | `react-router-dom` 6 (`/`, `/contato`), base `/anarabottini` | Home em scroll + contato |
| Backend/Auth | — (nenhum) | site institucional puro |
| Runtime | nginx:alpine servindo `dist/` | imagem mínima, MIME-safe |
| Deploy | Kubernetes (esteira) + Argo CD | `apps/anarabottini/k8s` via auto-sync |

## Armadilhas conhecidas

1. **Base path quebrado** → o build embute `/anarabottini/`; `vite.config.ts` lê
   `process.env.VITE_BASE_PATH` (default `/anarabottini/`). Traefik **não faz strip** — quem ajusta o
   subpath é o build + o nginx, não o ingress.
2. **Assets servindo `application/octet-stream`** → o `nginx.conf` usa **prefixo + alias estático**
   para `/anarabottini/assets/` e `/anarabottini/images/` (nunca `alias` com captura de regex). Nomes
   de asset com separador por ponto em `vite.config.ts`. Ver TROUBLESHOOTING da plataforma (13/14).
3. **Conteúdo placeholder tratado como real** → `src/lib/site.ts` (contato/redes/fotos) está em
   *placeholder vazio*. Não divulgar o link sem preencher os dados reais de Ana. **Nenhuma**
   estatística, cliente, logo ou depoimento é inventado — o conteúdo das palestras é fiel ao material.
4. **Imagens** → o portal é 100% SVG/CSS hoje (retrato em monograma "AR"); fotos reais (com direitos)
   vão em `public/images/` e são servidas por `/anarabottini/images/`.

## Variável de ambiente chave

```bash
VITE_BASE_PATH=/anarabottini/   # subpath; casa com basePath do devops.yaml; default já é /anarabottini/
```

> Não há variáveis de runtime (sem backend). No build da imagem, `VITE_BASE_PATH` vem de
> `devops.yaml > services.frontend.build.args`.

## Como trabalhar aqui

- **Rodar local:** `npm install` → `npm run dev` → `npm run build` → `npm run preview`.
- **Ajustar conteúdo:** `src/lib/site.ts`, `src/data/*.ts`, `src/components/`, `src/pages/`.
- **Build da imagem (lab):** `docker build -t anarabottini-frontend:local apps/anarabottini`.
- **Publicar:** `scripts/publish-app.ps1 -App anarabottini` (com aprovação) ou commit dos manifests
  (Argo auto-sync).
- **Debugar:** `kubectl logs -n apps deploy/anarabottini-frontend`.

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, segredos, GitOps, imagens, recursos) + as específicas listadas no [`AGENTS.md`](./AGENTS.md)
(somente-frontend; frontend sem strip; `priority 10`; conteúdo honesto).
