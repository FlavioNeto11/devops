import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChatKind } from '../types';
import { useChatsStore } from '../store/chats.store';
import { useSessionStore } from '../store/session.store';
import { ChatListItemRow } from '../components/ChatListItem';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { InstallBanner } from '../components/InstallBanner';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/SkeletonList';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatList'>;

export function ChatListScreen({ navigation }: Props) {
  const { chats, loading, error, search, setSearch, fetchChats } = useChatsStore();
  const status = useSessionStore((s) => s.status);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | ChatKind>('all');
  const colors = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const visibleChats = filter === 'all' ? chats : chats.filter((c) => c.kind === filter);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: 12 }}>
          <Text style={{ color: colors.text, fontSize: 20 }}>⚙︎</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Recarrega conversas ao focar.
  useFocusEffect(
    React.useCallback(() => {
      fetchChats();
    }, []),
  );

  // Busca com pequeno debounce.
  useEffect(() => {
    const t = setTimeout(() => fetchChats(), 300);
    return () => clearTimeout(t);
  }, [search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChats();
    setRefreshing(false);
  };

  const disconnected = status !== 'connected';

  return (
    <View style={styles.container}>
      <ConnectionBanner />
      <InstallBanner />

      {disconnected && (
        <TouchableOpacity style={styles.connectCta} onPress={() => navigation.navigate('ConnectWhatsApp')}>
          <Text style={styles.connectText}>Conectar WhatsApp →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Pesquisar conversas"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.tabs}>
        {([
          ['all', 'Tudo'],
          ['chat', 'Conversas'],
          ['group', 'Grupos'],
          ['channel', 'Canais'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, filter === key && styles.tabActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.tabText, filter === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && chats.length === 0 ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visibleChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatListItemRow
              chat={item}
              onPress={() =>
                navigation.navigate('Chat', { chatId: item.id, name: item.name, jid: item.jid })
              }
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            error ? (
              <EmptyState title="Não foi possível carregar conversas" subtitle={error} />
            ) : (
              <EmptyState
                title="Nenhuma conversa ainda"
                subtitle="Conecte sua conta e suas conversas aparecerão aqui."
              />
            )
          }
        />
      )}

      {/* FAB nova conversa (estilo WhatsApp). bottom respeita a safe-area (home indicator). */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => navigation.navigate('Contacts')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>💬</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  connectCta: { backgroundColor: colors.primaryDark, padding: spacing.md, alignItems: 'center' },
  connectText: { color: '#fff', fontWeight: '700' },
  searchWrap: { padding: spacing.sm, paddingBottom: 0 },
  search: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primaryDark },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabIcon: { fontSize: 24 },
});
