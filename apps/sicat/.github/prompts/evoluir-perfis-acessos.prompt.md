---
name: evoluir-perfis-acessos
description: 'Evolui o módulo administrativo de Perfis e Acessos do SICAT (RBAC/ABAC, usuários, sessões, políticas, tela de gestão e integração com o sistema).'
agent: perfis-acessos-admin-mtr
argument-hint: descreva a evolução desejada em perfis/acessos (papéis, permissões, políticas, sessões, senha, auditoria e critérios)
---

# Evoluir Módulo de Perfis e Acessos

**Contexto:** criar/evoluir um módulo dedicado para governança de autorização no SICAT, com nova tela de administração para gestão de usuários, perfis, permissões e sessões.

**Agente principal:** `perfis-acessos-admin-mtr`

## Demanda

${input:melhoria_perfis_acessos:Descreva a evolução desejada (ex.: criar papéis RBAC, política por recurso/ação, revogar sessão por usuário, expirar/resetar senha, trilha de auditoria)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios objetivos de pronto ou deixe em branco}

## Fluxo esperado

1. Analisar impacto em frontend, backend, contrato OpenAPI e persistência do módulo de perfis/acessos.
2. Propor estrutura de autorização com controle fino (papéis, permissões, políticas e exceções controladas).
3. Implementar/ajustar tela administrativa para operação global de usuários/sessões.
4. Garantir ações de manutenção com segurança operacional: revogar sessão, atualizar sessão, expirar senha e resetar senha.
5. Escalar para `postgres-queue-mtr` se houver mudanças de schema/migration e para `integrador-cetesb-mtr` se impactar sessão/contexto CETESB real.
6. Validar contrato/build/testes aplicáveis e atualizar decision-log/documentação.

## Resultado esperado

- módulo dedicado de perfis/acessos integrado ao sistema
- nova tela administrativa funcional para governança de usuários/sessões/permissões
- trilha auditável de ações sensíveis por usuário/sessão
- validação técnica e operacional com evidências
