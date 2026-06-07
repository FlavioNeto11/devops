# Technical Decisions — DL-045

## 1) Lookup por documento no frontend
**Decisão:** restaurar chamada ao endpoint `GET /v1/auth/partner-info` na etapa CETESB.

**Motivo:** recuperar comportamento já conhecido pelos operadores para reduzir preenchimento manual do `Código parceiro`.

## 2) Trigger no `blur` do login CETESB
**Decisão:** executar lookup quando usuário sai do campo `Login CETESB` e o valor contém 11 ou 14 dígitos.

**Motivo:** evitar chamadas excessivas enquanto o usuário digita e preservar experiência fluida.

## 3) Regra de não sobrescrita
**Decisão:** preencher `partnerCode` e e-mail apenas quando os campos estiverem vazios.

**Motivo:** respeitar input manual do operador e evitar comportamento invasivo.

## 4) Cobertura de teste com mock dedicado
**Decisão:** manter mock explícito de `partner-info` no smoke responsivo.

**Motivo:** garantir estabilidade dos testes de UI sem depender de backend externo durante execução local.
