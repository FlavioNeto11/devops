# Ana Rabottini — Contrato de Operação (Agentes)

> Fronteiras de operação e matriz de decisão para qualquer agente que atue neste app.
> Contexto e stack: [`CLAUDE.md`](./CLAUDE.md). Plataforma: [`../../AGENTS.md`](../../AGENTS.md).
> Regras HARD: [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md).

## 1. Visão

Portal institucional/portfólio **somente-frontend** (SPA Vite/React estática) de Ana Rabottini —
palestrante corporativa de saúde mental, neurodiversidade e NR-1. Sem backend, banco, auth ou segredo.
Servido por nginx sob `/anarabottini/` (Traefik **sem strip**, `priority 10`).

## 2. Matriz de decisão

| Operação | Classe | Observação |
|---|---|---|
| Editar conteúdo/estilo (`src/`, `public/`) | ✅ Autônoma | manter honestidade de conteúdo |
| `npm install` / `build` / `preview` | ✅ Autônoma | validação local |
| `docker build ... :local` | ✅ Autônoma | imagem local do laboratório |
| `kubectl apply` / `publish-app.ps1` | ⚠️ Com aprovação | toca o cluster |
| Commit + push (Argo auto-sync) | ⚠️ Com aprovação | publica em `dev.nvit.com.br` |
| Alterar labels/nome de recurso vivo sob Argo | ⛔ Proibida sem plano | quebra GitOps |
| Inventar cliente/logo/depoimento/estatística | ⛔ Proibida | regra de honestidade |
| Commitar `dist/` ou segredo | ⛔ Proibida | `.gitignore` exclui `dist/` |

## 3. Regras específicas (inegociáveis)

1. **Somente-frontend.** Não adicionar backend, API, auth ou banco. Se precisar de formulário com
   envio, usar canal externo (WhatsApp/`mailto`) — nunca um endpoint próprio aqui.
2. **Roteamento.** Frontend **sem** `stripPrefix`, `priority: 10`. Base path `/anarabottini/` é
   embutido no build (`VITE_BASE_PATH`) e servido pelo nginx — Traefik não strippa.
3. **Conteúdo honesto.** Texto das palestras/consultoria é fiel ao material fornecido. **Não**
   inventar números, clientes, logos, prêmios ou depoimentos. Contato/fotos são placeholders em
   `src/lib/site.ts` até Ana fornecer os dados reais.
4. **Imagens.** Só fotos com direito de uso, em `public/images/`. Nunca usar foto de terceiros como
   placeholder — o placeholder é o monograma "AR" gerado em CSS/SVG.
5. **MIME-safe nginx.** Manter o padrão de `alias` estático (sem regex) para `/assets/` e `/images/`.

## 4. Checklist de validação

- [ ] `npm run build` e `npm run typecheck` sem erros (TypeScript estrito).
- [ ] `npm run preview` carrega em `/anarabottini/` (assets OK, sem 404/octet-stream).
- [ ] `docker build -t anarabottini-frontend:local apps/anarabottini` ok.
- [ ] `/anarabottini/healthz` → `ok`; `/anarabottini` (sem barra) → 301.
- [ ] Console `/devops`: app agrupado por `part-of: anarabottini` (Apps/Publicações/Health).
- [ ] **Registrado na plataforma** (golden-path §9): Projetos & Tarefas
      (`console/pm-api/scripts/seed.js`), Compartilhados
      (`console/pm-api/src/data/shared-resources.json`), card no portal raiz
      (`portal/frontend/index.html`) e Application do Argo na `main`.
- [ ] `src/lib/site.ts` revisado (placeholders preenchidos antes de divulgar o link).
