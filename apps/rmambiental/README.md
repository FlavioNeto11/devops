# RM Ambiental Brasil — Portal Institucional

Portal corporativo premium (site institucional) da **RM Ambiental Brasil**, publicado na esteira
DevOps local em **`https://dev.nvit.com.br/rmambiental`**.

> Reinterpretação moderna do site atual — **não** uma cópia. Visual corporativo dark (verde profundo +
> azul petróleo + grafite, acentos em verde neon e dourado discreto), serviços reorganizados em 4 frentes,
> animações suaves e alta conversão para contato comercial.

## Stack
- **Vite + React 18 + TypeScript**
- **Tailwind CSS** (design system em `tailwind.config.js`)
- **Framer Motion** (scroll reveal, micro-interações, contadores, modal)
- **lucide-react** (ícones)
- **react-router-dom** (rotas `/`, `/solucoes`, `/contato`, base `/rmambiental`)
- Servido por **nginx** sob o subpath `/rmambiental/` (Traefik sem strip). Sem backend.

## Rodar localmente
```bash
cd apps/rmambiental
npm install
npm run dev        # http://localhost:5173/rmambiental/
npm run build      # gera dist/ (base /rmambiental/)
npm run preview    # serve o build
```

## Estrutura
```
src/
  main.tsx · App.tsx           # bootstrap + rotas + scroll manager
  index.css                    # base + design tokens (utilitários)
  lib/site.ts                  # ⚙️ contato, redes e textos-chave (AJUSTAR placeholders)
  lib/utils.ts
  data/services.ts             # 4 frentes de solução (conteúdo das páginas)
  data/projects.ts             # cases (PLACEHOLDERS — substituir por reais)
  data/sectors.ts              # setores atendidos
  components/                  # Header, Hero, Positioning, ServicesSection, ProcessSection,
                               # AuthoritySection, SectorsSection, ProjectsGallery, ESGSection,
                               # CTASection, ContactSection, Footer, ui, backgrounds
  pages/                       # Home, Solucoes, Contato
```

## ⚙️ O que personalizar (placeholders)
- **`src/lib/site.ts`** — e-mail, WhatsApp (DDI+DDD+nº), cidade, redes sociais. (campos marcados `AJUSTAR`)
- **`src/data/projects.ts`** — cases reais (não inventar números/clientes). As "imagens" são gradientes;
  troque por **fotos reais com direitos** quando houver.
- **`src/components/AuthoritySection.tsx`** — números de autoridade (hoje **ilustrativos**).
- **`Footer.tsx`** — link da Política de Privacidade.
- Imagens: o portal é 100% SVG/CSS (sem imagens de terceiros). Adicione fotos profissionais quando disponíveis.

## Deploy na esteira (lab, sem registry)
```powershell
docker build -t rmambiental-frontend:local apps/rmambiental
kubectl apply -f apps/rmambiental/k8s/rmambiental.yaml
# valida: https://dev.nvit.com.br/rmambiental
```
GitOps: a Application do Argo (`platform/argocd/apps/rmambiental.yaml`) aplica `apps/rmambiental/k8s`
automaticamente após o commit (auto-sync). Roteamento: frontend `priority 10` (vence o portal `/` priority 1),
**sem strip**, base path `/rmambiental/` embutido no build (`vite.config.ts`).
