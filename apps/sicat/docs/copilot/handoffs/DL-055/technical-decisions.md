# Decisões técnicas — DL-055

## 1) Frontmatter obrigatório como contrato de roteamento
A troca de agente no VS Code depende da resolução de metadados dos arquivos `.agent.md`. Por isso, o frontmatter foi definido como requisito estrutural obrigatório para todos os agentes.

## 2) Handoffs do orquestrador devem ser parseáveis
Um único bloco YAML inválido em `handoffs` pode inviabilizar resolução de delegação. A correção de indentação no `orquestrador-mtr` foi tratada como prioridade de estabilidade.

## 3) Paralelismo seguro por bolsões
Paralelismo irrestrito aumenta risco de colisão de arquivos e regressão. Foi adotado modelo de bolsões:
- bolsos síncronos para camadas com dependência forte;
- bolso assíncrono somente para camadas com escopo independente.

## 4) Guard-rail automatizado
Foi criado validador automático de arquitetura para impedir regressão silenciosa de:
- metadados de agente;
- mapeamento prompt→agent;
- referências de handoff no orquestrador.
