import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, Platform, StyleSheet } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

function WebVideo({ uri }: { uri: string }) {
  return React.createElement('video', {
    src: uri,
    controls: true,
    style: { width: '100%', maxWidth: '380px', borderRadius: '8px', display: 'block', backgroundColor: '#000' },
  });
}
function WebAudio({ uri }: { uri: string }) {
  return React.createElement('audio', {
    src: uri,
    controls: true,
    style: { width: '260px', height: '40px', display: 'block' },
  });
}
import { Message } from '../types';
import { API_URL } from '../api/client';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

function quotedTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    audio: '🎤 Áudio',
    document: '📄 Documento',
  };
  return labels[type] ?? 'Mensagem';
}

const SENDER_COLORS = [
  '#E91E63', '#9C27B0', '#3F51B5', '#2196F3',
  '#00BCD4', '#009688', '#8BC34A', '#FF9800', '#FF5722',
];
function senderColor(jid: string): string {
  let h = 0;
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

function StatusTick({ status }: { status: Message['status'] }) {
  const colors = useTheme();
  if (status === 'pending') return <Text style={{ color: colors.textMuted, fontSize: 11 }}> 🕓</Text>;
  if (status === 'error') return <Text style={{ color: '#e53935', fontSize: 11 }}> ⚠️</Text>;
  const isRead = status === 'read';
  const isDouble = status === 'delivered' || isRead;
  const color = isRead ? '#53BDEB' : colors.textMuted;
  return (
    <Text style={{ color, fontSize: 11 }}>
      {isDouble ? ' ✓✓' : ' ✓'}
    </Text>
  );
}

function MsgActionBtn({
  onReply,
  onCopy,
  onReactPress,
  onForward,
}: {
  onReply: () => void;
  onCopy: () => void;
  onReactPress?: () => void;
  onForward?: () => void;
}) {
  const colors = useTheme();
  const btnStyle = {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    opacity: 0.9,
  } as const;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 2, paddingBottom: 6, gap: 2, alignSelf: 'flex-end',
    }}>
      {onReactPress && (
        <TouchableOpacity onPress={onReactPress} style={btnStyle}>
          <Text style={{ fontSize: 13 }}>😀</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onReply} style={btnStyle}>
        <Text style={{ fontSize: 13 }}>↩</Text>
      </TouchableOpacity>
      {onForward && (
        <TouchableOpacity onPress={onForward} style={btnStyle}>
          <Text style={{ fontSize: 13 }}>↪</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onCopy} style={btnStyle}>
        <Text style={{ fontSize: 12 }}>📋</Text>
      </TouchableOpacity>
    </View>
  );
}

