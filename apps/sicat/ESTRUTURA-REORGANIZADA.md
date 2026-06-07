# Reorganização da Estrutura do Projeto SICAT

**Data**: 2026-03-09  
**Contexto**: Limpeza e organização de arquivos dispersos na raiz do projeto

## Movimentações Realizadas

### 1. Testes Manuais/Ad-hoc → `tests/manual/`

Arquivos de teste criados durante desenvolvimento e troubleshooting foram centralizados:

- `auto-start-and-test.js`
- `check-job-status.js`
- `debug-token.js`
- `extract-auth-details.js`
- `extract-har-token.js`
- `get-job-error.js`
- `run-next-steps.js`
- `test-cancel-existing.js`
- `test-cancel-mtr.js`
- `test-cetesb-login-direct.js`
- `test-mtr-fixed.js`
- `test-mtr-offline-simulation.js`
- `test-mtr-real-token.js`
- `test-real-mtr-creation.js`
- `test-token-direct.js`
- `validate-mtr-auth.js`

**Localização**: `tests/manual/`  
**Uso**: Scripts auxiliares para debug e validação manual de funcionalidades

### 2. Documentação → `docs/`

Toda documentação técnica, guias e relatórios foram consolidados:

- `CHANGELOG-DL-020.md` → `docs/CHANGELOG-DL-020.md`
- `EXECUTION-GUIDE.md` → `docs/EXECUTION-GUIDE.md`
- `MTR-REAL-AUTH-COMPLETE.md` → `docs/MTR-REAL-AUTH-COMPLETE.md`
- `MTR-TEST-REAL-AUTH-SUMMARY.md` → `docs/MTR-TEST-REAL-AUTH-SUMMARY.md`
- `REAL_TESTING_QUICK_START.md` → `docs/REAL_TESTING_QUICK_START.md`
- `START-HERE-MTR-TEST.md` → `docs/START-HERE-MTR-TEST.md`
- `START_HERE.md` → `docs/START_HERE.md`
- `TEST-EXECUTION-REPORT.md` → `docs/TEST-EXECUTION-REPORT.md`

**Subpasta Handoffs**: `docs/handoffs/`

Artefatos relacionados a handoffs entre agentes:

- `COMMIT-MESSAGE-HANDOFF-UNIFICADO.txt`
- `COMPLETION-SUMMARY.txt`
- `EXECUTOR-HANDOFFS-SUMARIO.md`
- `IMPLEMENTACAO-EXECUTOR-HANDOFFS-FINAL.md`

### 3. Scripts Shell/PowerShell → `scripts/`

Scripts de automação e testes foram movidos para a pasta de scripts:

- `run-real-tests.ps1` → `scripts/run-real-tests.ps1`
- `run-tests.ps1` → `scripts/run-tests.ps1`
- `test-real-cetesb.ps1` → `scripts/test-real-cetesb.ps1`
- `test-real-cetesb.sh` → `scripts/test-real-cetesb.sh`

### 4. Arquivos Temporários/JSON → `storage/temp/`

Dados temporários, credenciais de teste e análises foram isolados:

- `REAL_CETESB_CREDENTIALS.json` → `storage/temp/REAL_CETESB_CREDENTIALS.json`
- `temp-har-analysis.json` → `storage/temp/temp-har-analysis.json`
- `test-login.json` → `storage/temp/test-login.json`
- `test-result-mtrrealauth.json` → `storage/temp/test-result-mtrrealauth.json`

**⚠️ Atenção**: Esta pasta contém dados sensíveis e temporários - está no `.gitignore`

## Estrutura Final do Projeto

