---
name: evoluir-estrutura-vscode
description: 'Evolui a estrutura da pasta .vscode (tasks, launch, settings e recomendações) integrada aos fluxos do repositório.'
agent: estrutura-vscode-mtr
argument-hint: descreva a melhoria desejada na estrutura .vscode, tarefas afetadas e fluxo operacional alvo
---

# Evoluir Estrutura `.vscode`

**Contexto:** aprimorar a estrutura de workspace do VS Code para reduzir atrito operacional e integrar execução local (API, worker, frontend, banco e validações) com padrões consistentes.

**Agente principal:** `estrutura-vscode-mtr`

## Demanda

${input:melhoria_vscode:Descreva a evolução desejada na pasta .vscode (ex.: nova task composta, padronização de problemMatcher, ajustes de launch/configurações, recomendações de extensões)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios objetivos de pronto ou deixe em branco}

## Fluxo esperado

1. Analisar impacto nos arquivos `.vscode/tasks.json`, `.vscode/launch.json`, `.vscode/settings.json` e `.vscode/extensions.json`.
2. Propor ajustes mínimos para melhorar previsibilidade de execução e debug.
3. Preservar compatibilidade com ambiente Windows + PowerShell (`pwsh`).
4. Integrar tasks compostas para fluxos recorrentes (`prepare`, `run`, `restart`, `smoke`, `test`).
5. Escalar para `ci-cd-github-mtr` se houver impacto direto em scripts de pipeline.
6. Atualizar documentação/decision-log quando a mudança for estrutural.

## Resultado esperado

- `.vscode` mais padronizado, integrado e fácil de operar
- tasks e debug com menor ambiguidade de uso
- validação mínima executada com evidência
