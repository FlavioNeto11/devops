---
title: "Checklist de UX & Acessibilidade — Portal NovaIT"
status: reference
applies_to: [portal]
updated: 2026-06-13
language: pt-BR
---

# Checklist de UX & Acessibilidade — Portal NovaIT

> Validação manual + automatizada da experiência. Pré-visualize com
> `npx --yes serve -l 5055 portal/frontend`.

## Navegação & jornada
- [x] Navegação por categorias: Produtos · Portais · Capacidades · Plataforma
- [x] CTAs padronizados (verbo + destino): "Acessar SICAT", "Abrir Grafana", etc.
- [x] Indicação de "exige login" (SICAT, GymOps, Grafana, Argo CD, Keycloak)
- [x] Indicação de "interno" nas ferramentas da plataforma
- [x] Busca/filtro client-side com contador de resultados
- [x] Estado **loading** (skeleton) ao consultar o cluster
- [x] Estado **erro** amigável (alerta acessível + "Tentar novamente")
- [x] Estado **vazio** (nenhuma app extra publicada)
- [x] Botão "voltar ao topo" (aparece após rolar)
- [x] Âncoras funcionais do menu (`#produtos`, `#portais`, ...) com seção ativa destacada
- [x] Página **404** amigável com link de retorno

## Responsividade
- [x] Layout perfeito em desktop / tablet / mobile (375px)
- [x] Menu hamburger no mobile (abre/fecha, ícone alterna, fecha com `Esc`/clique)
- [x] Grid de cards responsivo (3 → 2 → 1 coluna)
- [x] Áreas de toque adequadas; fontes legíveis; sem overflow horizontal
- [x] Verificado nos breakpoints comuns via DevTools/preview

## Acessibilidade (WCAG AA)
- [x] HTML semântico: `header`/`nav`/`main`/`section`/`footer`
- [x] **Um** `<h1>`; ordem lógica de headings
- [x] Skip link "Pular para o conteúdo" (visível ao foco)
- [x] Landmarks com `aria-label`/`aria-labelledby`; `role="search"`; região `aria-live`
- [x] Foco visível e consistente (`:focus-visible`) em todos os interativos
- [x] Navegação por teclado (links/botões focáveis; menu/`Esc`)
- [x] Imagens/ícones decorativos com `aria-hidden`; logo com `aria-label`
- [x] Estado não comunicado **só** por cor (badges têm texto + ícone/ponto)
- [x] `prefers-reduced-motion` respeitado (sem animações)
- [x] Contraste AA (texto/elementos) nos temas claro e escuro
- [ ] Auditoria axe/Lighthouse Accessibility registrada (ver comando abaixo)

## Consistência visual
- [x] Design tokens centralizados (cores, espaçamento, raio, sombra, tipografia)
- [x] Modo escuro automático (`prefers-color-scheme`) sem vazar superfícies claras
- [x] Cards padronizados (mesma estrutura/altura/estados hover-focus)
- [x] Microinterações leves em hover/focus; nada pesado para o notebook

## Como auditar acessibilidade
```powershell
# axe via Lighthouse (precisa de Chrome)
npx --yes serve -l 5055 C:\devops\portal\frontend
npx --yes lighthouse http://localhost:5055 --only-categories=accessibility --view

# ou axe-core CLI
npx --yes @axe-core/cli http://localhost:5055
```

> Itens `[ ]` exigem Chrome/headless e ficam como passo manual documentado — não bloqueiam o
> gate automatizado (`npm run validate`), que cobre estrutura, CTAs, rotas e estados.
