# Máquina mental de jobs

Estados mínimos esperados:
- pending
- processing
- succeeded
- failed

Campos a observar:
- attempts
- max_attempts
- available_at
- last_error
- payload
- result

Pontos críticos:
- seleção com `FOR UPDATE SKIP LOCKED`
- diferença entre falha transitória e definitiva
- consistência entre status do manifesto e status do job
