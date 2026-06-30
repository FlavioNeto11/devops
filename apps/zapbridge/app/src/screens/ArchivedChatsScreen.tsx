import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChatListItem } from '../types';
import { ChatListItemRow } from '../components/ChatListItem';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/SkeletonList';
import { Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ArchivedChats'>;

export function ArchivedChatsScreen({ navigation }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/chats', { params: { archived: true } });
        setChats(data.chats);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <View style={styles.container}><SkeletonList /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatListItemRow
            chat={item}
            onPress={() => navigation.navigate('Chat', { chatId: item.id, name: item.name, jid: item.jid })}
          />
        )}
        ListEmptyComponent={
          error ? (
            <EmptyState title="Não foi possível carregar" subtitle={error} />
          ) : (
            <EmptyState title="Nenhuma conversa arquivada" subtitle="Conversas arquivadas aparecem aqui." />
          )
        }
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
  });
