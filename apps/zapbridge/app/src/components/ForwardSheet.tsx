import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { api } from '../api/client';
import { ChatListItem } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, Palette } from '../theme/theme';

// Modal para escolher a conversa de destino ao encaminhar. Busca os chats sozinho.
export function ForwardSheet({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (chatId: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setLoading(true);
    api
      .get('/chats')
      .then(({ data }) => setChats(data.chats ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [visible]);

  if (!visible) return null;
  const q = search.trim().toLowerCase();
  const filtered = q ? chats.filter((c) => (c.name ?? '').toLowerCase().includes(q)) : chats;

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Encaminhar para…</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Buscar conversa"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => onSelect(item.id)} activeOpacity={0.6}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{(item.name ?? '#').slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.name} numberOfLines={1}>
                  {item.kind === 'group' ? '👥 ' : item.kind === 'channel' ? '📢 ' : ''}
                  {item.name ?? item.jid}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    sheet: {
      width: '90%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
      paddingBottom: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    close: { color: colors.textMuted, fontSize: 20 },
    search: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      borderRadius: radius.lg,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 14,
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
    },
    avatarTxt: { color: colors.text, fontWeight: '700', fontSize: 13 },
    name: { color: colors.text, fontSize: 15, flex: 1 },
  });
