---
title: "Requisitos Funcionais (FR) — RM Ambiental"
status: canonical
applies_to: [rmambiental]
updated: 2026-06-09
language: pt-BR
---

# FR — RM Ambiental

- **Rota**: `/rmambiental` · **Repo**: `apps/rmambiental` · **Stack**: React 18 + Vite + Tailwind (estático) · **Estado**: 100%

## Propósito
Portal institucional premium da RM Ambiental Brasil: soluções ambientais, georreferenciamento,
galeria de projetos e canais de contato. Tema claro/escuro (claro por padrão).

## Atores
Visitantes (público). Sem login, sem backend.

## Integrações
Nenhuma (SPA estática servida por nginx).

## Estado (pronto vs falta)  ← seed do módulo PM

### Pronto
- Site institucional completo (hero, serviços, galeria com fotos reais, contato).
- Tema claro/escuro; animações (Framer Motion); responsivo.

### Falta
- Nada funcional. Manutenção apenas (conteúdo/imagens sob demanda).

## Perguntas em aberto
- Eventual backend de formulário de contato (hoje inexistente).
