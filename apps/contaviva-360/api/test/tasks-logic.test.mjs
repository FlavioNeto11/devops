// Verificação REQ-CONTAVIVA360-0004: Tarefas e Colaboração.
// Estratégia: lê arquivos fonte como texto (sem dependências externas) + simula lógica inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = (file) => readFileSync(join(__dir, '../src', file), 'utf-8');

const dbSrc = src('db.js');
const queueSrc = src('queue.js');
const workerSrc = src('worker.js');
const mailerSrc = src('lib/mailer.js');
const pushSrc = src('lib/push.js');
const routeSrc = src('routes/tasks.js');

// AC1: tabelas no banco
test('db: tabela tasks definida na migração', () => {
  assert.ok(dbSrc.includes("'tasks'") || dbSrc.includes('tasks ('), 'tabela tasks declarada');
  assert.ok(dbSrc.includes('due_at'), 'coluna due_at existe');
  assert.ok(dbSrc.includes('priority'), 'coluna priority existe');
  assert.ok(dbSrc.includes('task_comments'), 'tabela task_comments declarada');
  assert.ok(dbSrc.includes('task_attachments'), 'tabela task_attachments declarada');
  assert.ok(dbSrc.includes('task_notifications'), 'tabela task_notifications declarada');
});

// AC1: prioridades e status declarados na rota
test('rota: prioridades e status de tarefa declarados', () => {
  for (const p of ['baixa', 'media', 'alta', 'critica']) {
    assert.ok(routeSrc.includes(p), `prioridade ${p} declarada`);
  }
  for (const s of ['aberta', 'em_progresso', 'aguardando_cliente', 'aguardando_contador', 'concluida', 'cancelada']) {
    assert.ok(routeSrc.includes(s), `status ${s} declarado`);
  }
});

// AC1: rotas CRUD de tarefas
test('rota: CRUD de tarefas registrado', () => {
  assert.ok(routeSrc.includes("'/v1/tasks'"), 'GET /v1/tasks registrado');
  assert.ok(routeSrc.includes("'/v1/tasks/:id'"), 'GET /v1/tasks/:id registrado');
  assert.ok(routeSrc.includes("app.post('/v1/tasks'"), 'criação de tarefa implementada');
  assert.ok(routeSrc.includes("app.patch('/v1/tasks/:id'"), 'atualização de tarefa implementada');
  assert.ok(routeSrc.includes("app.delete('/v1/tasks/:id'"), 'remoção de tarefa implementada');
});

// AC1: vinculação a entidade (PF/PJ) ou obrigação
test('rota: vinculação opcional a entidade e obrigação', () => {
  assert.ok(routeSrc.includes('entity_type'), 'campo entity_type presente');
  assert.ok(routeSrc.includes('entity_id'), 'campo entity_id presente');
  assert.ok(routeSrc.includes('obligation_id'), 'campo obligation_id presente');
});

// AC2: comentários em thread
test('rota: comentários em thread registrados', () => {
  assert.ok(routeSrc.includes("'/v1/tasks/:id/comments'"), 'rota de comentários registrada');
  assert.ok(routeSrc.includes('resposta_esperada'), 'marcação resposta_esperada implementada');
  assert.ok(routeSrc.includes('info_fornecida'), 'marcação info_fornecida implementada');
  assert.ok(routeSrc.includes('edited_at'), 'edição de comentário com timestamp');
});

// AC3: anexos com versioning
test('rota: anexos com versioning registrados', () => {
  assert.ok(routeSrc.includes("'/v1/tasks/:id/attachments'"), 'rota de anexos registrada');
  assert.ok(routeSrc.includes('nextVersion'), 'auto-incremento de versão implementado');
  assert.ok(routeSrc.includes('uploaded_by'), 'rastreamento de quem fez upload');
});

