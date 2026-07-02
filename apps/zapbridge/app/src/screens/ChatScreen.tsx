import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api, errorMessage, getToken } from '../api/client';
import { aiApi } from '../api/ai';
import { getSocket } from '../realtime/socket';
import { Message } from '../types';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ForwardSheet } from '../components/ForwardSheet';
import { EmptyState } from '../components/EmptyState';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { Presence, presenceLabel } from '../utils/presence';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

type DateSepItem = { _sep: true; label: string; id: string };
type ListItem = Message | DateSepItem;
const isSep = (item: ListItem): item is DateSepItem => !!(item as DateSepItem)._sep;

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const fmt = (x: Date) =>
    x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = new Date();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const msg = fmt(d);
  if (msg === fmt(now)) return 'Hoje';
  if (msg === fmt(yest)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long' });
}

function buildList(messages: Message[]): ListItem[] {
  if (!messages.length) return [];
  const result: ListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i]);
    const cur = dateLabel(messages[i].timestamp);
    const next = i + 1 < messages.length ? dateLabel(messages[i + 1].timestamp) : null;
    if (cur !== next) {
      result.push({ _sep: true, label: cur, id: `sep-${messages[i].id}` });
    }
  }
  return result;
}

function ReplyPreviewBar({ message, onCancel }: { message: Message; onCancel: () => void }) {
  const colors = useTheme();
  const senderLabel = message.fromMe ? 'Você' : (message.senderName ?? message.senderJid.split('@')[0]);
  const preview = message.text
    ?? (message.type !== 'text' ? ({ image: '📷 Imagem', video: '🎬 Vídeo', audio: '🎤 Áudio', document: '📄 Documento' } as Record<string, string>)[message.type] ?? 'Mídia' : '');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 8 }}>
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 2, marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{senderLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>{preview}</Text>
      </View>
      <TouchableOpacity onPress={onCancel} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 20 }}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

function DateSepRow({ label, colors }: { label: string; colors: Palette }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
    </View>
  );
}

