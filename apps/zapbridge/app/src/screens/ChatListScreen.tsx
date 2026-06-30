import React, { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useChatsStore } from '../store/chats.store';
import { useSessionStore } from '../store/session.store';
import { ChatListItemRow } from '../components/ChatListItem';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { InstallBanner } from '../components/InstallBanner';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/SkeletonList';
import { WhatsAppTabBar } from '../components/WhatsAppTabBar';
import { routeTab } from '../navigation/tabs';
import { IconSearch, IconPlus, IconDots, IconArchive, IconChevronRight } from '../components/icons';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatList'>;
type Filter = 'all' | 'unread' | 'favorites' | 'groups';

export function ChatListScreen({ navigation }: Props) {
  const { chats, loading, search, setSearch, fetchChats } = useChatsStore();
  const status = useSessionStore((s) => s.status);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [archivedCount, setArchivedCount] = useState(0);
  const colors = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const unreadChats = chats.filter((c) => c.unreadCount > 0).length;
  const groupCount = chats.filter((c) => c.kind === 'group').length;

  const visibleChats = chats.filter((c) => {
    if (filter === 'unread') return c.unreadCount > 0;
    if (filter === 'groups') return c.kind === 'group';
    if (filter === 'favorites') return false; // ZapBridge ainda não tem favoritos
    return true;
  });

  // Recarrega conversas + contagem de arquivadas ao focar.
  useFocusEffect(
    React.useCallback(() => {
      fetchChats();
      api
        .get('/chats', { params: { archived: true } })
        .then((r) => setArchivedCount((r.data.chats ?? []).length))
        .catch(() => undefined);
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

  const CHIPS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'unread', label: 'Não lidas', count: unreadChats },
    { key: 'favorites', label: 'Favoritos' },
    { key: 'groups', label: 'Grupos', count: groupCount },
  ];

  const ListHeader =
    archivedCount > 0 && filter === 'all' ? (
      <TouchableOpacity style={styles.archivedRow} onPress={() => navigation.navigate('ArchivedChats')}>
        <View style={styles.archivedIcon}>
          <IconArchive size={20} color={colors.textMuted} />
        </View>
        <Text style={styles.archivedText}>Arquivadas</Text>
        <Text style={styles.archivedCount}>{archivedCount}</Text>
        <IconChevronRight size={16} color={colors.textMuted} />
      </TouchableOpacity>
    ) : null;

  return (
    <View style={styles.container}>
      {/* Cabeçalho estilo iOS: ações no topo + título grande "Conversas". */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <IconDots size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => navigation.navigate('AiAssistant')} hitSlop={10} style={styles.aiBtn}>
            <Text style={styles.aiSparkle}>✨</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Contacts')} style={styles.plusBtn} activeOpacity={0.85}>
            <IconPlus size={22} color="#0b0b0b" />
          </TouchableOpacity>
        </View>
        <Text style={styles.bigTitle}>Conversas</Text>
      </View>

      <ConnectionBanner />
      <InstallBanner />

      {disconnected && (
        <TouchableOpacity style={styles.connectCta} onPress={() => navigation.navigate('ConnectWhatsApp')}>
          <Text style={styles.connectText}>Conectar WhatsApp →</Text>
        </TouchableOpacity>
      )}

      {/* Busca com lupa interna. */}
      <View style={styles.searchWrap}>
        <View style={styles.searchField}>
          <IconSearch size={17} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="Pergunte à IA ou pesquise"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Chips de filtro com contadores. */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {CHIPS.map((c) => {
            const active = filter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setFilter(c.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {c.label}
                  {c.count ? ` ${c.count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && chats.length === 0 ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visibleChats}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          renderItem={({ item }) => (
            <ChatListItemRow
              chat={item}
              onPress={() =>
                navigation.navigate('Chat', { chatId: item.id, name: item.name, jid: item.jid })
              }
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              title={filter === 'favorites' ? 'Nenhum favorito ainda' : 'Nenhuma conversa'}
              subtitle={
                filter === 'favorites'
                  ? 'Conversas marcadas como favoritas aparecerão aqui.'
                  : 'Conecte sua conta e suas conversas aparecerão aqui.'
              }
            />
          }
        />
      )}

      {/* Barra de abas inferior (estilo WhatsApp). */}
      <WhatsAppTabBar active="chats" unread={unreadChats} onTab={(k) => routeTab(navigation, k)} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 2 },
    topRow: { flexDirection: 'row', alignItems: 'center', height: 36, gap: spacing.md },
    aiBtn: { paddingHorizontal: 2 },
    aiSparkle: { fontSize: 19 },
    plusBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bigTitle: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 2 },
    connectCta: { backgroundColor: colors.primaryDark, padding: spacing.md, alignItems: 'center' },
    connectText: { color: '#fff', fontWeight: '700' },
    searchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      height: 38,
    },
    search: { flex: 1, color: colors.text, fontSize: 16, padding: 0 },
    tabsWrap: { paddingVertical: spacing.sm },
    tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
    tab: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    tabActive: { backgroundColor: 'rgba(37,211,102,0.22)' },
    tabText: { color: colors.textMuted, fontSize: 13.5, fontWeight: '600' },
    tabTextActive: { color: colors.primary },
    archivedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    archivedIcon: { width: 24, alignItems: 'center' },
    archivedText: { color: colors.text, fontSize: 16, flex: 1 },
    archivedCount: { color: colors.textMuted, fontSize: 13 },
  });
