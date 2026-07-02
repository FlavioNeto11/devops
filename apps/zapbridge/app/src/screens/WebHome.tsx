import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChatKind, ChatListItem, Message, SessionStatus } from '../types';
import { useChatsStore } from '../store/chats.store';
import { useSessionStore } from '../store/session.store';
import { api, getToken, API_URL } from '../api/client';
import { getSocket } from '../realtime/socket';
import { ChatListItemRow } from '../components/ChatListItem';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList, SkeletonMessages } from '../components/SkeletonList';
import { LeftNav } from '../components/LeftNav';
import { ForwardSheet } from '../components/ForwardSheet';
import { InstallBanner } from '../components/InstallBanner';
import { Palette, spacing, radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { Presence, presenceLabel } from '../utils/presence';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatList'>;
type Selected = {
  id: string;
  name: string | null;
  jid: string;
  avatarUrl?: string | null;
  locked?: boolean;
};

// Separadores de data entre grupos de mensagens.
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

function DateSepRow({ label }: { label: string }) {
  const colors = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
    </View>
  );
}

// Barra de pré-visualização da mensagem a ser respondida.
function ReplyPreviewBar({ message, onCancel }: { message: Message; onCancel: () => void }) {
  const colors = useTheme();
  const senderLabel = message.fromMe ? 'Você' : (message.senderName ?? message.senderJid.split('@')[0]);
  const preview = message.text
    ?? (message.type !== 'text' ? ({ image: '📷 Imagem', video: '🎬 Vídeo', audio: '🎤 Áudio', document: '📄 Documento' } as Record<string, string>)[message.type] ?? 'Mídia' : '');
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    }}>
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 2, marginRight: spacing.sm }} />
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