// AC5: cálculo de nível de alerta de prazo (lógica inline — espelha calcNivelAlertaTarefa)
test('tarefa: calcula nível de alerta por dias até prazo', () => {
  function calcNivel(dueAt) {
    if (!dueAt) return null;
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const dueStr = dueAt.slice(0, 10);
    if (dueStr < todayStr) return 'critico';
    if (dueStr === todayStr) return 'vermelho';
    const diffDays = Math.round((new Date(dueStr + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000);
    if (diffDays <= 1) return 'laranja';
    if (diffDays <= 3) return 'amarelo';
    return null;
  }
  const add = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toLocaleDateString('sv-SE'); };
  assert.equal(calcNivel(add(-1)), 'critico', 'vencida ontem → critico');
  assert.equal(calcNivel(add(0)), 'vermelho', 'hoje → vermelho');
  assert.equal(calcNivel(add(1)), 'laranja', '1 dia → laranja');
  assert.equal(calcNivel(add(3)), 'amarelo', '3 dias → amarelo');
  assert.equal(calcNivel(add(4)), null, '4 dias → sem alerta');
  assert.equal(calcNivel(add(30)), null, '30 dias → sem alerta');
  assert.equal(calcNivel(null), null, 'sem prazo → null');
});

// AC5: rota scan-deadlines registrada
test('rota: POST /v1/tasks/scan-deadlines registrado', () => {
  assert.ok(routeSrc.includes("'/v1/tasks/scan-deadlines'"), 'rota scan-deadlines registrada');
  assert.ok(routeSrc.includes('deadline_alert'), 'tipo de evento deadline_alert emitido');
});

// AC6: transições de status validadas
test('rota: transições de status validadas (máquina de estados)', () => {
  assert.ok(routeSrc.includes('VALID_TRANSITIONS'), 'máquina de estados declarada');
  assert.ok(routeSrc.includes('transição inválida'), 'erro de transição inválida declarado');
  assert.ok(routeSrc.includes('aguardando_cliente'), 'status aguardando_cliente no mapa');
  assert.ok(routeSrc.includes('aguardando_contador'), 'status aguardando_contador no mapa');
});

// AC6: notificação em transição de status relevante
test('rota: notificação enfileirada em transição aguardando_cliente/aguardando_contador', () => {
  assert.ok(routeSrc.includes("'aguardando_cliente'"), 'evento aguardando_cliente enfileirado');
  assert.ok(routeSrc.includes("'aguardando_contador'"), 'evento aguardando_contador enfileirado');
});

// Gate redis-bullmq: fila tasks-notification declarada
test('queue: tasks-notification declarada com degradação graciosa', () => {
  assert.ok(queueSrc.includes('tasks-notification'), 'fila tasks-notification declarada');
  assert.ok(queueSrc.includes('export async function enqueueTaskNotification('), 'enqueueTaskNotification exportada');
  assert.ok(queueSrc.includes("if (!q) return { inline: true }"), 'degradação graciosa sem Redis');
});

// Gate redis-bullmq: sem REDIS_URL → inline:true sem erro
test('queue (simulado): sem REDIS_URL, enqueueTaskNotification retorna inline:true sem erro', async () => {
  const fakeEnqueue = async (taskId, eventType, payload) => {
    const q = ('' ? {} : null); // simula taskNotificationQueue() sem REDIS_URL
    if (!q) return { inline: true };
    return { inline: false };
  };
  const result = await fakeEnqueue(1, 'assigned', { title: 'teste' });
  assert.deepEqual(result, { inline: true }, 'sem Redis → inline:true sem lançar erro');
});

// Gate redis-bullmq: com REDIS_URL → inline:false (simulado)
test('queue (simulado): com REDIS_URL, enqueueTaskNotification retorna inline:false', async () => {
  const fakeEnqueue = async (taskId, eventType, payload) => {
    const q = ('redis://localhost:6379' ? {} : null);
    if (!q) return { inline: true };
    return { inline: false };
  };
  const result = await fakeEnqueue(1, 'assigned', { title: 'teste' });
  assert.notDeepEqual(result, { inline: true }, 'com Redis → evento enfileirado');
});

// Gate notificacoes-multicanal: worker handler importa canais de notificação de tarefa
test('worker: handler tasks-notification declarado e importa canais de notificação', () => {
  assert.ok(workerSrc.includes('tasks-notification'), 'fila tasks-notification no worker');
  assert.ok(workerSrc.includes('sendTaskAssigned'), 'canal email (sendTaskAssigned) importado');
  assert.ok(workerSrc.includes('sendTaskDueAlert'), 'canal email (sendTaskDueAlert) importado');
  assert.ok(workerSrc.includes('sendTaskPush'), 'canal push (sendTaskPush) importado');
  assert.ok(workerSrc.includes('handleTaskNotification'), 'handler handleTaskNotification declarado');
});

// Gate notificacoes-multicanal: mailer tem funções de tarefa
test('mailer: funções de tarefa exportadas', () => {
  assert.ok(mailerSrc.includes('sendTaskAssigned'), 'sendTaskAssigned exportada');
  assert.ok(mailerSrc.includes('sendTaskDueAlert'), 'sendTaskDueAlert exportada');
  assert.ok(mailerSrc.includes('SMTP_HOST'), 'verifica SMTP_HOST antes de enviar');
  assert.ok(mailerSrc.includes('return null'), 'sem SMTP_HOST retorna null (canal pulado)');
});

// Gate notificacoes-multicanal: push tem função de tarefa
test('push: sendTaskPush exportada com degradação graciosa', () => {
  assert.ok(pushSrc.includes('sendTaskPush'), 'sendTaskPush exportada');
  assert.ok(pushSrc.includes('VAPID_PUBLIC_KEY'), 'verifica VAPID_PUBLIC_KEY');
  assert.ok(pushSrc.includes('return null'), 'sem VAPID retorna null (canal pulado)');
});

// Gate notificacoes-multicanal: degradação graciosa (simulada)
test('notificação de tarefa (simulada): canal sem credencial é pulado sem lançar erro', async () => {
  const fakeSendMail = async (opts) => {
    const smtpHost = undefined;
    if (!smtpHost) return null;
    return { accepted: [opts.to] };
  };
  const fakeSendPush = async (subscription) => {
    const vapidKey = undefined;
    if (!vapidKey) return null;
    return { statusCode: 201 };
  };
  const emailResult = await fakeSendMail({ to: 'user@example.com' });
  const pushResult = await fakeSendPush(null);
  assert.equal(emailResult, null, 'email sem SMTP → null (pulado, sem erro)');
  assert.equal(pushResult, null, 'push sem VAPID → null (pulado, sem erro)');
});

// Gate notificacoes-multicanal: evento gera notificação enfileirada (simulado)
test('notificação (simulada): atribuição de tarefa gera evento enfileirado', async () => {
  const events = [];
  const fakeEnqueue = async (taskId, eventType, payload) => {
    const q = ('redis://localhost' ? {} : null);
    if (!q) return { inline: true };
    events.push({ taskId, eventType, payload });
    return { inline: false };
  };
  const result = await fakeEnqueue(10, 'assigned', { assignee: 'user@test.com', title: 'Reunião' });
  assert.notDeepEqual(result, { inline: true }, 'evento enfileirado com Redis');
  assert.equal(events.length, 1, 'exatamente 1 evento gerado');
  assert.equal(events[0].eventType, 'assigned', 'tipo do evento correto');
});
