import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { connectSocket } from '../realtime/socket';
import { Message } from '../types';
import { isDevPreview } from '../dev/devPreview';

export interface Presence {
  typing?: boolean;
  recording?: boolean;
  online?: boolean;
  lastSeen?: string | null;
}

function fakeMessages(): Message[] {
  const now = Date.now();
  const mk = (i: number, fromMe: boolean, text: string): Message => ({
    id: 'm' + i,
    chatId: 'dev',
    fromMe,
    senderJid: fromMe ? 'me' : '5511999@s.whatsapp.net',
    type: 'text',
    text,
    status: fromMe ? 'read' : 'delivered',
    timestamp: new Date(now - i * 600000).toISOString(),
    reactions: i === 2 ? [{ jid: 'x', emoji: '👍', fromMe: false }] : [],
  });
  return [
    mk(0, false, 'Perfeito, combinado então! 🙌'),
    mk(1, true, 'Fechado, te aviso quando chegar'),
    mk(2, false, 'Show, qualquer coisa me chama'),
    mk(3, true, 'Pode deixar 👍'),
    mk(4, false, 'Bom dia! Tudo certo pra hoje?'),
  ];
}

type PendingMedia = { file: File | Blob; type: 'image' | 'video' | 'audio' | 'document'; name: string };

