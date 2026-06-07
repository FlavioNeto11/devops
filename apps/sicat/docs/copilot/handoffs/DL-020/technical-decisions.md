# DL-020: Technical Decisions

## Decisão 1: Worker Submit Está Correto
**Data:** 2026-03-09  
**Contexto:** 19 manifestos travados sem `manCodigo/manNumero`

**Opções:**
1. Corrigir worker para popular esses campos
2. Aceitar que CETESB não retorna esses dados no submit

**Decisão:** Opção 2 - Aceitar limitação CETESB

**Justificativa:**
- HAR mostra que CETESB retorna apenas `manHashCode` no submit
- `manCodigo/manNumero` só são obtidos via lookup posterior
- Worker já persiste corretamente os dados quando disponíveis

**Impacto:**
- ✅ Worker não precisa alteração
- ✅ Cancelamento deve sempre fazer lookup antes
- ⚠️ Dependência de timing (indexação CETESB)

---

## Decisão 2: Gateway Lookup com Retry (Já Implementado)
**Data:** 2026-03-09 (confirmado em DL-019)  
**Contexto:** Cancelamento precisa de `manCodigo/manNumero`

**Opções:**
1. Falhar imediatamente se lookup retornar 404
2. Implementar retry com backoff
3. Implementar retry com delays fixos

**Decisão:** Opção 2 - Retry com backoff (JÁ IMPLEMENTADO)

**Estratégia:**
```javascript
maxAttempts: 5
delays: [2000, 5000, 10000, 15000, 20000] // ms
Total delay: ~50 segundos
```

**Justificativa:**
- CETESB pode ter delay entre submit e indexação
- Backoff evita sobrecarregar API CETESB
- 50s é tempo razoável para aguardar indexação

**Impacto:**
- ✅ Reduz falhas por timing issue
- ⚠️ Pode não ser suficiente para MTRs muito recentes
- ⚠️ Worker pode ficar bloqueado durante retry

---

## Decisão 3: Batch Cleanup com Requeue
**Data:** 2026-03-09  
**Contexto:** 20 manifestos travados em `submitting`

**Opções:**
1. Marcar todos como erro
2. Requeue jobs recuperáveis, erro nos irrecuperáveis
3. Deletar manifestos travados

**Decisão:** Opção 2 - Requeue seletivo

**Critérios de Irrecuperável:**
- Erro de negócio CETESB ("não possui o perfil")
- Erro de validação CETESB (CNPJ inválido, etc)

**Critérios de Recuperável:**
- Erro HTTP 400 genérico (payload pode estar incorreto mas corrigível)
- Timeout
- Erro de rede

**Justificativa:**
- Preservar dados quando possível
- Evitar reprocessar erros permanentes
- Dar segunda chance a erros temporários

**Impacto:**
- ✅ 19 manifestos requeued (podem ser processados novamente)
- ✅ 1 manifesto marcado erro (não desperdiça tentativas)
- ⚠️ Se payload continuar inválido, irão para DLQ novamente

---

## Decisão 4: Teste E2E com Manifesto Existente
**Data:** 2026-03-09  
**Contexto:** Evitar timeout criando novo manifesto

**Opções:**
1. Criar novo manifesto + submit + cancel (E2E completo)
2. Usar manifesto existente já submitted
3. Mockar lookup CETESB

**Decisão:** Opção 2 - Usar manifesto existente

**Justificativa:**
- Isola teste de cancelamento (não depende de submit bem-sucedido)
- Evita timeout de polling submit
- Mais rápido para validar fluxo

**Impacto:**
- ✅ Teste mais focado
- ⚠️ Não valida submit → cancel completo
- ⚠️ Depende de manifesto já indexado pela CETESB

**Bloqueio Encontrado:**
- Mesmo manifestos existentes não têm `manCodigo/manNumero` populados
- Lookup retorna 404 mesmo para manifestos antigos
- **Possível problema:** endpoint lookup incorreto ou parâmetros faltantes

---

## Decisão 5: Não Aumentar Retry Strategy
**Data:** 2026-03-09  
**Contexto:** Lookup 404 persistente mesmo com 5 tentativas

**Opções:**
1. Aumentar delays (ex: até 60s)
2. Aumentar tentativas (ex: 10 tentativas)
3. Manter estratégia atual e investigar lookup

**Decisão:** Opção 3 - Investigar lookup antes

**Justificativa:**
- 50s de delay já é significativo
- Se lookup está falhando após 5 tentativas, problema pode ser outro
- Aumentar delays pode bloquear worker por muito tempo

**Próximos passos:**
1. Validar endpoint lookup está correto
2. Verificar se há parâmetros adicionais necessários
3. Testar lookup manualmente com curl/Postman

**Impacto:**
- ⏸️ Teste E2E bloqueado até investigação
- ✅ Evita mascarar problema real
- ✅ Worker não fica bloqueado por tempo excessivo

---

## Decisão 6: Script Cleanup Reutilizável
**Data:** 2026-03-09  
**Contexto:** Pode haver futuros manifestos travados

**Opções:**
1. Script one-off descartável
2. Script reutilizável com dry-run
3. Automatizar cleanup via cron/scheduler

**Decisão:** Opção 2 - Script reutilizável com dry-run

**Features:**
- Dry-run mode (`--dry-run`)
- Categorização automática (recuperável vs irrecuperável)
- Relatório detalhado
- SQL parametrizado e seguro

**Justificativa:**
- Problema pode ocorrer novamente (payload inválido, timeout CETESB)
- Dry-run permite validar antes de executar
- Reutilizável economiza tempo em futuros incidentes

**Impacto:**
- ✅ Ferramenta de manutenção disponível
- ✅ Pode ser executada sem risco (dry-run)
- ⚠️ Requer conhecimento SQL para modificar critérios

**Localização:** `scripts/fix-stuck-manifests.js`

---

## Resumo de Decisões

| # | Decisão | Status | Impacto |
|---|---------|--------|---------|
| 1 | Worker correto (CETESB limita dados) | ✅ | Aceitar limitação |
| 2 | Gateway retry (já implementado) | ✅ | Reduz timing issues |
| 3 | Batch cleanup seletivo | ✅ | 19 requeued, 1 erro |
| 4 | Teste com manifesto existente | ⏸️ | Bloqueado (lookup 404) |
| 5 | Não aumentar retry (investigar) | ⏸️ | Evita mascarar problema |
| 6 | Script cleanup reutilizável | ✅ | Ferramenta disponível |

---

## Lições para Futuras Integrações

1. **Validar HAR antes de implementar** - Confirmar que API retorna dados esperados
2. **Lookup pode ser obrigatório** - Nem sempre submit retorna dados completos
3. **Timing matters** - Indexação pode ter delay significativo
4. **Retry strategy é essencial** - Mas deve ter limite razoável
5. **Batch tools são valiosos** - Scripts reutilizáveis economizam tempo
6. **Dry-run sempre** - Validar antes de executar operações destrutivas