// Layout de DUAS COLUNAS (desktop/web) ao estilo WhatsApp Web.
export function WebHome({ navigation }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const { chats, loading, syncing, search, setSearch, fetchChats } = useChatsStore();
  const status = useSessionStore((s) => s.status);
  const [tabLoading, setTabLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | ChatKind | 'archived' | 'unread'>('all');
  const [archivedChats, setArchivedChats] = useState<ChatListItem[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [presenceByChat, setPresenceByChat] = useState<Record<string, Presence>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useFocusEffect(
    React.useCallback(() => {
      fetchChats();
    }, []),
  );
  useEffect(() => {
    const t = setTimeout(() => fetchChats(), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Listener global de presença — alimenta o indicador "digitando…" na lista.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (p: { chatId: string } & Presence) => {
      const { chatId, typing, recording, online, lastSeen } = p;
      setPresenceByChat((prev) => ({
        ...prev,
        [chatId]: { ...prev[chatId], typing, recording, online, lastSeen },
      }));
      if (typingTimers.current[chatId]) clearTimeout(typingTimers.current[chatId]);
      if (typing || recording) {
        // Auto-limpa o transitório caso o 'paused' não chegue (mantém online/lastSeen).
        typingTimers.current[chatId] = setTimeout(() => {
          setPresenceByChat((prev) => ({
            ...prev,
            [chatId]: { ...prev[chatId], typing: false, recording: false },
          }));
        }, 8000);
      }
    };
    socket.on('presence.updated', onPresence);
    return () => { socket.off('presence.updated', onPresence); };
  }, []);

  // Busca a contagem de arquivadas no primeiro load.
  useEffect(() => {
    api
      .get('/chats', { params: { archived: true, limit: 1 } })
      .then(({ data }) => setArchivedCount(data.chats?.length ?? 0))
      .catch(() => undefined);
  }, []);

  // Busca as arquivadas quando o filtro "archived" é selecionado.
  useEffect(() => {
    if (filter !== 'archived') return;
    setTabLoading(true);
    api
      .get('/chats', { params: { archived: true } })
      .then(({ data }) => {
        setArchivedChats(data.chats);
        setArchivedCount(data.chats?.length ?? 0);
      })
      .catch(() => undefined)
      .finally(() => setTabLoading(false));
  }, [filter]);

  const unreadCount = chats.filter((c) => c.unreadCount > 0).length;
  // Só mostra a contagem de grupos com mensagens não lidas (como o WhatsApp Web).
  const groupCount = chats.filter((c) => c.kind === 'group' && c.unreadCount > 0).length;

  const visible =
    filter === 'all'
      ? chats
      : filter === 'archived'
        ? archivedChats
        : filter === 'unread'
          ? chats.filter((c) => c.unreadCount > 0)
          : chats.filter((c) => c.kind === filter);

  const tabs: { key: 'all' | 'unread' | 'group' | 'channel'; label: string; count?: number }[] = [
    { key: 'all', label: 'Tudo' },
    { key: 'unread', label: 'Não lidas', count: unreadCount },
    { key: 'group', label: 'Grupos', count: groupCount > 0 ? groupCount : undefined },
    { key: 'channel', label: 'Canais' },
  ];

  return (
    <View style={styles.root}>
      {/* Faixa de navegação esquerda */}
      <LeftNav onSettings={() => navigation.navigate('Settings')} />

      {/* Coluna esquerda — lista */}
      <View style={styles.sidebar}>
        {/* Header */}
        <View style={styles.sideHeader}>
          <Text style={styles.brand}>ZapBridge</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {status !== 'connected' && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => navigation.navigate('ConnectWhatsApp')}
              >
                <Text style={[styles.headerIcon, { color: colors.primary }]}>⚡</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('Contacts')}
            >
              <Text style={styles.headerIcon}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.headerIcon}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Banner para instalar o app (some quando instalado/dispensado). */}
        <InstallBanner />

        {/* Aviso de sessão: logout (aparelho removido no celular) ou desconexão. */}
        {(status === 'logged_out' || status === 'disconnected') && (
          <TouchableOpacity
            style={styles.sessionAlert}
            onPress={() => navigation.navigate('ConnectWhatsApp')}
            activeOpacity={0.85}
          >
            <Text style={styles.sessionAlertIcon}>{status === 'logged_out' ? '⛓️‍💥' : '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionAlertTitle}>
                {status === 'logged_out' ? 'Sessão encerrada' : 'WhatsApp desconectado'}
              </Text>
              <Text style={styles.sessionAlertSub} numberOfLines={2}>
                {status === 'logged_out'
                  ? 'O ZapBridge foi removido pelo seu celular. Toque para reconectar.'
                  : 'Toque para reconectar e voltar a receber mensagens.'}
              </Text>
            </View>
            <Text style={styles.sessionAlertChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Busca */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.search}
            placeholder="Pesquisar ou começar uma nova conversa"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Abas */}
        <View style={styles.tabs}>
          {tabs.map(({ key, label, count }) => {
            const active = filter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, active ? styles.tabActive : styles.tabInactive]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>
                  {label}
                  {count != null && count > 0 ? ` ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {syncing && (
          <View style={styles.syncBar}>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.syncText}>Sincronizando…</Text>
          </View>
        )}

        {loading && chats.length === 0 ? (
          <SkeletonList rows={10} />
        ) : tabLoading ? (
          <SkeletonList rows={6} />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(i) => i.id}
            ListHeaderComponent={
              filter !== 'archived' ? (
                <TouchableOpacity
                  style={styles.archivedRow}
                  onPress={() => setFilter('archived')}
                >
                  <View style={styles.archivedIconWrap}>
                    <Text style={styles.archivedIconText}>↓</Text>
                  </View>
                  <Text style={styles.archivedLabel}>Arquivadas</Text>
                  {archivedCount > 0 && (
                    <Text style={styles.archivedCount}>{archivedCount}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.archivedRow} onPress={() => setFilter('all')}>
                  <View style={styles.archivedIconWrap}>
                    <Text style={styles.archivedIconText}>←</Text>
                  </View>
                  <Text style={styles.archivedLabel}>Voltar às conversas</Text>
                </TouchableOpacity>
              )
            }
            renderItem={({ item }) => (
              <View style={selected?.id === item.id ? styles.selectedRow : undefined}>
                <ChatListItemRow
                  chat={item}
                  isTyping={!!(presenceByChat[item.id]?.typing || presenceByChat[item.id]?.recording)}
                  onPress={() => {
                    setSelected({
                      id: item.id,
                      name: item.name,
                      jid: item.jid,
                      avatarUrl: item.avatarUrl,
                      locked: item.locked,
                    });
                    useChatsStore.getState().markChatRead(item.id);
                  }}
                />
              </View>
            )}
            ListEmptyComponent={<EmptyState title="Nenhuma conversa" />}
          />
        )}
      </View>

      {/* Coluna direita — conversa */}
      <View
        style={[
          styles.main,
          // Padrão de fundo (somente web): textura sutil estilo WhatsApp.
          Platform.OS === 'web'
            ? ({
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='412' height='412' opacity='0.06'%3E%3Cpath fill='%23fff' d='M20 8c6.6 0 12 5.4 12 12s-5.4 12-12 12S8 26.6 8 20 13.4 8 20 8zm0 2c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10S25.5 10 20 10zm2 5v4h3l-5 5-5-5h3v-4h4z'/%3E%3C/svg%3E")`,
              } as any)
            : null,
        ]}
      >
        {selected ? (
          <ConversationView
            key={selected.id}
            presence={presenceByChat[selected.id]}
            chat={selected}
            onOpenMedia={(mediaId, type) => navigation.navigate('MediaViewer', { mediaId, type })}
            onOpenGroupDetails={() =>
              navigation.navigate('GroupDetails', { chatId: selected.id, name: selected.name })
            }
            onToggleLock={async (locked) => {
              await api.post(`/chats/${selected.id}/lock`, { locked }).catch(() => undefined);
              fetchChats();
              if (locked) setSelected(null);
            }}
            onArchive={async () => {
              await api.post(`/chats/${selected.id}/archive`, { archived: true }).catch(() => undefined);
              fetchChats();
              setSelected(null);
            }}
          />
        ) : (
          <WelcomePlaceholder onConnect={() => navigation.navigate('ConnectWhatsApp')} status={status} />
        )}
      </View>
    </View>
  );
}

// Tela de boas-vindas quando nenhuma conversa está selecionada.
function WelcomePlaceholder({ status, onConnect }: { status: SessionStatus; onConnect: () => void }) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const connected = status === 'connected';
  const loggedOut = status === 'logged_out';
  return (
    <View style={styles.placeholder}>
      <View style={styles.placeholderInner}>
        <Text style={styles.placeholderEmoji}>{loggedOut ? '⛓️‍💥' : '💬'}</Text>
        <Text style={styles.placeholderTitle}>
          {loggedOut ? 'Sessão encerrada' : 'ZapBridge para Web'}
        </Text>
        <Text style={styles.placeholderSub}>
          {connected
            ? 'Selecione uma conversa à esquerda para começar.'
            : loggedOut
              ? 'Você removeu o ZapBridge em "Aparelhos conectados" do seu WhatsApp. Reconecte escaneando o QR Code para voltar a enviar e receber mensagens.'
              : 'Conecte seu WhatsApp para começar a usar.'}
        </Text>
        {!connected && (
          <TouchableOpacity style={styles.placeholderBtn} onPress={onConnect}>
            <Text style={styles.placeholderBtnText}>
              {loggedOut ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.placeholderDivider} />
        <View style={styles.e2eRow}>
          <Text style={styles.e2eIcon}>🔒</Text>
          <Text style={styles.e2eText}>Suas mensagens são criptografadas de ponta a ponta</Text>
        </View>
      </View>
    </View>
  );
}

// Painel de conversa (direita). Lógica própria (load/realtime/envio/anexo).
function ConversationView({
  chat,
  presence,
  onOpenMedia,
  onOpenGroupDetails,
  onToggleLock,
  onArchive,
}: {
  chat: Selected;
  presence?: Presence;
  onOpenMedia: (mediaId: string, type: string) => void;
  onOpenGroupDetails: () => void;
  onToggleLock: (locked: boolean) => void;
  onArchive: () => void;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const isGroup = chat.jid?.endsWith('@g.us');
  const [showMenu, setShowMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingOld, setLoadingOld] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<ListItem>>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setToken(await getToken());
      try {
        await api.get(`/chats/${chat.id}`);
        const { data } = await api.get(`/chats/${chat.id}/messages`, { params: { limit: 40 } });
        if (!active) return;
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
        setExhausted(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [chat.id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onReceived = ({ chatId, message }: { chatId: string; message: Message }) => {
      if (chatId === chat.id) setMessages((p) => [message, ...p]);
    };
    const onSent = ({ message }: { message: Message }) => {
      if (message.chatId === chat.id) setMessages((p) => p.map((m) => (m.id === message.id ? message : m)));
    };
    const onStatus = ({ messageId, status }: { messageId: string; status: Message['status'] }) =>
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, status } : m)));
    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Message['reactions'] }) =>
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m)));

    // Ao reconectar (Socket.IO ou Baileys), busca mensagens recentes e injeta as que faltam.
    const fillGap = async () => {
      try {
        const { data } = await api.get(`/chats/${chat.id}/messages`, { params: { limit: 20 } });
        if (!data.messages?.length) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m: Message) => m.id));
          const fresh = (data.messages as Message[]).filter((m) => !known.has(m.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      } catch {
        // silencioso
      }
    };

    socket.on('message.received', onReceived);
    socket.on('message.sent', onSent);
    socket.on('message.status.updated', onStatus);
    socket.on('message.reaction.updated', onReaction);
    socket.on('connect', fillGap);
    socket.on('session.connected', fillGap);
    return () => {
      socket.off('message.received', onReceived);
      socket.off('message.sent', onSent);
      socket.off('message.status.updated', onStatus);
      socket.off('message.reaction.updated', onReaction);
      socket.off('connect', fillGap);
      socket.off('session.connected', fillGap);
    };
  }, [chat.id]);

  // Reage (emoji) a uma mensagem. emoji vazio remove. Otimista + confirma no servidor.
  const reactToMessage = async (m: Message, emoji: string) => {
    setMessages((p) =>
      p.map((x) => {
        if (x.id !== m.id) return x;
        const others = (x.reactions ?? []).filter((r) => !r.fromMe);
        return { ...x, reactions: emoji ? [...others, { jid: 'me', emoji, fromMe: true }] : others };
      }),
    );
    try {
      await api.post(`/chats/${chat.id}/messages/${m.id}/react`, { emoji });
    } catch {
      // silencioso; o socket reconcilia se necessário
    }
  };

  // Envia "digitando" (throttle) e agenda "parou".
  const notifyTyping = () => {
    api.post(`/chats/${chat.id}/typing`, { state: 'composing' }).catch(() => undefined);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      api.post(`/chats/${chat.id}/typing`, { state: 'paused' }).catch(() => undefined);
    }, 2500);
  };

  // Busca dentro da conversa.
  const runSearch = async (q: string) => {
    setSearchText(q);
    if (!q.trim()) {
      const { data } = await api.get(`/chats/${chat.id}/messages`, { params: { limit: 40 } });
      setMessages(data.messages);
      setNextCursor(data.nextCursor);
      return;
    }
    const { data } = await api.get(`/chats/${chat.id}/messages`, {
      params: { search: q, limit: 100 },
    });
    setMessages(data.messages);
    setNextCursor(null);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/chats/${chat.id}/messages`, {
        params: { cursor: nextCursor, limit: 40 },
      });
      setMessages((p) => [...p, ...data.messages]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadOlder = async () => {
    if (loadingOld) return;
    setLoadingOld(true);
    try {
      await api.post(`/chats/${chat.id}/history/older`);
      await new Promise((r) => setTimeout(r, 3500));
      const oldest = messages[messages.length - 1];
      const { data } = await api.get(`/chats/${chat.id}/messages`, {
        params: { cursor: oldest?.id, limit: 50 },
      });
      if (data.messages?.length) {
        setMessages((p) => [...p, ...data.messages]);
        setNextCursor(data.nextCursor);
      } else setExhausted(true);
    } finally {
      setLoadingOld(false);
    }
  };

  const sendText = async (text: string) => {
    const quotedId = replyTo?.id ?? null;
    const quotedSnap = replyTo;
    setReplyTo(null);
    const temp: Message = {
      id: `temp-${messages.length}-${text.length}`,
      chatId: chat.id,
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
    setMessages((p) => [temp, ...p]);
    try {
      const { data } = await api.post(`/chats/${chat.id}/messages`, { text, quotedMessageId: quotedId });
      setMessages((p) => p.map((m) => (m.id === temp.id ? data.message : m)));
    } catch {
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, status: 'error' as const } : m)));
    }
  };

  const sendFile = async (file: { uri: string; name: string; mime: string }, type: Message['type']) => {
    setShowAttach(false);
    const temp: Message = {
      id: `tmp-${Date.now() % 100000}`,
      chatId: chat.id,
      fromMe: true,
      senderJid: 'me',
      type,
      text: null,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
    setMessages((p) => [temp, ...p]);
    const form = new FormData();
    form.append('type', type);
    const blob = await fetch(file.uri).then((r) => r.blob());
    form.append('file', blob, file.name);
    try {
      const { data } = await api.post(`/chats/${chat.id}/media`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages((p) => p.map((m) => (m.id === temp.id ? data.message : m)));
    } catch {
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, status: 'error' as const } : m)));
    }
  };

  const pickMedia = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const v = a.type === 'video';
    await sendFile(
      { uri: a.uri, name: a.fileName ?? (v ? 'video.mp4' : 'image.jpg'), mime: a.mimeType ?? (v ? 'video/mp4' : 'image/jpeg') },
      v ? 'video' : 'image',
    );
  };
  const pickDoc = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const mime = a.mimeType ?? 'application/octet-stream';
    const t: Message['type'] = mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('image/')
          ? 'image'
          : 'document';
    await sendFile({ uri: a.uri, name: a.name ?? 'arquivo', mime }, t);
  };
  // Câmera ao vivo (web: <input capture>; mobile largo/tablet abre a câmera).
  const openCamera = (kind: 'image' | 'video') => {
    setShowAttach(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'video' ? 'video/*' : 'image/*';
    input.setAttribute('capture', 'environment');
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
  };

  return (
    <View style={styles.conv}>
      <View style={styles.convHeader}>
        {chat.avatarUrl ? (
          <Image source={{ uri: chat.avatarUrl }} style={styles.avatarSm} />
        ) : (
          <View style={styles.avatarSm}>
            <Text style={styles.avatarSmText}>{(chat.name ?? '#').slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {searchMode ? (
          <TextInput
            style={[styles.search, { flex: 1, marginVertical: 8 }]}
            placeholder="Buscar nesta conversa"
            placeholderTextColor={colors.textMuted}
            autoFocus
            value={searchText}
            onChangeText={runSearch}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.convTitle} numberOfLines={1}>
              {chat.name ?? chat.jid}
            </Text>
            {(() => {
              // 1:1 → online/digitando/gravando/visto por último. Grupo → só "digitando…".
              const sub = isGroup
                ? presence?.typing || presence?.recording
                  ? 'digitando…'
                  : null
                : presenceLabel(presence);
              if (!sub) return null;
              const live = sub === 'digitando…' || sub === 'gravando áudio…' || sub === 'online';
              return <Text style={[styles.typing, !live && styles.lastSeen]}>{sub}</Text>;
            })()}
          </View>
        )}
        <Text
          style={styles.headerIcon}
          onPress={() => {
            setSearchMode((v) => !v);
            if (searchMode) runSearch('');
            setSearchText('');
          }}
        >
          {searchMode ? '✕' : '🔍'}
        </Text>
        {!searchMode && (
          <Text style={styles.headerIcon} onPress={() => setShowMenu((v) => !v)}>
            ⋮
          </Text>
        )}
      </View>

      {/* Menu de 3 pontos (ações da conversa). */}
      {showMenu && (
        <>
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          />
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setSearchMode(true);
              }}
            >
              <Text style={styles.menuItemText}>Buscar na conversa</Text>
            </TouchableOpacity>
            {isGroup && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  onOpenGroupDetails();
                }}
              >
                <Text style={styles.menuItemText}>Dados do grupo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                onToggleLock(!chat.locked);
              }}
            >
              <Text style={styles.menuItemText}>{chat.locked ? 'Destrancar conversa' : 'Trancar conversa'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                onArchive();
              }}
            >
              <Text style={styles.menuItemText}>Arquivar conversa</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {loading ? (
        <SkeletonMessages />
      ) : (
        <View style={{ flex: 1, position: 'relative' }}>
          <FlatList
            ref={listRef}
            data={buildList(messages)}
            inverted={messages.length > 0}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              isSep(item) ? (
                <DateSepRow label={item.label} />
              ) : (
                <MessageBubble
                  message={item}
                  token={token}
                  isGroup={!!chat.jid?.endsWith('@g.us')}
                  onOpenMedia={(m) => m.media?.id && onOpenMedia(m.media.id, m.type)}
                  onReply={setReplyTo}
                  onReact={reactToMessage}
                  onForward={setForwardMsg}
                />
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
                <TouchableOpacity style={styles.loadOld} onPress={loadOlder}>
                  <Text style={styles.loadOldText}>Carregar histórico mais antigo</Text>
                </TouchableOpacity>
              ) : null
            }
            contentContainerStyle={messages.length === 0 ? { flex: 1 } : { paddingVertical: 8 }}
            ListEmptyComponent={<EmptyState title="Nenhuma mensagem nesta conversa ainda" />}
          />
          {!atBottom && (
            <TouchableOpacity
              style={styles.scrollDownBtn}
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            >
              <Text style={styles.scrollDownIcon}>↓</Text>
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
          <TouchableOpacity style={styles.attachItem} onPress={pickDoc}>
            <Text style={styles.attachItemText}>📎  Documento / arquivo</Text>
          </TouchableOpacity>
        </View>
      )}
      {replyTo && <ReplyPreviewBar message={replyTo} onCancel={() => setReplyTo(null)} />}
      <MessageInput
        onSend={sendText}
        onAttach={() => setShowAttach((v) => !v)}
        onTyping={notifyTyping}
        onSendAudio={(f) => sendFile(f, 'audio')}
      />

      <ForwardSheet
        visible={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        onSelect={async (toChatId) => {
          const m = forwardMsg;
          setForwardMsg(null);
          if (!m) return;
          try {
            await api.post(`/chats/${chat.id}/messages/${m.id}/forward`, { toChatId });
          } catch {
            // silencioso
          }
        }}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
    sidebar: {
      width: 380,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'column',
    },

    // Header
    sideHeader: {
      height: 56,
      backgroundColor: colors.header,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
    },
    brand: { color: colors.text, fontSize: 18, fontWeight: '700' },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
    },
    headerIcon: { color: colors.textMuted, fontSize: 22, fontWeight: '700' },

    // Busca
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
    },
    searchIcon: { fontSize: 14, marginRight: 6, opacity: 0.6 },
    search: {
      flex: 1,
      color: colors.text,
      paddingVertical: spacing.sm,
      fontSize: 14,
    },

    // Abas ao estilo WhatsApp Web
    tabs: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      flexWrap: 'nowrap',
    },
    tab: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radius.lg,
    },
    tabActive: { backgroundColor: colors.primaryDark },
    tabInactive: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabText: { fontSize: 13, fontWeight: '600' },
    tabTextActive: { color: '#fff' },
    tabTextInactive: { color: colors.textMuted },

    // Linha "Arquivadas"
    archivedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    archivedIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    archivedIconText: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
    archivedLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
    archivedCount: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },

    // Aviso de sessão (logout / desconexão) no topo da sidebar.
    sessionAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.sm,
      marginBottom: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: 'rgba(229,57,53,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(229,57,53,0.4)',
    },
    sessionAlertIcon: { fontSize: 18 },
    sessionAlertTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    sessionAlertSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    sessionAlertChevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300' },

    selectedRow: { backgroundColor: colors.surfaceAlt },
    syncBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      backgroundColor: colors.surfaceAlt,
    },
    syncText: { color: colors.primary, fontSize: 12, fontWeight: '600' },

    // Área principal (conversa)
    main: { flex: 1, backgroundColor: colors.bg },

    // Empty state (placeholder)
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    placeholderInner: { alignItems: 'center', maxWidth: 340 },
    placeholderEmoji: { fontSize: 56, marginBottom: spacing.lg },
    placeholderTitle: { color: colors.text, fontSize: 22, fontWeight: '300', marginBottom: spacing.sm, letterSpacing: -0.3 },
    placeholderSub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    placeholderBtn: {
      marginTop: spacing.lg,
      paddingVertical: 10,
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
    },
    placeholderBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    placeholderDivider: {
      width: 200,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.lg,
    },
    e2eRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    e2eIcon: { fontSize: 12 },
    e2eText: { color: colors.textMuted, fontSize: 12 },

    // Conversa
    conv: { flex: 1 },
    convHeader: {
      height: 56,
      backgroundColor: colors.header,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    avatarSm: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarSmText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    convTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    typing: { color: colors.primary, fontSize: 12, marginTop: 1 },
    lastSeen: { color: colors.textMuted },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadOld: { alignItems: 'center', paddingVertical: 12 },
    loadOldText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    attachMenu: { backgroundColor: colors.surfaceAlt, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    attachItem: { padding: 14 },
    attachItemText: { color: colors.text, fontSize: 15 },
    // Menu de 3 pontos da conversa
    menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
    menu: {
      position: 'absolute',
      top: 52,
      right: spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      paddingVertical: 6,
      minWidth: 200,
      zIndex: 11,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    menuItem: { paddingHorizontal: spacing.lg, paddingVertical: 12 },
    menuItemText: { color: colors.text, fontSize: 14 },
    scrollDownBtn: {
      position: 'absolute', right: 20, bottom: 16,
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
      elevation: 6,
    },
    scrollDownIcon: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
  });
