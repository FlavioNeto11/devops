# Status — Portal Ana Rabottini

_Atualizado em: 2026-06-10_

## Estado

- App **somente-frontend** (Vite/React/TS/Tailwind), paleta **quente & humanista** (claro),
  seguindo o golden path (modelo: `apps/rmambiental`). Servido em `/anarabottini`.
- **Upgrade interativo** entregue: site para **ver vídeos, acessar materiais, interagir e conhecer**.
  - **Palestras** com **filtro por categoria** (NR-1 / Bem-estar / Neurodiversidade / Liderança /
    Campanhas) e **modal de detalhe** (vídeo, descrição, formatos/duração, temas, benefícios,
    materiais e CTA "Solicitar esta palestra").
  - **Mídia** (galeria de vídeos → lightbox YouTube com carregamento preguiçoso).
  - **Materiais & recursos** (e-books/guias/checklists — download/links).
  - **FAQ** (acordeão educativo sobre a NR-1).
  - **Como trabalho** (linha do tempo do método) + **Abordagem** (valores).
  - **Formulário de proposta** (compõe WhatsApp/e-mail; ou embute formulário externo).
  - **Depoimentos & marcas** (opt-in, ocultos enquanto vazios — sem prova social inventada).
  - **Voltar ao topo** + WhatsApp FAB (este só aparece com número configurado).
- Conteúdo fiel ao material; **nada inventado** (clientes/logos/depoimentos/estatísticas).
- Manifests k8s + `Application` do Argo prontos. Frontend sem strip, `priority 10`.

## Lacunas (preencher antes de divulgar)

Tudo concentrado em **`src/lib/site.ts`** + **`src/data/*.ts`** (placeholders degradam com elegância):

`src/lib/site.ts`:
- [ ] `contact.email`, `contact.whatsapp` (+ `whatsappLabel`), `contact.city`/`state`
- [ ] `social.instagram` / `social.linkedin`
- [ ] `media.youtube` (canal) / `media.spotify` (opcional)
- [ ] `forms.embedUrl` (opcional — Google Forms/Typeform; se vazio, usa o formulário nativo)
- [ ] `photos.hero` / `photos.about` (arquivos em `public/images/`)

`src/data/`:
- [ ] `videos.ts` → `youtubeId` de cada vídeo (vazio = "vídeos em breve")
- [ ] `materiais.ts` → `url` + `available:true` (PDFs em `public/materiais/`)
- [ ] `palestras.ts` → `videoId` / `materiais` por palestra (opcional)
- [ ] `depoimentos.ts` → `depoimentos`/`marcas` reais (opcional; seção oculta enquanto vazia)

## Próximos passos

1. Validar local: `npm install && npm run build && npm run preview`.
2. Build da imagem + apply local; smoke em `http://nvit.localhost/anarabottini/`.
3. Commit + push → Argo sincroniza → `https://dev.nvit.com.br/anarabottini/`.
4. (Opcional) Workflow de CI/GHCR copiado do template para build/push automatizado.
