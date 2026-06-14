# Portal Ana Rabottini

Site institucional/portfólio de **Ana Rabottini** — Neuropsicopedagoga · Psicopedagoga
Institucional · Palestrante Corporativa. Posicionamento: **saúde mental corporativa,
neurodiversidade e desenvolvimento humano para adequação à NR-1**.

App **somente-frontend** (SPA Vite + React + TS + Tailwind), servido por nginx sob o subpath
`/anarabottini/` na esteira DevOps local. Host `dev.nvit.com.br` (e `nvit.localhost` no dev).

## Rodar local

```bash
npm install
npm run dev       # http://localhost:5173/anarabottini/
npm run build     # gera dist/
npm run preview   # http://localhost:4173/anarabottini/
```

## Personalizar conteúdo

Tudo o que é específico de Ana vive em poucos lugares:

- **`src/lib/site.ts`** — identidade + **contato/redes/fotos/mídia/formulário** (hoje em *placeholder*).
  > ⚠️ **Preencher antes de divulgar**: `contact.*` (email, whatsapp + `whatsappLabel`, city/state),
  > `social.instagram`/`linkedin`, `media.youtube`/`spotify`, `forms.embedUrl` (opcional —
  > Google Forms/Typeform), e `photos.hero`/`photos.about`.
  > Enquanto vazios: os CTAs levam à `/contato`, o FAB de WhatsApp não aparece, a Mídia mostra
  > "vídeos em breve" e os canais exibem "a definir" — sem links quebrados.
- **`src/data/palestras.ts`** — as 6 palestras (categoria, descrição, formatos, `videoId`, `materiais`).
- **`src/data/videos.ts`** — galeria de vídeos (preencher `youtubeId`).
- **`src/data/materiais.ts`** — e-books/guias/checklists (`url` + `available:true`; PDFs em `public/materiais/`).
- **`src/data/faq.ts`** — perguntas frequentes (conteúdo educativo).
- **`src/data/depoimentos.ts`** — depoimentos/marcas reais (opt-in; seção some quando vazia).
- **`src/data/trilhas.ts`** — Diagnóstico Educativo + Trilhas de Desenvolvimento.
- **`public/images/`** e **`public/materiais/`** — mídia real (com direito de uso).

## Build da imagem (lab) e publicação

```bash
docker build -t anarabottini-frontend:local apps/anarabottini
kubectl apply -f apps/anarabottini/k8s/anarabottini.yaml
# ou (com aprovação): scripts/publish-app.ps1 -App anarabottini
```

GitOps: a `Application` do Argo em `platform/argocd/apps/anarabottini.yaml` sincroniza
`apps/anarabottini/k8s` automaticamente. Validar em `http://nvit.localhost/anarabottini/`.

## Stack

Vite 5 · React 18 · TypeScript 5 · Tailwind 3 · Framer Motion 11 · lucide-react · react-router-dom 6 ·
nginx:alpine (runtime). Sem backend, banco, auth ou segredo.

> Antes de mexer: leia [`CLAUDE.md`](./CLAUDE.md) e [`AGENTS.md`](./AGENTS.md).
