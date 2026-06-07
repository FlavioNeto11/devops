# ✅ Correção: Worker Travando na Execução (DL-023 - Continuação)

**Data**: 2026-03-09  
**Problema**: `npm run worker` travava e não respondia a Ctrl+C  
**Status**: ✅ RESOLVIDO

---

## Diagnóstico

### Sintomas
- `npm run worker` entrava em loop infinito
- Ctrl+C não encerrava o processo
- Worker ficava travado aguardando debugger
- Necessário force kill para parar

### Causas Identificadas

1. **Debugger Automático do VS Code**
   - `debug.javascript.autoAttachFilter: "smart"` ativado
   - Processos Node ficavam aguardando debugger disconnect
   - "Waiting for the debugger to disconnect..." infinito

2. **Cleanup Sem Timeout**
   - Handler SIGINT sem timeout de segurança
   - Se `stopWorker()` falhasse, processo travava
   - Sem tratamento de `uncaughtException`/`unhandledRejection`

3. **Loop Infinito Sem Interrupção Graceful**
   - `do { ... } while (true)` sem flag de shutdown
   - Impossível interromper durante sleep ou polling

---

## Soluções Implementadas

### 1. Graceful Shutdown Robusto (`src/workers/job-runner.js`)

```javascript
// Flag de shutdown
let shutdownRequested = false;

// Cleanup com timeout de 5s
const cleanup = async (signal) => {
  if (shutdownRequested) {
    console.log(`[worker] Shutdown já em progresso, forçando saída...`);
    process.exit(1);
  }
  shutdownRequested = true;
  
  console.log(`[worker] Recebido sinal ${signal}, encerrando gracefully...`);
  clearInterval(heartbeatInterval);
  
  // Timeout de 5 segundos para cleanup
  const cleanupTimeout = setTimeout(() => {
    console.error(`[worker] Cleanup timeout (5s), forçando saída`);
    process.exit(1);
  }, 5000);
  
  try {
    await stopWorker(workerId, `Shutdown requested (${signal})`);
    console.log(`[worker] Cleanup concluído com sucesso`);
  } catch (error) {
    console.error(`[worker] Erro ao parar worker:`, error.message);
  } finally {
    clearTimeout(cleanupTimeout);
    process.exit(0);
  }
};

// Handlers completos
process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(`[worker] uncaughtException:`, error);
  cleanup('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error(`[worker] unhandledRejection:`, reason);
  cleanup('unhandledRejection');
});
```

**Benefícios:**
- ✅ Timeout de 5s garante que cleanup nunca trava
- ✅ Flag `shutdownRequested` evita re-entrada
- ✅ Handlers para exceções não tratadas
- ✅ Mensagens claras de progresso

### 2. Verificação de Shutdown no Loop

```javascript
do {
  // Verificar se shutdown foi solicitado
  if (shutdownRequested) {
    console.log(`[worker] Shutdown detectado, interrompendo loop`);
    break;
  }
  
  // ... resto do loop
} while (true);
```

**Benefícios:**
- ✅ Interrupção imediata após completar job atual
- ✅ Não aguarda próximo polling para encerrar

### 3. Desabilitar Debugger Automático

**`.vscode/settings.json`:**
```json
{
  "debug.javascript.autoAttachFilter": "disabled"
}
```

**`src/worker.js`:**
```javascript
// Desabilitar debugger automático
process.execArgv = process.execArgv.filter(arg => !arg.startsWith('--inspect'));

try {
  await ensureStartup();
  await runWorkerLoop({ once });
  if (once) process.exit(0);
} catch (error) {
  console.error('[worker] Erro fatal:', error);
  process.exit(1);
}
```

**Benefícios:**
- ✅ Worker roda sem debugger attach
- ✅ Sem "Waiting for the debugger to disconnect..."
- ✅ Ctrl+C funciona imediatamente

### 4. Script de Gerenciamento (`scripts/worker-manager.ps1`)

```powershell
.\scripts\worker-manager.ps1 start   # Inicia em background
.\scripts\worker-manager.ps1 stop    # Para com cleanup
.\scripts\worker-manager.ps1 once    # Executa uma iteração
.\scripts\worker-manager.ps1 status  # Verifica status
```

**Recursos:**
- ✅ PID file tracking
- ✅ Cleanup de processos orfãos
- ✅ Status monitoring
- ✅ Execução em background via PowerShell Jobs

---

## Teste de Validação

### Antes (Travado)
```powershell
PS> npm run worker
[worker] Registrado como worker-12345-...
Debugger listening on ws://127.0.0.1:...
Waiting for the debugger to disconnect...
^C [trava - não responde]
```

### Depois (Funcional)
```powershell
PS> npm run worker
[worker] Registrado como worker-2440-1773084550502
^C
[worker] Recebido sinal SIGINT, encerrando gracefully...
[worker] Cleanup concluído com sucesso

PS> # Processo encerrou corretamente ✅
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/workers/job-runner.js` | Graceful shutdown + timeout + handlers |
| `src/worker.js` | Desabilitar debugger + try/catch |
| `.vscode/settings.json` | Auto-attach desabilitado |
| `scripts/worker-manager.ps1` | **NOVO** - Gerenciador robusto |

---

## Uso Recomendado

### Desenvolvimento (Terminal)
```bash
# Modo contínuo (Ctrl+C para parar)
npm run worker

# Modo once (executa e sai)
npm run worker:once
```

### Produção / Background
```powershell
# Iniciar
.\scripts\worker-manager.ps1 start

# Verificar status
.\scripts\worker-manager.ps1 status

# Parar
.\scripts\worker-manager.ps1 stop
```

---

## Próximos Passos

- [ ] Testar fluxo completo de impressão MTR com worker funcional
- [ ] Obter novo JWT válido da CETESB
- [ ] Executar teste E2E end-to-end
- [ ] Validar download de PDF real

---

## Conclusão

✅ **Worker agora funciona corretamente**:
- Graceful shutdown em 5s ou menos
- Ctrl+C funciona imediatamente
- Sem debugger travando
- Cleanup robusto e auditado
- Script de gerenciamento para produção

**Problema resolvido**. Worker pronto para processamento de jobs de impressão MTR.
