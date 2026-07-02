import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api, errorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { spacing, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Groups'>;

interface Group {
  id: string;
  jid: string;
  subject: string | null;
}

export function GroupsScreen({ navigation }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colors = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/groups');
        setGroups(data.groups);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={groups}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() =>
            navigation.navigate('Chat', { chatId: item.id, name: item.subject, jid: item.jid })
          }
          onLongPress={() => navigation.navigate('GroupDetails', { chatId: item.id, name: item.subject })}
        >
          <Text style={styles.name}>👥 {item.subject ?? item.jid}</Text>
          <Text style={styles.hint}>Toque para abrir · segure para ver detalhes</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <EmptyState
          title={error ? 'Falha ao carregar grupos' : 'Nenhum grupo sincronizado'}
          subtitle={error ?? 'Os grupos aparecem após a sincronização.'}
        />
      }
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  row: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { color: colors.text, fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
