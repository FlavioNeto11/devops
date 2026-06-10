# Status — Portal Ana Rabottini

_Atualizado em: 2026-06-10_

## Estado

- **Scaffold completo** seguindo o golden path (modelo: `apps/rmambiental`).
- App **somente-frontend** (Vite/React/TS/Tailwind), paleta **quente & humanista** (claro).
- Conteúdo fiel ao material: 6 palestras, consultoria (Diagnóstico + Trilhas), gancho NR-1/2026,
  enquadramento honesto ("não transfere a responsabilidade da empresa").
- Manifests k8s (`k8s/anarabottini.yaml`) + `Application` do Argo
  (`platform/argocd/apps/anarabottini.yaml`) prontos. Frontend sem strip, `priority 10`.

## Lacunas (preencher antes de divulgar)

Tudo concentrado em **`src/lib/site.ts`** (placeholders vazios — degradam com elegância):

- [ ] `contact.email`
- [ ] `contact.whatsapp` (E.164, só dígitos) + `contact.whatsappLabel`
- [ ] `contact.city` / `contact.state`
- [ ] `social.instagram` / `social.linkedin`
- [ ] `photos.hero` / `photos.about` (arquivos em `public/images/`, com direito de uso)

Enquanto vazios: CTAs levam à página `/contato`; FAB de WhatsApp oculto; canais exibem "a definir".

## Próximos passos

1. Validar local: `npm install && npm run build && npm run preview`.
2. Build da imagem + apply local; smoke test em `http://xpto.localhost/anarabottini/`.
3. Commit + push → Argo sincroniza → `https://dev.nvit.com.br/anarabottini/`.
4. (Opcional) Workflow de CI/GHCR copiado do template para build/push automatizado.
