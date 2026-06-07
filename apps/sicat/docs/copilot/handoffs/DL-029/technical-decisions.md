# Decisões Técnicas - DL-029

## 1. Default para modo 'real' (não 'mock')

**Decisão:** Alterar o default de `CETESB_GATEWAY_MODE` de `'mock'` para `'real'`

**Contexto:**
- Sistema estava com mock como padrão desde início do desenvolvimento
- Agora que integração real está validada (DL-028), faz sentido inverter
- Produção deve sempre usar modo real
- Desenvolvedores podem sobrescrever para mock quando necessário

**Alternativas consideradas:**
1. ❌ Manter mock como default → Requer configuração extra em produção
2. ❌ Remover modo mock → Dificulta testes locais sem CETESB
3. ✅ **Real como default, mock via env var** → Melhor DX e segurança

**Impacto:**
- **Produção:** Comportamento desejado sem configuração extra
- **Desenvolvimento:** Requer `CETESB_GATEWAY_MODE=mock` para testes sem CETESB
- **CI/CD:** Deve setar `CETESB_GATEWAY_MODE=mock` se não tiver credenciais reais

---

## 2. Preservar modo mock opcional

**Decisão:** Manter suporte ao modo mock via variável de ambiente

**Contexto:**
- Testes unitários não devem depender de API externa
- Desenvolvedores precisam trabalhar offline
- CI/CD pode não ter acesso a credenciais reais

**Justificativa:**
- Backward compatibility
- Flexibilidade para ambientes de teste
- Permite TDD sem dependência externa

**Implementação:**
```javascript
// src/lib/config.js
get cetesbGatewayMode() { 
  return getConfigValue(
    'cetesbGatewayMode', 
    process.env.CETESB_GATEWAY_MODE || 'real'  // default alterado
  ); 
}
```

---

## 3. Não alterar package.json scripts

**Decisão:** Não adicionar `CETESB_GATEWAY_MODE` nos scripts npm

**Contexto:**
- Scripts atuais não especificam modo (usam default do config)
- Adicionar nos scripts hardcodaria o comportamento

**Justificativa:**
- Manter flexibilidade via env vars
- Permitir override local sem alterar código
- Seguir princípio de configuração via ambiente

**Exemplo de uso:**
```powershell
# Modo real (padrão)
npm run start

# Modo mock (override)
$env:CETESB_GATEWAY_MODE='mock'; npm run start
```

---

## 4. Documentação explícita no README

**Decisão:** Destacar modo padrão e modo opcional na documentação

**Contexto:**
- Desenvolvedores precisam saber qual é o comportamento padrão
- Documentação anterior não deixava claro que mock era padrão

**Implementação:**
```markdown
**Modo de operação (padrão: real):**
- `CETESB_GATEWAY_MODE=real` (padrão - conecta com CETESB real)
- `CETESB_GATEWAY_MODE=mock` (opcional - usa dados mock locais)
```

---

## Resumo
- ✅ Real como padrão alinha com ambiente de produção
- ✅ Mock ainda disponível para testes e desenvolvimento
- ✅ Sem breaking changes (env var sobrescreve)
- ✅ Documentação clara sobre comportamento padrão
