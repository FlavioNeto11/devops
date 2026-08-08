/**
 * Raias de fila.
 *
 * O worker do SICAT é consumidor **serial único**: `replicas: 1` e um `for (const job of jobs) await
 * processClaimedJob(job)`. Um turno conversacional de 90 s bloqueia `manifest.submit`,
 * `cdf.generate` e `catalog.sync` por 90 s — e prioridade ORDENA a fila, não a paraleliza. A única
 * correção real é ter DOIS consumidores, cada um lendo um subconjunto disjunto de operações.
 *
 * `WORKER_LANE` ausente ⇒ `'all'`, que é o comportamento ATUAL byte a byte (nenhum predicado extra
 * no `claimJobs`). Isso é deliberado: a raia nasce INERTE. Enquanto o canal está desligado
 * (`WHATSAPP_PROVIDER=disabled`, o default) não há job de canal nenhum e um worker `all` continua
 * correto. Subir a raia é PRÉ-REQUISITO OPERACIONAL de ligar o canal, não de mergear o código.
 *
 * As duas metades do predicado SQL saem desta MESMA constante justamente para que adicionar uma
 * operação de canal não deixe uma raia enxergando o que a outra também enxerga (ou o que nenhuma
 * enxerga — um job órfão na fila, invisível, para sempre).
 *
 * Mora em `lib/` e não em `workers/` porque QUEM APLICA o predicado é o repositório (`claimJobs`), e
 * `repository → worker` inverteria a fronteira de camadas declarada em `AGENTS.md`
 * (`route → service → repository → job → worker → gateway`). `lib/` é a camada compartilhada que os
 * dois lados já importam — é onde `retry.ts` vive pelo mesmo motivo.
 *
 * ⚠️ FASE 6: `whatsapp.outbound_notice` entra aqui, e a presença dele é ASSERIDA NO IMPORT por
 * `whatsapp-outbound-notice-service.ts` (que é quem possui o nome da operação — `lib/` não pode
 * importar `services/` sem inverter a fronteira de camadas). Esquecer a entrada produz exatamente o
 * modo de falha descrito acima: numa instalação `WORKER_LANE=default` + `channel`, o job de aviso
 * não é reivindicado por NENHUMA raia, para sempre, sem um erro de log — a pessoa confirma uma ação
 * e nunca recebe o desfecho, em silêncio absoluto. É o defeito exato que a fase 6 existe para matar,
 * então ele não pode nascer de um esquecimento de edição de constante.
 */

export const CHANNEL_LANE_OPERATIONS = ['whatsapp.inbound_message', 'whatsapp.outbound_notice'] as const;

export type WorkerLane = 'all' | 'default' | 'channel';

/**
 * @param value normalmente `process.env.WORKER_LANE`; parametrizado para ser testável sem mexer no
 *              ambiente do processo.
 */
export function resolveWorkerLane(value: unknown = process.env.WORKER_LANE): WorkerLane {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'channel') return 'channel';
  if (normalized === 'default') return 'default';
  // Qualquer outro valor (inclusive lixo digitado errado) cai no comportamento atual. Falhar aqui
  // derrubaria o worker inteiro por causa de uma variável de otimização.
  return 'all';
}
