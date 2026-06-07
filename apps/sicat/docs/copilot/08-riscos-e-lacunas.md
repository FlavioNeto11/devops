# Riscos e lacunas

## Riscos atuais

1. **Recaptcha fora do backend**
   - login real depende de token obtido externamente
   - **Status:** aceito, sem plano de automatização

2. ~~**Ambiguidade de header de autenticação**~~ ✅ RESOLVIDO
   - ~~necessidade de manter modo configurável até validação real conclusiva~~
   - **Resolução:** `Authorization: Bearer` validado em testes E2E reais

3. **Heurísticas de pesquisa de manifesto**
   - submit pode depender de lookup posterior para resolver ids externos
   - **Status:** implementado, funcionando com lookup por hash

4. ~~**Cobertura de testes insuficiente**~~ ✅ MITIGADO
   - ~~principais fluxos ainda não têm suíte automatizada robusta~~
   - **Progresso:** testes E2E implementados para submit + cancel
   - **Pendente:** print, catalog sync

5. ~~**Validação real incompleta**~~ ✅ RESOLVIDO
   - ~~ainda falta smoke em ambiente integrado~~
   - **Resolução:** testes E2E contra CETESB real implementados

6. **Intermitência da CETESB API** ⚠️ NOVO
   - API retorna erros intermitentes ("Erro ao Gerar o MTR", 404 temporário)
   - **Mitigação:** sistema de retry implementado e validado
   - **Impacto:** jobs entram em `retry_wait` e são reprocessados automaticamente
   - **Observabilidade:** logs registram retry reasons

7. ~~**Validação de payload de manifesto**~~ ✅ RESOLVIDO (2026-03-08)
   - ~~campos obrigatórios não eram validados antes do submit~~
   - ~~timestamp duplicado em manDataExpedicao~~
   - ~~recaptcha não validado~~
   - **Resolução:** validador implementado em `src/lib/validators/manifest-validator.js`
   - **Cobertura:** 26 testes unitários (100% aprovados)
   - **Benefícios:** fail fast, redução de chamadas inválidas à CETESB
   - **Documentação:** `docs/copilot/validadores/cetesb/validacao-sequencia-mtr.md`, DL-008

## Lacunas técnicas prioritárias

- ✅ ~~testes automatizados de serviços e worker~~ (submit + E2E implementados)
- testes de contrato OpenAPI
- ✅ ~~smoke scripts para API + worker + Postgres~~ (E2E implementado)
- métricas operacionais
- ✅ ~~endurecimento de tratamento de erros externos~~ (retry validado)
- ✅ ~~política mais clara de retry/backoff~~ (implementada e documentada)
- **NOVO:** renovação automática de token JWT expirado
- **NOVO:** healthcheck do worker
- **NOVO:** testes para print e catalog sync

## Estratégia recomendada
1. ✅ ~~estabilizar smoke e testes~~ (concluído)
2. ✅ ~~validar headers e sessão em ambiente real~~ (concluído)
3. fechar lacunas de observabilidade (em progresso)
4. ampliar automatizações adicionais (print, catalog)

