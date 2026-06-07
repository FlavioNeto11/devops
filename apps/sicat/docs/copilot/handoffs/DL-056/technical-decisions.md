# Decisões técnicas — DL-056

## 1) Regras de prompt como contrato de compatibilidade
Prompts passam a ser validados com foco em chaves suportadas no frontmatter (`name`, `description`, `agent`, `argument-hint`, `model`, `tools`) e sem sintaxes legadas não suportadas.

## 2) Governança por validação automatizada
A arquitetura de agentes/prompts/handoffs não deve depender apenas de revisão manual. O script `validate-agent-architecture.js` atua como guard-rail obrigatório.

## 3) CI dedicado para estrutura Copilot
Mudanças em `.github/` e `docs/copilot/` passam a ter workflow próprio (`copilot-structure.yml`) para antecipar regressões antes de merge.

## 4) Coerência com bolsões de execução
A documentação de orquestração mantém alinhamento com o modelo de execução por bolsões (síncrono + assíncrono controlado), reduzindo risco de paralelismo com colisão de arquivos.