```
sicat/
├── .github/                # Configurações GitHub + Copilot instructions
├── .vscode/                # Configurações VS Code
├── certs/                  # Certificados SSL/TLS
├── docs/                   # 📁 DOCUMENTAÇÃO CONSOLIDADA
│   ├── cetesb/            # HARs e documentação CETESB
│   ├── copilot/           # Contexto e guias Copilot
│   ├── handoffs/          # 📁 NOVO: Artefatos de handoff entre agentes
│   ├── CHANGELOG-DL-020.md
│   ├── EXECUTION-GUIDE.md
│   ├── MTR-*.md
│   ├── REAL_TESTING_QUICK_START.md
│   ├── START*.md
│   └── TEST-EXECUTION-REPORT.md
├── examples/               # Exemplos de request/response OpenAPI
├── openapi/                # Especificação OpenAPI
├── scripts/                # Scripts de automação, validação, smoke
│   ├── run-real-tests.ps1      # 📁 MOVIDO
│   ├── run-tests.ps1           # 📁 MOVIDO
│   ├── test-real-cetesb.ps1    # 📁 MOVIDO
│   ├── test-real-cetesb.sh     # 📁 MOVIDO
│   ├── cancelar-manifestos-*.js
│   ├── fix-stuck-manifests.js
│   └── ...
├── src/                    # Código-fonte principal
│   ├── db/
│   ├── gateways/
│   ├── lib/
│   ├── middlewares/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── workers/
│   ├── app.js
│   ├── server.js
│   └── worker.js
├── storage/                # Armazenamento persistente + temporário
│   └── temp/              # 📁 NOVO: Arquivos temporários/JSONs de teste
│       ├── REAL_CETESB_CREDENTIALS.json
│       ├── temp-har-analysis.json
│       ├── test-login.json
│       └── test-result-mtrrealauth.json
├── tests/                  # Testes automatizados + manuais
│   ├── api/
│   ├── fixtures/
│   ├── integration/
│   ├── manual/            # 📁 NOVO: Testes ad-hoc/debug
│   │   ├── auto-start-and-test.js
│   │   ├── check-job-status.js
│   │   ├── debug-token.js
│   │   ├── extract-*.js
│   │   ├── get-job-error.js
│   │   ├── run-next-steps.js
│   │   ├── test-cancel-*.js
│   │   ├── test-cetesb-login-direct.js
│   │   ├── test-mtr-*.js
│   │   ├── test-real-mtr-creation.js
│   │   ├── test-token-direct.js
│   │   └── validate-mtr-auth.js
│   ├── smoke/
│   ├── unit/
│   └── worker/
├── .env.example
├── .gitignore             # ✅ Atualizado com novas regras
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

## Atualização do `.gitignore`

Novas regras adicionadas:

```gitignore
# Temporary files and test data
storage/temp/*.json
storage/temp/*.txt
storage/temp/*.har
tests/manual/*.json
tests/manual/*.txt

# Credentials and sensitive data
*CREDENTIALS*.json
*credentials*.json

# Documentation artifacts
docs/handoffs/*.txt
```

## Benefícios da Reorganização

1. **Raiz limpa**: Apenas arquivos essenciais (README, package.json, docker-compose, etc)
2. **Documentação centralizada**: Tudo em `docs/` com subpastas temáticas
3. **Testes separados**: Automáticos vs manuais/ad-hoc claramente distinguidos
4. **Scripts organizados**: Todos em `scripts/` com nomenclatura consistente
5. **Dados temporários isolados**: Credenciais e JSONs de teste em `storage/temp/`
6. **Segurança**: `.gitignore` atualizado para evitar commit de dados sensíveis

## Uso Pós-Reorganização

### Executar testes manuais
```bash
node tests/manual/test-mtr-fixed.js
node tests/manual/check-job-status.js
```

### Executar scripts de automação
```bash
# PowerShell
pwsh scripts/run-real-tests.ps1

# Bash
bash scripts/test-real-cetesb.sh
```

### Acessar documentação
- Guias de início: `docs/START*.md`
- Changelog DL-020: `docs/CHANGELOG-DL-020.md`
- Contexto Copilot: `docs/copilot/`
- HARs CETESB: `docs/cetesb/`

### Dados temporários
```bash
ls storage/temp/  # Ver arquivos temporários
# ⚠️ NÃO fazer commit desta pasta
```

## Próximos Passos Sugeridos

1. **Revisar scripts em `tests/manual/`**: Identificar quais podem ser convertidos em testes automatizados
2. **Consolidar documentação**: Avaliar se há duplicação em `docs/` e `docs/copilot/`
3. **Padronizar nomenclatura**: Alguns arquivos ainda usam `UPPERCASE.md` vs `lowercase.md`
4. **Criar índice**: Um `docs/INDEX.md` listando toda documentação disponível
5. **Limpar `storage/temp/`**: Periodicamente remover arquivos obsoletos

## Referências

- **Reorganização executada em**: 2026-03-09
- **Contexto**: Limpeza pós DL-020 (cancelamento MTR + lookup CETESB)
- **Agente responsável**: `orquestrador-mtr`
- **Aprovação**: Pendente review do desenvolvedor
