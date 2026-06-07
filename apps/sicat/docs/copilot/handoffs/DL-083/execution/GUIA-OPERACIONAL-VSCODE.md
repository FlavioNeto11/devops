# Guia Operacional VS Code — DL-083

## Objetivo
Padronizar o uso da pasta `.vscode` para reduzir atrito de onboarding e garantir execução previsível dos fluxos locais de desenvolvimento, validação e operação.

## Arquivos de referência
- `.vscode/tasks.json`
- `.vscode/launch.json`
- `.vscode/settings.json`
- `.vscode/extensions.json`

## Fluxos recomendados

### 1) Onboarding (primeiro dia)
1. Executar `stack: prepare local`.
2. Executar `stack: run (mock + frontend)`.
3. Validar ambiente com `workflow: smoke (mock)`.

Resultado esperado:
- API disponível em `http://127.0.0.1:8080`.
- Frontend disponível em `http://127.0.0.1:5174`.
- Worker em execução com modo `mock`.

### 2) Rotina diária (ciclo rápido)
1. Executar `stack: prepare quick`.
2. Executar `stack: restart (mock + frontend)`.
3. Rodar validação rápida com `workflow: validate local (quick)`.

Quando usar:
- desenvolvimento iterativo de API/frontend sem reinstalar dependências.

### 3) Validação mais completa antes de merge
1. Executar `workflow: validate workspace`.
2. Executar `workflow: validate local (full)`.

Cobertura principal:
- validação estrutural de agents/docs/openapi.
- smoke principal da aplicação.
- testes `auth`, `api`, `integration`, `worker` e `source-of-truth` em modo `mock`.

### 4) Execução com integração real
1. Executar `stack: restart (real + frontend)`.
2. Usar launch `Run Stack (real + frontend)` quando precisar abrir frontend + stack pelo debugger.

Observação:
- use modo real apenas quando a tarefa exigir CETESB real.

### 5) Encerramento seguro do ambiente
1. Executar `stack: shutdown`.

Resultado esperado:
- processos Node/Vite encerrados.
- PostgreSQL local parado.

## Launch/debug recomendado

### API/Worker
- `Debug API + Worker (mock)` para desenvolvimento padrão.
- `Debug API + Worker (real)` para investigação de integração real.

### Full stack
- `Debug API + Worker + Frontend (mock)` para fluxo completo local.
- `Debug API + Worker + Frontend (real)` para fluxo completo com CETESB real.

### Navegação rápida
- `Open Frontend (5174)` para abrir somente frontend.
- `Open API Docs (8080)` para abrir `/docs` da API.

## Diagnóstico rápido

### Sintoma: porta já em uso (8080/5174)
Ação:
- executar `stack: stop processes`.
- repetir `stack: restart (mock + frontend)`.

### Sintoma: testes auth/api falham por ambiente
Ação:
- usar tasks `test:*` da `.vscode` (já forçam `CETESB_GATEWAY_MODE=mock`).

### Sintoma: drift de documentação estrutural
Ação:
- executar `workflow: validate workspace`.
- revisar `docs/copilot/13-decision-log.md` (DL-083).

## Governança
- Alterações em `.vscode` devem ser registradas no `DL-083` (ou novo DL quando mudar escopo).
- Evitar criar tarefas duplicadas de scripts já existentes no `package.json`.
- Priorizar tarefas compostas para fluxos recorrentes do time.
