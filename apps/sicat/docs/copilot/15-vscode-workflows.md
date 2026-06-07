# VS Code workflows locais

## Objetivo

Padronizar no repositório um fluxo simples para desenvolvimento local, debugging e smoke tests usando apenas a pasta `.vscode/`.

Na camada Copilot, pedidos isolados para preparar ambiente local, subir stack ou deixar localhost disponível para validação manual devem ser tratados como operação direta de `estrutura-vscode-mtr`, não como abertura automática de handoff/workstream.

## Arquivos adicionados

- `.vscode/tasks.json`
- `.vscode/launch.json`
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `scripts/smoke-health.js`
- `scripts/smoke-openapi.js`
- `scripts/smoke-manifest-create.js`

## Fluxos recomendados

## Regra de roteamento

- Se o pedido for somente operacional e terminar em localhost disponível, o fluxo esperado é direto em `estrutura-vscode-mtr`.
- Se a disponibilização local fizer parte de uma demanda maior com implementação, QA, documentação ou outro owner, `estrutura-vscode-mtr` entra como fase intermediária da mesma cadeia.

### 1. Preparar ambiente local

Use a task:

- `stack: prepare local`

Ela executa:

1. `npm install`
2. `docker compose up -d postgres`
3. `npm run migrate`
4. `npm run validate:openapi`

### 2. Subir stack local em modo real

Use a task:

- `workflow: bootstrap real`

Ou rode em duas etapas:

- `stack: prepare local`
- `stack: run (real-dev)`

Depois use:

- `smoke: health`
- `smoke: openapi`
- `smoke: manifest create (real)`

### 3. Depurar API e worker

Use os compounds do debugger:

- `Debug API + Worker (real)`

### 4. Rodar contra gateway real

Pré-requisitos:

- `.env` preenchido
- session context válido
- recaptcha resolvido fora da automação quando o bootstrap depender de login real

Tasks relevantes:

- `api: start (real)`
- `worker: run (real)`
- `smoke: health`
- `smoke: openapi`

## Observações

- o smoke de manifesto deve ser executado contra ambiente real configurado
- para fluxo real, `health` e `openapi` continuam sendo os checks mais seguros
- as tasks usam `cwd` no workspace root para reduzir diferença entre terminal manual e execução pelo VS Code