// Emojis comuns para reagir (igual aos atalhos do WhatsApp).
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Picker de emojis (popover horizontal) ao reagir.
function ReactionPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const colors = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 6,
        alignSelf: 'flex-end',
        marginBottom: 4,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
      }}
    >
      {QUICK_EMOJIS.map((e) => (
        <TouchableOpacity key={e} onPress={() => onPick(e)}>
          <Text style={{ fontSize: 22 }}>{e}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onClose}>
        <Text style={{ fontSize: 18, color: colors.textMuted, marginLeft: 2 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// Badge de reações exibido na bolha (emojis únicos + contagem).
function ReactionBadge({ reactions }: { reactions: NonNullable<Message['reactions']> }) {
  const colors = useTheme();
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: 12,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginTop: -6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.bg,
      }}
    >
      {[...counts.entries()].map(([emoji, n]) => (
        <Text key={emoji} style={{ fontSize: 13 }}>
          {emoji}
          {n > 1 ? <Text style={{ fontSize: 11, color: colors.textMuted }}> {n}</Text> : null}
        </Text>
      ))}
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({
  message,
  token,
  isGroup,
  onRetry,
  onOpenMedia,
  onReply,
  onReact,
  onForward,
}: {
  message: Message;
  token: string | null;
  isGroup?: boolean;
  onRetry?: (m: Message) => void;
  onOpenMedia?: (m: Message) => void;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  onForward?: (m: Message) => void;
}) {
  const styles = makeStyles(useTheme());
  const colors = useTheme();
  const mine = message.fromMe;
  const showSender = isGroup && !mine;
  const mediaId = message.media?.id;
  const uri = mediaId
    ? `${API_URL}/media/${mediaId}?access_token=${encodeURIComponent(token ?? '')}`
    : undefined;
  const expired = message.media?.expired;

  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const hoverHandlers = Platform.OS === 'web'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => { setHovered(false); setShowPicker(false); } }
    : {};

  const reactions = message.reactions ?? [];
  const pickReaction = (emoji: string) => {
    setShowPicker(false);
    // toca de novo no mesmo emoji que já reagi → remove (envia vazio).
    const mineReaction = reactions.find((r) => r.fromMe)?.emoji;
    onReact?.(message, mineReaction === emoji ? '' : emoji);
  };

  const handleCopy = () => {
    if (!message.text) return;
    if (Platform.OS === 'web' && navigator?.clipboard) {
      navigator.clipboard.writeText(message.text).catch(() => undefined);
    }
  };

  return (
    <View
      style={[styles.row, mine ? styles.rowOut : (showSender ? styles.rowInGroup : styles.rowIn)]}
      {...(hoverHandlers as any)}
    >
      {/* Actions to the LEFT of bubble (for mine) */}
      {mine && hovered && onReply && (
        <MsgActionBtn onReply={() => onReply(message)} onCopy={handleCopy} onReactPress={onReact ? () => setShowPicker((v) => !v) : undefined} onForward={onForward ? () => onForward(message) : undefined} />
      )}

      {/* Avatar with initials — grupos, mensagens recebidas */}
      {showSender && (
        <View style={[styles.avatar, { backgroundColor: senderColor(message.senderJid) }]}>
          <Text style={styles.avatarText}>
            {(message.senderName ?? message.senderJid.split('@')[0]).charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={[styles.bubbleWrap, showSender && styles.bubbleWrapGroup, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
        {showPicker && (
          <ReactionPicker onPick={pickReaction} onClose={() => setShowPicker(false)} />
        )}
        <View style={[styles.bubble, mine ? styles.out : styles.in]}>
        {/* Nome do remetente em grupos */}
        {showSender && (
          <Text style={[styles.sender, { color: senderColor(message.senderJid) }]} numberOfLines={1}>
            {message.senderName ?? message.senderJid.split('@')[0]}
          </Text>
        )}
        {/* Bloco de citação */}
        {message.quoted && (
          <View style={styles.quotedBlock}>
            <View style={styles.quotedBorder} />
            <View style={styles.quotedBody}>
              {message.quoted.senderName && (
                <Text style={styles.quotedSender} numberOfLines={1}>
                  {message.quoted.senderName}
                </Text>
              )}
              <Text style={styles.quotedText} numberOfLines={2}>
                {message.quoted.text ?? quotedTypeLabel(message.quoted.type)}
              </Text>
            </View>
          </View>
        )}
        {/* Mídia */}
        {uri && !expired && message.type === 'image' && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => onOpenMedia?.(message)}>
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          </TouchableOpacity>
        )}
        {uri && !expired && message.type === 'video' &&
          (Platform.OS === 'web' ? (
            <WebVideo uri={uri} />
          ) : (
            <Video source={{ uri }} style={styles.video} useNativeControls resizeMode={ResizeMode.CONTAIN} />
          ))}
        {uri && !expired && message.type === 'audio' &&
          (Platform.OS === 'web' ? (
            <WebAudio uri={uri} />
          ) : (
            <Video source={{ uri }} style={styles.audio} useNativeControls resizeMode={ResizeMode.CONTAIN} />
          ))}
        {uri && !expired && message.type === 'document' && (
          <TouchableOpacity style={styles.doc} onPress={() => Linking.openURL(uri)}>
            <Text style={styles.docText}>📄 {message.media?.fileName ?? 'Documento'}</Text>
          </TouchableOpacity>
        )}
        {message.type !== 'text' && (expired || !mediaId) && (
          <Text style={styles.mediaLabel}>
            {message.type === 'image'
              ? '📷 Imagem'
              : message.type === 'video'
                ? '🎬 Vídeo'
                : message.type === 'audio'
                  ? '🎤 Áudio'
                  : '📄 Documento'}
            {expired ? ' (indisponível)' : ''}
          </Text>
        )}

        {!!message.text && <Text style={styles.text}>{message.text}</Text>}

        <View style={styles.meta}>
          <Text style={styles.time}>{formatTime(message.timestamp)}</Text>
          {mine && <StatusTick status={message.status} />}
        </View>
        {message.status === 'error' && onRetry && (
          <TouchableOpacity onPress={() => onRetry(message)}>
            <Text style={styles.retry}>Falha no envio — tentar novamente</Text>
          </TouchableOpacity>
        )}
        </View>
        {reactions.length > 0 && <ReactionBadge reactions={reactions} />}
      </View>

      {/* Actions to the RIGHT of bubble (for received) */}
      {!mine && hovered && onReply && (
        <MsgActionBtn onReply={() => onReply(message)} onCopy={handleCopy} onReactPress={onReact ? () => setShowPicker((v) => !v) : undefined} onForward={onForward ? () => onForward(message) : undefined} />
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  row: { paddingHorizontal: spacing.md, marginVertical: 3, flexDirection: 'row', alignItems: 'flex-end' },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  rowInGroup: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 5, flexShrink: 0, marginBottom: 2,
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bubbleWrap: { maxWidth: '80%' },
  bubbleWrapGroup: { maxWidth: '73%' },
  bubble: { borderRadius: radius.md, padding: spacing.sm, paddingHorizontal: spacing.md },
  out: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 4 },
  in: { backgroundColor: colors.bubbleIn, borderTopLeftRadius: 4 },
  text: { color: colors.text, fontSize: 15 },
  mediaLabel: { color: colors.text, fontSize: 15, marginBottom: 2 },
  image: { width: 240, height: 240, borderRadius: radius.sm, marginBottom: spacing.xs },
  video: { width: 260, height: 180, borderRadius: radius.sm, marginBottom: spacing.xs, backgroundColor: '#000' },
  audio: { width: 240, height: 48, marginBottom: spacing.xs },
  doc: { paddingVertical: spacing.sm },
  docText: { color: colors.text, fontSize: 15 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 2 },
  time: { color: colors.textMuted, fontSize: 11 },
  retry: { color: colors.danger, fontSize: 12, marginTop: 4 },
  sender: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  quotedBlock: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    overflow: 'hidden',
    maxWidth: 280,
  },
  quotedBorder: { width: 3, backgroundColor: colors.primary },
  quotedBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 4 },
  quotedSender: { color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 1 },
  quotedText: { color: colors.textMuted, fontSize: 12 },
});
