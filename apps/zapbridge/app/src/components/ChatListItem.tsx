import React, { useRef } from 'react';
import { View, Text, Image, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { ChatListItem as ChatItem } from '../types';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

function previewText(chat: ChatItem): string {
  if (!chat.lastMessage) return 'Sem mensagens';
  const { text, type, fromMe, senderName } = chat.lastMessage;
  let prefix = '';
  if (fromMe) {
    prefix = 'Você: ';
  } else if (chat.isGroup && senderName) {
    prefix = `${senderName}: `;
  }
  if (type === 'text') return prefix + (text ?? '');
  const labels: Record<string, string> = {
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    audio: '🎤 Áudio',
    document: '📄 Documento',
  };
  return prefix + (labels[type] ?? 'Mídia');
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
          <Text style={styles.time}>{formatTime(chat.lastMessageAt)}</Text>
        </View>
        <View style={styles.titleRow}>
          {isTyping ? (
            <Text style={styles.typing} numberOfLines={1}>digitando…</Text>
          ) : (
            <Text style={styles.preview} numberOfLines={1}>
              {previewText(chat)}
            </Text>
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
  row: { flexDirection: 'row', padding: spacing.md, alignItems: 'center' },
  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  time: { color: colors.textMuted, fontSize: 12 },
  preview: { color: colors.textMuted, fontSize: 14, flex: 1, marginRight: spacing.sm, marginTop: 2 },
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
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
