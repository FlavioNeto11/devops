# Portal Ana Rabottini

Site institucional/portfólio de **Ana Rabottini** — Neuropsicopedagoga · Psicopedagoga
Institucional · Palestrante Corporativa. Posicionamento: **saúde mental corporativa,
neurodiversidade e desenvolvimento humano para adequação à NR-1**.

App **somente-frontend** (SPA Vite + React + TS + Tailwind), servido por nginx sob o subpath
`/anarabottini/` na esteira DevOps local. Host `dev.nvit.com.br` (e `xpto.localhost` no dev).

## Rodar local

```bash
npm install
npm run dev       # http://localhost:5173/anarabottini/
npm run build     # gera dist/
npm run preview   # http://localhost:4173/anarabottini/
```

## Personalizar conteúdo

Tudo o que é específico de Ana vive em poucos lugares:

- **`src/lib/site.ts`** — identidade + **contato/redes/fotos** (hoje em *placeholder*).
  > ⚠️ **Preencher antes de divulgar**: `contact.email`, `contact.whatsapp` (+ `whatsappLabel`),
  > `contact.city`/`state`, `social.instagram`, `social.linkedin`, e `photos.hero`/`photos.about`.
  > Enquanto vazios: os CTAs levam à página `/contato`, o FAB de WhatsApp não aparece e os canais
  > exibem "a definir" — sem links quebrados.
- **`src/data/palestras.ts`** — as 6 palestras do portfólio.
- **`src/data/trilhas.ts`** — Diagnóstico Educativo + Trilhas de Desenvolvimento.
- **`public/images/`** — fotos reais (com direito de uso); referenciadas por `site.photos.*`.

## Build da imagem (lab) e publicação

```bash
docker build -t anarabottini-frontend:local apps/anarabottini
kubectl apply -f apps/anarabottini/k8s/anarabottini.yaml
# ou (com aprovação): scripts/publish-app.ps1 -App anarabottini
```

GitOps: a `Application` do Argo em `platform/argocd/apps/anarabottini.yaml` sincroniza
`apps/anarabottini/k8s` automaticamente. Validar em `http://xpto.localhost/anarabottini/`.

## Stack

Vite 5 · React 18 · TypeScript 5 · Tailwind 3 · Framer Motion 11 · lucide-react · react-router-dom 6 ·
nginx:alpine (runtime). Sem backend, banco, auth ou segredo.

> Antes de mexer: leia [`CLAUDE.md`](./CLAUDE.md) e [`AGENTS.md`](./AGENTS.md).
