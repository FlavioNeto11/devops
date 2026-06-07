# Technical Decisions — DL-058

## 1) Propagar intenção de sincronização via query param
**Decisão:** usar `forceSync=1` no retorno da tela de detalhe para a listagem.

**Motivo:**
- Acoplamento mínimo entre telas.
- Comportamento explícito e rastreável no roteamento.

## 2) Gatilho condicionado a job terminal
**Decisão:** só marcar sincronização forçada quando o job acompanhado em `autoRefresh` chegar a estado terminal.

**Motivo:**
- Evita sincronizações desnecessárias.
- Mantém semântica de sincronização vinculada ao ciclo real do job.

## 3) Reuso da lógica existente de ressync
**Decisão:** reutilizar `resyncManifests()` em `ManifestsView` em vez de criar fluxo paralelo.

**Motivo:**
- Menor risco de divergência de comportamento.
- Aproveita feedback/error handling já consolidado na tela.
