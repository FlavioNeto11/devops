import React, { useRef } from 'react';
import { View, Text, Image, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { ChatListItem as ChatItem, MessageStatus } from '../types';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { IconCheck } from './icons';

const MEDIA_LABELS: Record<string, string> = {
  image: '📷 Foto',
  video: '🎬 Vídeo',
  audio: '🎤 Mensagem de voz',
  document: '📄 Documento',
};

// Texto da prévia SEM o "Você:" (as enviadas mostram ✓✓ no lugar — estilo WhatsApp).
function previewText(chat: ChatItem): string {
  if (!chat.lastMessage) return 'Sem mensagens';
  const { text, type, fromMe, senderName } = chat.lastMessage;
  let prefix = '';
  if (!fromMe && chat.isGroup && senderName) prefix = `${senderName}: `;
  if (type === 'text') return prefix + (text ?? '');
  return prefix + (MEDIA_LABELS[type] ?? 'Mídia');
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string | null): string {
  if (!name) return '#';
  return name.trim().slice(0, 2).toUpperCase();
}

function FadeAvatar({ uri, style, fallback }: { uri: string; style: any; fallback: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  return (
    <>
      <Animated.Image
        source={{ uri }}
        style={[style, { opacity, position: 'absolute' }]}
        onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start()}
      />
      <Animated.View style={[style, { opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        {fallback}
      </Animated.View>
    </>
  );
}

export function ChatListItemRow({
  chat,
  onPress,
  isTyping,
}: {
  chat: ChatItem;
  onPress: () => void;
  isTyping?: boolean;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const lm = chat.lastMessage;
  const showCheck = !!lm && lm.fromMe && lm.type !== undefined && !isTyping;
  const status: MessageStatus = lm?.status ?? 'sent';
  const checkColor =
    status === 'read' ? colors.link : status === 'error' ? colors.danger : colors.textMuted;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        {chat.avatarUrl ? (
          <FadeAvatar
            uri={chat.avatarUrl}
            style={styles.avatar}
            fallback={<Text style={styles.avatarText}>{initials(chat.name)}</Text>}
          />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(chat.name)}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {chat.kind === 'group' ? '👥 ' : chat.kind === 'channel' ? '📢 ' : ''}
            {chat.name ?? chat.jid}
          </Text>
          <Text style={[styles.time, chat.unreadCount > 0 && { color: colors.primary }]}>
            {formatTime(chat.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.titleRow}>
          {isTyping ? (
            <Text style={styles.typing} numberOfLines={1}>digitando…</Text>
          ) : (
            <View style={styles.previewWrap}>
              {showCheck && (
                <View style={styles.check}>
                  <IconCheck size={16} color={checkColor} double={status === 'delivered' || status === 'read'} />
                </View>
              )}
              <Text style={styles.preview} numberOfLines={1}>
                {previewText(chat)}
              </Text>
            </View>
          )}
          {chat.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chat.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: spacing.md, alignItems: 'center' },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  time: { color: colors.textMuted, fontSize: 12 },
  previewWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm, marginTop: 2 },
  check: { marginRight: 3 },
  preview: { color: colors.textMuted, fontSize: 14, flex: 1 },
  typing: { color: colors.primary, fontSize: 14, flex: 1, marginRight: spacing.sm, marginTop: 2 },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#0b0b0b', fontSize: 12, fontWeight: '700' },
});
