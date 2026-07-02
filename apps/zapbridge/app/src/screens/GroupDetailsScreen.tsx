import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api, errorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetails'>;

interface Participant {
  jid: string;
  name: string | null;
  isAdmin: boolean;
}
interface GroupDetail {
  id: string;
  jid: string;
  subject: string | null;
  description: string | null;
  ownerJid: string | null;
  participants: Participant[];
}

export function GroupDetailsScreen({ route }: Props) {
  const { chatId } = route.params;
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colors = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/groups/${chatId}`);
        setGroup(data.group);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [chatId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !group) {
    return <EmptyState title="Não foi possível carregar os detalhes" subtitle={error ?? undefined} />;
  }

  const jidToPhone = (jid: string) => jid.split('@')[0].split(':')[0];

  return (
    <FlatList
      style={styles.container}
      data={group.participants}
      keyExtractor={(p) => p.jid}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(group.subject ?? '#').slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={styles.subject}>{group.subject ?? group.jid}</Text>
          {!!group.description && <Text style={styles.desc}>{group.description}</Text>}
          <Text style={styles.count}>
            {group.participants.length} participante{group.participants.length === 1 ? '' : 's'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.name ?? jidToPhone(item.jid)}</Text>
          {item.isAdmin && <Text style={styles.admin}>admin</Text>}
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          title="Sem participantes disponíveis"
          subtitle="A lista aparece quando os metadados do grupo são sincronizados."
        />
      }
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { alignItems: 'center', padding: spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subject: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  desc: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  count: { color: colors.textMuted, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { color: colors.text, fontSize: 16 },
  admin: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
