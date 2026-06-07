# Matriz de riscos

## Risco 1 - IA executar alem do que o backend suporta
Mitigacao:
- tool contracts com dependencia explicita
- bloqueio quando backend nao suporta
- separar "estado atual" de "target state"

## Risco 2 - WhatsApp permitir acao perigosa demais
Mitigacao:
- canal mais restritivo
- confirmacao forte
- step-up auth quando necessario
- foco inicial em consultas e orientacoes

## Risco 3 - Assistente interno virar guia generico demais
Mitigacao:
- screen catalog
- field catalog
- contexto de rota e manifesto
- navigation tools especificas

## Risco 4 - Falta de trilha de auditoria
Mitigacao:
- conversation_action_logs
- correlationId obrigatorio
- ligacao com jobs e audit trail existentes

## Risco 5 - Base de conhecimento dispersa
Mitigacao:
- trilha canonica em `docs/copilot/conversacional/`
- evitar regras espalhadas em prompts soltos
- docs como fonte principal

## Risco 6 - Home prometer demais
Mitigacao:
- comunicar capacidades reais
- separar claramente "ja suportado" vs "expansao planejada"
- evitar marketing desconectado do backend

## Risco 7 - Escopo grande demais
Mitigacao:
- implementar por fases
- popup interno como MVP
- app simplificado em seguida
- WhatsApp por ultimo
