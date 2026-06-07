# 01 - Localhost Availability

## Objetivo da fase

Revisar e sanear o workspace do VS Code para disponibilizar uma task única e confiável de subida local da stack completa (Postgres, API, worker e frontend), executar a cadeia operacional e registrar evidências objetivas do estado final.

## Tentativa adicional de remediação operacional

- Bloqueio inicial confirmado novamente no host Windows:
  - cliente Docker presente;
  - contexto ativo `desktop-linux`;
  - serviço `com.docker.service` parado;
  - pipe `dockerDesktopLinuxEngine` indisponível;
  - nenhuma alternativa local de Postgres detectada via serviço Windows ou binários `psql`/`postgres`/`pg_ctl` no `PATH`.
- Remediação segura executada no host:
  - inicialização do serviço `com.docker.service`;
  - abertura do aplicativo `Docker Desktop.exe` para completar a subida do backend/daemon;
  - revalidação do daemon até o pipe Windows e o `docker ps` responderem normalmente.
- Após o destravamento do Docker, a cadeia operacional equivalente à task final `localhost: up` foi executada com sucesso:
  - `docker compose up -d postgres`
  - `npm run migrate`
  - `npm run validate:openapi`
  - `pwsh -ExecutionPolicy Bypass -File scripts/restart-stack-vscode.ps1`
  - API em modo `dev`
  - worker em modo `worker`
  - frontend em `frontend/` na porta `5174`
- Observação de execução:
  - a chamada automática da task composta `localhost: up` via integração do ambiente não anexou terminal utilizável (`Task started but no terminal was found for: localhost: up`);
  - a definição da task permaneceu válida e a cadeia equivalente foi executada exatamente conforme `dependsOn` configurado em `.vscode/tasks.json`.

## Arquivos analisados

- .vscode/tasks.json
- .vscode/launch.json
- .vscode/settings.json
- .vscode/mcp.json
- scripts/restart-stack-vscode.ps1
- package.json
- frontend/package.json
- docs/handoffs/localhost-stack-validation-tasks/00-orchestration.md

## Decisões

- A task final recomendada passou a ser `localhost: up`, consolidando preparo rápido + restart completo em modo real-dev com frontend.
- Foram mantidas as tasks `real` e `real-dev` existentes, porque ainda são úteis para cenários distintos; o ajuste focou em remover referências quebradas e melhorar a rota principal.
- O arquivo de launch foi alinhado ao runtime TypeScript atual (`tsx` + arquivos `.ts`) para evitar configurações obsoletas apontando para `.js` inexistentes.
- O helper `scripts/restart-stack-vscode.ps1` foi ajustado para encerrar também processos atuais da API e do worker em TypeScript, eliminando o principal risco de restart parcial.

## Tasks revisadas, removidas ou criadas

- Revisada: `stack: restart (real-dev + frontend)`
  - Mantida como etapa operacional intermediária.
- Criada: `localhost: up`
  - Sequência: `stack: prepare quick` -> `stack: restart (real-dev + frontend)`.
  - Objetivo: fornecer um único ponto de entrada confiável para subir a stack local completa.
- Ajustadas referências relacionadas em launch:
  - `Run Stack (localhost)` agora usa `localhost: up`.
  - `Run Stack (real + frontend)` agora usa `localhost: up`.
  - `Open API Docs (8080)` deixou de apontar para task mock inexistente.
- Removidas por substituição lógica no launch:
  - referências a tasks mock inexistentes (`stack: restart (mock + frontend)` e `stack: run (mock)`).

## Comandos e tarefas executados

- Leitura operacional do workspace: `.vscode/tasks.json`, `.vscode/launch.json`, `scripts/restart-stack-vscode.ps1`, `package.json`, `frontend/package.json`.
- Task executada: `stack: prepare quick`
  - Resultado da primeira tentativa: falha imediata em `infra: postgres up` por indisponibilidade do daemon Docker.
- Diagnóstico adicional do host Windows:
  - `docker version`
  - `docker context ls`
  - `Get-Service *docker*`
  - verificação de portas `5432`, `8080`, `5174`
  - busca de alternativas locais de Postgres.
- Remediação adicional executada:
  - `Start-Service com.docker.service`
  - `Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'`
  - rechecagem com `docker version`, `docker info`, `docker ps` e inspeção de pipes `\\.\pipe\*docker*`.
- Execução operacional equivalente à task final `localhost: up`:
  - `docker compose up -d postgres`
  - `npm run migrate`
  - `npm run validate:openapi`
  - `pwsh -ExecutionPolicy Bypass -File scripts/restart-stack-vscode.ps1`
  - API: `npm run dev`
  - worker: `npm run worker`
  - frontend: `Push-Location frontend; npm run dev -- --host 127.0.0.1 --port 5174`
- Validação pós-edição: diagnóstico de `.vscode/tasks.json` e `.vscode/launch.json` sem erros estruturais.

## Status dos componentes

- Postgres: running
  - contêiner `mtr_postgres` ativo e exposto em `localhost:5432`.
- API: running
  - processo HTTP respondendo em `http://127.0.0.1:8080`.
