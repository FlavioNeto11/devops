import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api, errorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

interface Contact {
  id: string;
  jid: string;
  name: string | null;
  pushName: string | null;
}

// Cor determinística do avatar (igual ao padrão usado nas bolhas de grupo).
const AVATAR_COLORS = ['#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#00BCD4', '#009688', '#8BC34A', '#FF9800', '#FF5722'];
function avatarColor(jid: string): string {
  let h = 0;
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function contactName(c: Contact): string {
  return c.name ?? c.pushName ?? phoneOf(c.jid) ?? c.jid.split('@')[0];
}
// Número (+DDI…) apenas para JIDs de telefone; @lid não é número mostrável.
function phoneOf(jid: string): string | null {
  if (jid.endsWith('@s.whatsapp.net')) return `+${jid.split('@')[0].split(':')[0]}`;
  return null;
}

export function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState(false);
  const colors = useTheme();
  const styles = makeStyles(colors);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Nova conversa' });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/contacts');
        setContacts(data.contacts);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Só contatos com algum nome (ignora números soltos sem identificação) e filtra pela busca.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => c.name || c.pushName)
      .filter((c) => {
        if (!q) return true;
        return (
          contactName(c).toLowerCase().includes(q) ||
          (phoneOf(c.jid) ?? '').includes(q)
        );
      });
  }, [contacts, search]);

  // Abre (ou cria) a conversa e navega para ela.
  const openContact = async (c: Contact) => {
    if (opening) return;
    setOpening(true);
    try {
      const { data } = await api.post('/chats/open', { jid: c.jid });
      const chat = data.chat;
      navigation.replace('Chat', { chatId: chat.id, name: chat.name ?? contactName(c), jid: chat.jid });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.search}
          placeholder="Buscar nome ou número"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const name = contactName(item);
          const phone = phoneOf(item.jid);
          const sub = item.pushName && item.pushName !== name ? item.pushName : phone;
          return (
            <TouchableOpacity style={styles.row} onPress={() => openContact(item)} activeOpacity={0.6}>
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.jid) }]}>
                <Text style={styles.avatarText}>{name.trim().slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title={error ? 'Falha ao carregar contatos' : search ? 'Nenhum contato encontrado' : 'Nenhum contato sincronizado'}
            subtitle={error ?? (search ? 'Tente outro nome ou número.' : 'Os contatos aparecem após a sincronização.')}
          />
        }
      />

      {opening && (
        <View style={styles.openingOverlay}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
    },
    searchIcon: { fontSize: 14, marginRight: 6, opacity: 0.6 },
    search: { flex: 1, color: colors.text, paddingVertical: spacing.sm, fontSize: 15 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10 },
    avatar: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    body: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 6 },
    name: { color: colors.text, fontSize: 16 },
    sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    openingOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
  });