export function ChatScreen({ navigation, route }: Props) {
  const { chatId, name, jid } = route.params;
  const isGroup = jid?.endsWith('@g.us');
  const colors = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [presence, setPresence] = useState<Presence>({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // IA (opt-in): sugestões de resposta + resumo da conversa.
  const [aiOn, setAiOn] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ bullets: string[]; count: number } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<ListItem>>(null);

  useLayoutEffect(() => {
    // Subtítulo de presença: 1:1 mostra online/visto por último; grupo só "digitando…".
    const sub = isGroup
      ? presence.typing || presence.recording
        ? 'digitando…'
        : null
      : presenceLabel(presence);
    const live = sub === 'digitando…' || sub === 'gravando áudio…' || sub === 'online';
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
            {name ?? 'Conversa'}
          </Text>
          {sub ? (
            <Text
              style={{ color: live ? colors.primary : colors.textMuted, fontSize: 12 }}
              numberOfLines={1}
            >
              {sub}
            </Text>
          ) : null}
        </View>
      ),
      headerRight: isGroup
        ? () => (
            <Text
              onPress={() => navigation.navigate('GroupDetails', { chatId, name })}
              style={{ color: colors.text, fontSize: 18, marginRight: 4 }}
            >
              ⓘ
            </Text>
          )
        : undefined,
    });
  }, [navigation, name, isGroup, chatId, presence]);

  // Carrega histórico inicial e marca como lida (GET /chats/:id zera unread no backend).
  useEffect(() => {
    (async () => {
      setToken(await getToken());
      try {
        await api.get(`/chats/${chatId}`); // zera não lidas / marca lida
        const { data } = await api.get(`/chats/${chatId}/messages`, { params: { limit: 30 } });
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
      } catch (e) {
        Alert.alert('Erro', errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [chatId]);

  // Tempo real: novas mensagens, confirmação de envio e status.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onReceived = ({ chatId: cid, message }: { chatId: string; message: Message }) => {
      if (cid !== chatId) return;
      setMessages((prev) => [message, ...prev]);
    };
    const onSent = ({ message }: { message: Message }) => {
      if (message.chatId !== chatId) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };
    const onStatus = ({ messageId, status }: { messageId: string; status: Message['status'] }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)));
    };
    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Message['reactions'] }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };
    const onPresence = (p: { chatId: string } & Presence) => {
      if (p.chatId === chatId) {
        setPresence({ typing: p.typing, recording: p.recording, online: p.online, lastSeen: p.lastSeen });
      }
    };
    const onAiSuggestion = (p: { chatId: string; suggestions: string[] }) => {
      if (p.chatId === chatId && p.suggestions?.length) setSuggestions(p.suggestions);
    };
    const fillGap = async () => {
      try {
        const { data } = await api.get(`/chats/${chatId}/messages`, { params: { limit: 20 } });
        if (!data.messages?.length) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m: Message) => m.id));
          const fresh = (data.messages as Message[]).filter((m: Message) => !known.has(m.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      } catch { /* silencioso */ }
    };
    socket.on('message.received', onReceived);
    socket.on('message.sent', onSent);
    socket.on('message.status.updated', onStatus);
    socket.on('message.reaction.updated', onReaction);
    socket.on('presence.updated', onPresence);
    socket.on('ai.suggestion.generated', onAiSuggestion);
    socket.on('connect', fillGap);
    socket.on('session.connected', fillGap);
    return () => {
      socket.off('message.received', onReceived);
      socket.off('message.sent', onSent);
      socket.off('message.status.updated', onStatus);
      socket.off('message.reaction.updated', onReaction);
      socket.off('presence.updated', onPresence);
      socket.off('ai.suggestion.generated', onAiSuggestion);
      socket.off('connect', fillGap);
      socket.off('session.connected', fillGap);
    };
  }, [chatId]);

  // IA: checa consentimento (1x) para habilitar chips/✨/resumo nesta conversa.
  useEffect(() => {
    aiApi
      .getConsent()
      .then((r) => setAiOn(r.settings.consented && r.settings.suggestionsEnabled))
      .catch(() => setAiOn(false));
  }, []);

  // IA: sugestão PROATIVA ao abrir um chat cuja última mensagem foi RECEBIDA
  // (sem isso, os chips só apareceriam quando chegasse uma mensagem nova).
  useEffect(() => {
    if (!aiOn || loading || !messages.length) return;
    if (messages[0]?.fromMe) return; // última foi enviada por mim → nada a sugerir
    if (suggestions.length) return;
    aiApi
      .suggest(chatId)
      .then((r) => { if (r.suggestions?.length) setSuggestions(r.suggestions); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOn, loading, chatId]);

  const loadSummary = async () => {
    setSummaryBusy(true);
    try {
      const s = await aiApi.summary(chatId);
      setSummary(s);
    } catch {
      setSummary({ bullets: [], count: 0 });
    } finally {
      setSummaryBusy(false);
    }
  };

  // Reage (emoji) a uma mensagem. emoji vazio remove. Otimista + confirma no servidor.
  const reactToMessage = async (m: Message, emoji: string) => {
    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x;
        const others = (x.reactions ?? []).filter((r) => !r.fromMe);
        return { ...x, reactions: emoji ? [...others, { jid: 'me', emoji, fromMe: true }] : others };
      }),
    );
    try {
      await api.post(`/chats/${chatId}/messages/${m.id}/react`, { emoji });
    } catch {
      // silencioso
    }
  };

  const notifyTyping = () => {
    api.post(`/chats/${chatId}/typing`, { state: 'composing' }).catch(() => undefined);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      api.post(`/chats/${chatId}/typing`, { state: 'paused' }).catch(() => undefined);
    }, 2500);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/chats/${chatId}/messages`, {
        params: { cursor: nextCursor, limit: 30 },
      });
      setMessages((prev) => [...prev, ...data.messages]);
      setNextCursor(data.nextCursor);
    } catch {
      // silencioso
    } finally {
      setLoadingMore(false);
    }
  };

  // Pede ao WhatsApp o histórico mais antigo (quando a paginação local acabou).
  const [loadingOld, setLoadingOld] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const loadOlderFromWhatsApp = async () => {
    if (loadingOld) return;
    setLoadingOld(true);
    try {
      await api.post(`/chats/${chatId}/history/older`);
      await new Promise((r) => setTimeout(r, 3500)); // aguarda o WhatsApp entregar
      const oldest = messages[messages.length - 1];
      const { data } = await api.get(`/chats/${chatId}/messages`, {
        params: { cursor: oldest?.id, limit: 50 },
      });
      if (data.messages?.length) {
        setMessages((prev) => [...prev, ...data.messages]);
        setNextCursor(data.nextCursor);
      } else {
        setExhausted(true);
      }
    } catch {
      // silencioso
    } finally {
      setLoadingOld(false);
    }
  };

  // Envio otimista de texto.
  const sendText = async (text: string) => {
    const quotedId = replyTo?.id ?? null;
    const quotedSnap = replyTo;
    setReplyTo(null);
    const temp: Message = {
      id: `temp-${Date.now()}`,
      chatId,
      fromMe: true,
      senderJid: 'me',
      type: 'text',
      text,
      status: 'pending',
      timestamp: new Date().toISOString(),
      quotedMessageId: quotedId,
      quoted: quotedSnap
        ? { text: quotedSnap.text, type: quotedSnap.type, senderName: quotedSnap.fromMe ? 'Você' : (quotedSnap.senderName ?? quotedSnap.senderJid.split('@')[0]) }
        : null,
    };
    setMessages((prev) => [temp, ...prev]);
    try {
      const { data } = await api.post(`/chats/${chatId}/messages`, { text, quotedMessageId: quotedId });
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? data.message : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === temp.id ? { ...m, status: 'error' as const } : m)),
      );
    }
  };

  const retry = (m: Message) => {
    if (m.text) {
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      sendText(m.text);
    }
  };

  // Envia um arquivo (foto/vídeo/áudio/documento) com bolha otimista.
  const sendFile = async (
    file: { uri: string; name: string; mime: string },
    msgType: Message['type'],
  ) => {
    setShowAttach(false);
    const temp: Message = {
      id: `temp-${Date.now()}`,
      chatId,
      fromMe: true,
      senderJid: 'me',
      type: msgType,
      text: null,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [temp, ...prev]);

    const form = new FormData();
    form.append('type', msgType);
    if (Platform.OS === 'web') {
      // Na web, converte a URI em Blob real para o multipart.
      const blob = await fetch(file.uri).then((r) => r.blob());
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.mime } as any);
    }

    try {
      const { data } = await api.post(`/chats/${chatId}/media`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? data.message : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === temp.id ? { ...m, status: 'error' as const } : m)),
      );
    }
  };

  // Foto ou vídeo (galeria).
  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const isVideo = a.type === 'video';
    await sendFile(
      {
        uri: a.uri,
        name: a.fileName ?? (isVideo ? 'video.mp4' : 'image.jpg'),
        mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      },
      isVideo ? 'video' : 'image',
    );
  };

  // Câmera: tira foto / grava vídeo na hora. Web/PWA usa <input capture>;
  // nativo usa launchCameraAsync.
  const openCamera = async (kind: 'image' | 'video') => {
    setShowAttach(false);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = kind === 'video' ? 'video/*' : 'image/*';
      input.setAttribute('capture', 'environment'); // câmera traseira no mobile
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const uri = URL.createObjectURL(file);
        sendFile(
          {
            uri,
            name: file.name || (kind === 'video' ? 'video.mp4' : 'photo.jpg'),
            mime: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          },
          kind,
        );
      };
      input.click();
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:
        kind === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    await sendFile(
      {
        uri: a.uri,
        name: a.fileName ?? (kind === 'video' ? 'video.mp4' : 'photo.jpg'),
        mime: a.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      },
      kind,
    );
  };

  // Documento / arquivo qualquer.
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const mime = a.mimeType ?? 'application/octet-stream';
    const msgType: Message['type'] = mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('image/')
          ? 'image'
          : 'document';
    await sendFile({ uri: a.uri, name: a.name ?? 'arquivo', mime }, msgType);
  };

  const openMedia = (m: Message) => {
    if (m.media?.id) navigation.navigate('MediaViewer', { mediaId: m.media.id, type: m.type });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ConnectionBanner />
      {aiOn && (
        <View style={styles.aiBar}>
          {summary ? (
            <View style={{ flex: 1 }}>
              <View style={styles.aiBarTop}>
                <Text style={styles.aiBarTitle}>✨ Resumo ({summary.count} msgs)</Text>
                <TouchableOpacity onPress={() => setSummary(null)}>
                  <Text style={styles.aiBarClose}>×</Text>
                </TouchableOpacity>
              </View>
              {summary.bullets.length ? (
                summary.bullets.map((b, i) => (
                  <Text key={i} style={styles.aiBullet}>• {b}</Text>
                ))
              ) : (
                <Text style={styles.aiBullet}>Nada para resumir aqui.</Text>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.aiSummaryBtn} onPress={loadSummary} disabled={summaryBusy}>
              {summaryBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.aiSummaryText}>✨ Resumir conversa</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1, position: 'relative' }}>
          <FlatList
            ref={listRef}
            data={buildList(messages)}
            inverted={messages.length > 0}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              isSep(item) ? (
                <DateSepRow label={item.label} colors={colors} />
              ) : (
                <MessageBubble message={item} token={token} isGroup={isGroup} onRetry={retry} onOpenMedia={openMedia} onReply={setReplyTo} onReact={reactToMessage} onForward={setForwardMsg} />
              )
            }
            onScroll={({ nativeEvent }) => setAtBottom(nativeEvent.contentOffset.y < 60)}
            scrollEventThrottle={100}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore || loadingOld ? (
                <ActivityIndicator color={colors.primary} style={{ margin: 12 }} />
              ) : !nextCursor && messages.length > 0 && !exhausted ? (
                <TouchableOpacity style={styles.loadOld} onPress={loadOlderFromWhatsApp}>
                  <Text style={styles.loadOldText}>Carregar histórico mais antigo</Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={<EmptyState title="Nenhuma mensagem nesta conversa ainda" />}
            contentContainerStyle={messages.length === 0 ? { flex: 1 } : undefined}
          />
          {!atBottom && (
            <TouchableOpacity
              style={{ position: 'absolute', right: 20, bottom: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', elevation: 4 }}
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            >
              <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: '700' }}>↓</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showAttach && (
        <View style={styles.attachMenu}>
          <TouchableOpacity style={styles.attachItem} onPress={() => openCamera('image')}>
            <Text style={styles.attachItemText}>📷  Tirar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachItem} onPress={() => openCamera('video')}>
            <Text style={styles.attachItemText}>🎥  Gravar vídeo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachItem} onPress={pickMedia}>
            <Text style={styles.attachItemText}>🖼️  Foto ou vídeo (galeria)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachItem} onPress={pickDocument}>
            <Text style={styles.attachItemText}>📎  Documento / arquivo</Text>
          </TouchableOpacity>
        </View>
      )}
      {replyTo && <ReplyPreviewBar message={replyTo} onCancel={() => setReplyTo(null)} />}
      <View style={{ backgroundColor: colors.header, paddingBottom: insets.bottom }}>
        <MessageInput
          onSend={sendText}
          onAttach={() => setShowAttach((v) => !v)}
          onTyping={notifyTyping}
          onSendAudio={(f) => sendFile(f, 'audio')}
          aiEnabled={aiOn}
          suggestions={suggestions}
          onClearSuggestions={() => setSuggestions([])}
          onRewrite={(text, mode) => aiApi.rewrite(text, mode)}
        />
      </View>

      <ForwardSheet
        visible={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        onSelect={async (toChatId) => {
          const m = forwardMsg;
          setForwardMsg(null);
          if (!m) return;
          try {
            await api.post(`/chats/${chatId}/messages/${m.id}/forward`, { toChatId });
          } catch {
            // silencioso
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  attachMenu: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  attachItem: { padding: 14 },
  attachItemText: { color: colors.text, fontSize: 15 },
  loadOld: { alignItems: 'center', paddingVertical: 12 },
  loadOldText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  typingBar: { color: colors.primary, fontSize: 12, paddingHorizontal: 16, paddingVertical: 4 },
  aiBar: { backgroundColor: colors.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
  aiSummaryBtn: { alignItems: 'center', paddingVertical: 4 },
  aiSummaryText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  aiBarTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  aiBarTitle: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  aiBarClose: { color: colors.textMuted, fontSize: 18 },
  aiBullet: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
