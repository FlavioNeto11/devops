import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  buildConversationThreadId,
  createMemoryBackedPlanningGraph
} from '../../src/services/conversation/llm-provider.js';

function readTextContent(message) {
  return typeof message.content === 'string' ? message.content : '';
}

function extractRememberedName(messages) {
  const allHumanTexts = messages
    .filter((message) => message._getType?.() === 'human')
    .map((message) => readTextContent(message));

  const lastHumanText = allHumanTexts.at(-1) || '';
  const asksForName = /qual\s+e\s+meu\s+nome\??/i.test(lastHumanText);
  if (!asksForName) return null;

  for (let i = allHumanTexts.length - 2; i >= 0; i -= 1) {
    const remembered = allHumanTexts[i].match(/meu\s+nome\s+e\s+([a-z\s]{2,60})/i);
    if (remembered?.[1]) {
      return remembered[1].trim();
    }
  }

  return null;
}

describe('conversation langgraph memory', () => {
  it('persiste mensagens entre turnos da mesma sessao', async () => {
    const graph = createMemoryBackedPlanningGraph({
      async invokeModel(messages) {
        const rememberedName = extractRememberedName(messages);
        if (rememberedName) {
          return new AIMessage({ content: `Seu nome e ${rememberedName}.` });
        }
        return new AIMessage({ content: 'Entendido.' });
      }
    });

    const threadId = buildConversationThreadId({
      integrationAccountId: 'acc_test',
      conversationSessionId: 'csn_mem_1',
      sessionContextId: null,
      auditCorrelationId: null,
      manifestId: null,
      jobId: null
    });

    await graph.invoke({
      threadId,
      messages: [
        new SystemMessage('Teste de memoria.'),
        new HumanMessage('Meu nome e Carlos.')
      ]
    });

    const secondTurn = await graph.invoke({
      threadId,
      messages: [
        new SystemMessage('Teste de memoria.'),
        new HumanMessage('Qual e meu nome?')
      ]
    });

    const answer = secondTurn.messages.at(-1);
    assert.ok(answer);
    assert.equal(readTextContent(answer), 'Seu nome e Carlos.');
  });

  it('isola memoria entre sessoes diferentes', async () => {
    const graph = createMemoryBackedPlanningGraph({
      async invokeModel(messages) {
        const rememberedName = extractRememberedName(messages);
        if (rememberedName) {
          return new AIMessage({ content: `Seu nome e ${rememberedName}.` });
        }
        return new AIMessage({ content: 'Nao encontrei nome anterior nesta sessao.' });
      }
    });

    const threadA = buildConversationThreadId({
      integrationAccountId: 'acc_test',
      conversationSessionId: 'csn_mem_A',
      sessionContextId: null,
      auditCorrelationId: null,
      manifestId: null,
      jobId: null
    });

    const threadB = buildConversationThreadId({
      integrationAccountId: 'acc_test',
      conversationSessionId: 'csn_mem_B',
      sessionContextId: null,
      auditCorrelationId: null,
      manifestId: null,
      jobId: null
    });

    await graph.invoke({
      threadId: threadA,
      messages: [
        new SystemMessage('Teste de memoria.'),
        new HumanMessage('Meu nome e Marina.')
      ]
    });

    const otherSessionTurn = await graph.invoke({
      threadId: threadB,
      messages: [
        new SystemMessage('Teste de memoria.'),
        new HumanMessage('Qual e meu nome?')
      ]
    });

    const answer = otherSessionTurn.messages.at(-1);
    assert.ok(answer);
    assert.equal(readTextContent(answer), 'Nao encontrei nome anterior nesta sessao.');
  });

  it('gera thread id estavel por conta e sessao', () => {
    const threadId = buildConversationThreadId({
      integrationAccountId: 'Acc_123',
      conversationSessionId: 'Session-001',
      sessionContextId: null,
      auditCorrelationId: null,
      manifestId: null,
      jobId: null
    });

    assert.equal(threadId, 'conv:acc_123:session-001');
  });

  it('repara historico para garantir tool_calls pareados por tool_call_id', async () => {
    let invocation = 0;

    const graph = createMemoryBackedPlanningGraph({
      async invokeModel(messages) {
        invocation += 1;

        if (invocation === 1) {
          return new AIMessage({
            content: '',
            tool_calls: [{
              id: 'call_001',
              name: 'orchestrate_manifest_operation',
              args: { intent: 'manifest.list_recent_top' }
            }]
          });
        }

        const firstToolCallIndex = messages.findIndex((message) => {
          if (!(message instanceof AIMessage)) return false;
          return Array.isArray(message.tool_calls)
            && message.tool_calls.some((toolCall) => toolCall.id === 'call_001');
        });

        assert.ok(firstToolCallIndex >= 0, 'deve haver uma AIMessage com tool_call call_001 no historico');

        const immediateNext = messages[firstToolCallIndex + 1];
        assert.equal(immediateNext?._getType?.(), 'tool');
        assert.equal(immediateNext?.tool_call_id, 'call_001');

        return new AIMessage({ content: 'Historico de tool call esta consistente.' });
      }
    });

    const threadId = buildConversationThreadId({
      integrationAccountId: 'acc_test',
      conversationSessionId: 'csn_mem_tool_1',
      sessionContextId: null,
      auditCorrelationId: null,
      manifestId: null,
      jobId: null
    });

    await graph.invoke({
      threadId,
      messages: [
        new SystemMessage('Teste de pareamento de tool calls.'),
        new HumanMessage('Liste os 6 manifestos mais recentes.')
      ]
    });

    const secondTurn = await graph.invoke({
      threadId,
      messages: [
        new SystemMessage('Teste de pareamento de tool calls.'),
        new HumanMessage('De onde vem esses manifestos?')
      ]
    });

    const answer = secondTurn.messages.at(-1);
    assert.ok(answer);
    assert.equal(readTextContent(answer), 'Historico de tool call esta consistente.');
  });
});