- Worker: running
  - processo `src/worker.ts` ativo e registrado no ambiente.
- Frontend: running
  - Vite respondendo em `http://127.0.0.1:5174/`.

## Portas e URLs esperadas

- Postgres: `localhost:5432`
- API: `http://127.0.0.1:8080`
- API docs: `http://127.0.0.1:8080/docs`
- Frontend: `http://127.0.0.1:5174`

## Evidências objetivas

- Evidência de bloqueio do Postgres ao executar a task `stack: prepare quick`:

```text
Executing task: docker compose up -d postgres
unable to get image 'postgres:16': error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/images/postgres:16/json": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

- Evidência complementar do host Windows:

```text
docker version
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
PORT 5432: not-listening
PORT 8080: not-listening
PORT 5174: not-listening
```

- Evidência objetiva da remediação do host Windows:

```text
Get-Service com.docker.service
Status  Name               DisplayName
------  ----               -----------
Running com.docker.service Docker Desktop Service

docker version
Server: Docker Desktop 4.54.0 (212467)
Engine:
 Version: 29.1.2

docker ps
CONTAINER ID   IMAGE         STATUS                    PORTS
7b43cbbf1ae3   postgres:16   Up (healthy)             0.0.0.0:5433->5432/tcp
b295a09381f1   postgres:16   Up (healthy)             5432/tcp
0520cbaec952   redis:7       Up (healthy)             0.0.0.0:6380->6379/tcp
```

- Evidência objetiva da execução equivalente à task final `localhost: up`:

```text
docker compose up -d postgres
[+] Running 1/1
 ✔ Container mtr_postgres  Running

npm run migrate
[migrate] concluído

npm run validate:openapi
[ok] OpenAPI validado com sucesso
[ok] Política de fonte da verdade CETESB validada com sucesso.
[ok] Nenhum problema de links/âncoras encontrado.
```

- Evidência de portas e processos ativos após a subida:

```text
PORT 5432: listening
PORT 8080: listening
PORT 5174: listening

node.exe ... src/server.ts
node.exe ... src/worker.ts
node.exe ... frontend\node_modules\..\vite\bin\vite.js --host 127.0.0.1 --port 5174
```

- Evidência de URLs disponíveis:

```text
GET http://127.0.0.1:8080/docs -> 200
GET http://127.0.0.1:5174/ -> 200
GET http://127.0.0.1:8080/health/system -> payload retornado com status "degraded"
```

- Evidência detalhada do health endpoint:

```json
{
  "status": "degraded",
  "jobs": {
    "queued": 0,
    "running": 0,
    "retryWait": 0,
    "succeeded1h": 0,
    "failed1h": 0,
    "dlqTotal": 1,
    "avgDurationMs1h": 0
  },
  "workers": {
    "healthy": 19,
    "degraded": 0,
    "active5m": 1,
    "total": 35
  }
}
```

- Evidência do contêiner Postgres da stack local:

```text
docker compose ps
NAME           IMAGE         SERVICE    STATUS      PORTS
mtr_postgres   postgres:16   postgres   Up 2 minutes   0.0.0.0:5432->5432/tcp
```

- Evidência de sanidade do workspace após os ajustes:
  - `.vscode/tasks.json`: sem erros de validação.
  - `.vscode/launch.json`: sem erros de validação.
- Evidência funcional parcial de revisão:
  - As referências quebradas do launch para tasks mock inexistentes foram eliminadas.
  - O restart helper passou a reconhecer `src/server.ts`, `src/worker.ts`, `npm run start` e `npm run worker`, reduzindo risco de processos órfãos na task final.
  - A task final `localhost: up` ficou operacionalmente pronta para uso assim que o Docker Desktop estiver disponível; nesta tentativa, o próprio Docker foi destravado e a cadeia subiu com sucesso.

## Arquivos alterados

- .vscode/tasks.json
- .vscode/launch.json
- scripts/restart-stack-vscode.ps1
- docs/handoffs/localhost-stack-validation-tasks/01-localhost-availability.md

## Status final da fase

- ready_for_qa

## Handoff para tester-qa-mtr

`next_agent_required`

Prompt sugerido para `tester-qa-mtr`:

```text
work_id: localhost-stack-validation-tasks

Fase: 09-qa-validation

Contexto:
- Workspace VS Code revisado.
- Task final recomendada para subir a stack completa: `localhost: up`.
- Launch e helper de restart alinhados ao runtime TypeScript atual.
- Remediação adicional executada com sucesso: Docker Desktop/daemon inicializado no host Windows.
- Stack local disponível com Postgres, API, worker e frontend ativos.
- Evidências objetivas registradas em `docs/handoffs/localhost-stack-validation-tasks/01-localhost-availability.md`.

O que validar na próxima fase:
1) Executar a task `localhost: up`.
2) Confirmar subida de Postgres, API, worker e frontend.
3) Coletar evidências objetivas de portas/URLs e respostas de health/openapi.
4) Registrar resultado em `docs/handoffs/localhost-stack-validation-tasks/09-qa-validation.md`.
```
