import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { aiApi, KbSource } from '../api/ai';
import { errorMessage } from '../api/client';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'KnowledgeBase'>;

export function KnowledgeBaseScreen(_props: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [sources, setSources] = useState<KbSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => aiApi.kbList().then(setSources).catch(() => setSources([])).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!name.trim() || !text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await aiApi.kbAddText(name.trim(), text);
      setName('');
      setText('');
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (sid: string) => {
    await aiApi.kbRemove(sid).catch(() => undefined);
    reload();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.p}>
        Suba seu catálogo, FAQ ou tabela de preços (texto). A IA usa essa base para responder dúvidas com dados reais
        (busca semântica e auto-resposta).
      </Text>

      <Text style={styles.label}>Nova fonte</Text>
      <TextInput style={styles.input} placeholder="Nome (ex.: Tabela de preços)" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      <TextInput style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]} placeholder="Cole aqui o conteúdo (markdown/texto)…" placeholderTextColor={colors.textMuted} value={text} onChangeText={setText} multiline />
      {!!err && <Text style={styles.err}>{err}</Text>}
      <TouchableOpacity style={styles.primaryBtn} onPress={add} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Adicionar à base</Text>}
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: spacing.xl }]}>Fontes ({sources.length})</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : sources.length === 0 ? (
        <Text style={styles.empty}>Nenhuma fonte ainda.</Text>
      ) : (
        sources.map((s) => (
          <View key={s.sourceId} style={styles.sourceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceName}>{s.name}</Text>
              <Text style={styles.sourceMeta}>{s.chunks} trechos</Text>
            </View>
            <TouchableOpacity onPress={() => remove(s.sourceId)}>
              <Text style={styles.remove}>Remover</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    p: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
    label: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', marginBottom: spacing.sm },
    input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm, fontSize: 15 },
    err: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
    primaryText: { color: '#fff', fontWeight: '700' },
    empty: { color: colors.textMuted, fontSize: 14 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
    sourceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    sourceMeta: { color: colors.textMuted, fontSize: 12 },
    remove: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  });