export function useChatMessages(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [presence, setPresence] = useState<Presence>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Contador monotônico de falhas de envio (para anúncio acessível na tela).
  const [sendFailureAt, setSendFailureAt] = useState(0);
  const cursorRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempSeq = useRef(0);
  // Payloads de mídia pendentes/com erro, por id temporário (permite "Tentar de novo").
  const pendingMediaRef = useRef(new Map<string, PendingMedia>());
  // Espelho do estado atual (para callbacks async lerem a lista sem closure velha).
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const upsert = useCallback((m: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((x) => x.id === m.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...m };
        return next;
      }
      return [m, ...prev];
    });
  }, []);

  // Troca a bolha otimista (tempId) pela mensagem confirmada pelo servidor SEM
  // duplicar quando o eco em tempo real (message.sent) já inseriu o id do servidor.
  const reconcile = useCallback((tempId: string, serverMsg: Message) => {
    setMessages((prev) => {
      const echoIdx = prev.findIndex((m) => m.id === serverMsg.id);
      if (echoIdx >= 0) {
        // Eco chegou primeiro: atualiza a entrada do servidor e descarta a temporária.
        const next = prev.filter((m) => m.id !== tempId);
        const idx = next.findIndex((m) => m.id === serverMsg.id);
        next[idx] = { ...next[idx], ...serverMsg };
        return next;
      }
      const tempIdx = prev.findIndex((m) => m.id === tempId);
      if (tempIdx >= 0) {
        const next = [...prev];
        next[tempIdx] = serverMsg;
        return next;
      }
      return [serverMsg, ...prev];
    });
  }, []);

  const markSendError = useCallback((tempId: string) => {
    const prev = messagesRef.current;
    const temp = prev.find((m) => m.id === tempId);
    // Se o eco em tempo real (message.sent) JÁ entregou a mensagem real, o POST
    // "falhou" só do nosso lado: remove a bolha temporária em silêncio (marcar erro
    // criaria duplicata e o "Tentar de novo" reenviaria de verdade ao contato).
    const alreadyDelivered =
      !!temp &&
      prev.some(
        (m) =>
          m.id !== tempId &&
          !m.id.startsWith('local-') &&
          m.fromMe &&
          m.chatId === temp.chatId &&
          m.type === temp.type &&
          (temp.type !== 'text' || m.text === temp.text) &&
          new Date(m.timestamp).getTime() >= new Date(temp.timestamp).getTime(),
      );
    if (!temp || alreadyDelivered) {
      pendingMediaRef.current.delete(tempId);
      setMessages((p) => p.filter((m) => m.id !== tempId));
      return;
    }
    setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, status: 'error' as const } : m)));
    setSendFailureAt((n) => n + 1);
  }, []);

  // Carrega histórico inicial + zera não-lidas.
  useEffect(() => {
    let alive = true;
    setMessages([]);
    setLoading(true);
    setExhausted(false);
    setPresence({});
    setSuggestions([]);
    cursorRef.current = null;
    pendingMediaRef.current.clear();

    if (isDevPreview()) {
      setMessages(fakeMessages());
      setLoading(false);
      setExhausted(true);
      return;
    }

    (async () => {
      try {
        await api.get('/chats/' + chatId).catch(() => undefined);
        const { data } = await api.get('/chats/' + chatId + '/messages', { params: { limit: 30 } });
        if (!alive) return;
        setMessages(data.messages ?? []);
        cursorRef.current = data.nextCursor ?? null;
        setExhausted(!data.nextCursor);
      } catch {
        /* silencioso */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chatId]);

  // Tempo real.
  useEffect(() => {
    if (isDevPreview()) return;
    const socket = connectSocket();
    const onReceived = ({ chatId: cid, message }: { chatId: string; message: Message }) => {
      if (cid === chatId) upsert(message);
    };
    const onSent = ({ message }: { message: Message }) => upsert(message);
    const onStatus = ({ messageId, status }: { messageId: string; status: Message['status'] }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)));
    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Message['reactions'] }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    const onPresence = ({ chatId: cid, ...p }: { chatId: string } & Presence) => {
      if (cid === chatId) setPresence(p);
    };
    const onSuggest = ({ chatId: cid, suggestions: s }: { chatId: string; suggestions: string[] }) => {
      if (cid === chatId) setSuggestions(s ?? []);
    };
    socket.on('message.received', onReceived);
    socket.on('message.sent', onSent);
    socket.on('message.status.updated', onStatus);
    socket.on('message.reaction.updated', onReaction);
    socket.on('presence.updated', onPresence);
    socket.on('ai.suggestion.generated', onSuggest);
    return () => {
      socket.off('message.received', onReceived);
      socket.off('message.sent', onSent);
      socket.off('message.status.updated', onStatus);
      socket.off('message.reaction.updated', onReaction);
      socket.off('presence.updated', onPresence);
      socket.off('ai.suggestion.generated', onSuggest);
    };
  }, [chatId, upsert]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || !cursorRef.current || isDevPreview()) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/chats/' + chatId + '/messages', {
        params: { cursor: cursorRef.current, limit: 30 },
      });
      setMessages((prev) => [...prev, ...(data.messages ?? [])]);
      cursorRef.current = data.nextCursor ?? null;
      setExhausted(!data.nextCursor);
    } catch {
      /* silencioso */
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, loadingMore, exhausted]);

  const sendText = useCallback(
    async (text: string, quotedMessageId?: string) => {
      if (isDevPreview()) {
        upsert({
          id: 'local-' + Date.now(),
          chatId,
          fromMe: true,
          senderJid: 'me',
          type: 'text',
          text,
          status: 'sent',
          timestamp: new Date().toISOString(),
        } as Message);
        return;
      }
      // Bolha otimista: aparece imediatamente como "pendente" e vira erro se o POST falhar.
      const tempId = `local-${Date.now()}-${++tempSeq.current}`;
      upsert({
        id: tempId,
        chatId,
        fromMe: true,
        senderJid: 'me',
        type: 'text',
        text,
        quotedMessageId: quotedMessageId ?? null,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });
      try {
        const { data } = await api.post('/chats/' + chatId + '/messages', { text, quotedMessageId });
        if (data?.message) reconcile(tempId, data.message);
        else setMessages((prev) => prev.filter((m) => m.id !== tempId)); // eco em tempo real preenche
      } catch {
        markSendError(tempId);
      }
    },
    [chatId, upsert, reconcile, markSendError],
  );

  const sendMedia = useCallback(
    async (file: File | Blob, type: 'image' | 'video' | 'audio' | 'document', name: string) => {
      if (isDevPreview()) return;
      const tempId = `local-${Date.now()}-${++tempSeq.current}`;
      pendingMediaRef.current.set(tempId, { file, type, name });
      // Bolha otimista de mídia: sem media.id o MessageBubble mostra o rótulo do tipo.
      upsert({
        id: tempId,
        chatId,
        fromMe: true,
        senderJid: 'me',
        type,
        text: null,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });
      const form = new FormData();
      form.append('type', type);
      form.append('file', file, name);
      try {
        const { data } = await api.post('/chats/' + chatId + '/media', form);
        pendingMediaRef.current.delete(tempId);
        if (data?.message) reconcile(tempId, data.message);
        else setMessages((prev) => prev.filter((m) => m.id !== tempId)); // eco em tempo real preenche
      } catch {
        markSendError(tempId);
      }
    },
    [chatId, upsert, reconcile, markSendError],
  );

  // Reenvio só é possível para bolhas otimistas locais: texto com conteúdo ou
  // mídia cujo payload ainda está em pendingMediaRef. Mensagens 'error' vindas do
  // histórico do servidor (id não-local) não têm ação de reenvio.
  const canRetry = useCallback((msg: Message) => {
    if (!msg.id.startsWith('local-')) return false;
    if (pendingMediaRef.current.has(msg.id)) return true;
    return msg.type === 'text' && !!msg.text;
  }, []);

  // "Tentar de novo" de uma bolha com erro: remove a bolha antiga e re-dispara o envio.
  // Só remove quando há reenvio possível — caso contrário é no-op (a bolha fica).
  const retrySend = useCallback(
    (msg: Message) => {
      const media = pendingMediaRef.current.get(msg.id);
      if (media) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        pendingMediaRef.current.delete(msg.id);
        void sendMedia(media.file, media.type, media.name);
        return;
      }
      if (msg.id.startsWith('local-') && msg.type === 'text' && msg.text) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        void sendText(msg.text, msg.quotedMessageId ?? undefined);
      }
    },
    [sendMedia, sendText],
  );

  const react = useCallback(
    async (msgId: string, emoji: string) => {
      if (isDevPreview()) return;
      await api.post(`/chats/${chatId}/messages/${msgId}/react`, { emoji }).catch(() => undefined);
    },
    [chatId],
  );

  const notifyTyping = useCallback(() => {
    if (isDevPreview()) return;
    api.post('/chats/' + chatId + '/typing', { state: 'composing' }).catch(() => undefined);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      api.post('/chats/' + chatId + '/typing', { state: 'paused' }).catch(() => undefined);
    }, 2500);
  }, [chatId]);

  return {
    messages,
    loading,
    loadingMore,
    exhausted,
    presence,
    suggestions,
    setSuggestions,
    loadMore,
    sendText,
    sendMedia,
    retrySend,
    canRetry,
    sendFailureAt,
    react,
    notifyTyping,
  };
}
