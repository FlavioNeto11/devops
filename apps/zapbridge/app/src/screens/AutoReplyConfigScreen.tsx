import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { aiApi } from '../api/ai';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AutoReplyConfig'>;

export function AutoReplyConfigScreen(_props: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(true);
  const [startHour, setStartHour] = useState('8');
  const [endHour, setEndHour] = useState('20');
  const [maxPerChat, setMaxPerChat] = useState('20');
  const [disclaimer, setDisclaimer] = useState('Você está falando com um assistente. Digite *humano* para falar com uma pessoa.');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    aiApi.getConsent().then((r) => {
      const a = (r.settings.autoreply ?? {}) as any;
      if (a.startHour != null) setStartHour(String(a.startHour));
      if (a.endHour != null) setEndHour(String(a.endHour));
      if (a.maxPerChat != null) setMaxPerChat(String(a.maxPerChat));
      if (typeof a.disclaimer === 'string') setDisclaimer(a.disclaimer);
    }).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await aiApi.updateSettings({
        autoreply: {
          startHour: Number(startHour) || 0,
          endHour: Number(endHour) || 24,
          maxPerChat: Number(maxPerChat) || 20,
          minConfidence: 0.6,
          disclaimer,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.p}>
        A auto-resposta responde clientes automaticamente, <Text style={styles.b}>apenas com base na sua base de conhecimento</Text>,
        dentro do horário e do limite abaixo. Quando a IA não tem certeza, ela <Text style={styles.b}>não responde</Text> e marca
        a conversa como "precisa de você". Nunca opera em grupos. Ative por conversa (no chat).
      </Text>

      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Início (h)</Text>
          <TextInput style={styles.input} keyboardType="number-pad" value={startHour} onChangeText={setStartHour} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Fim (h)</Text>
          <TextInput style={styles.input} keyboardType="number-pad" value={endHour} onChangeText={setEndHour} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Máx/dia</Text>
          <TextInput style={styles.input} keyboardType="number-pad" value={maxPerChat} onChangeText={setMaxPerChat} />
        </View>
      </View>

      <Text style={styles.label}>Aviso ao cliente (1ª resposta)</Text>
      <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={disclaimer} onChangeText={setDisclaimer} multiline />

      <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={busy}>
        <Text style={styles.primaryText}>{saved ? 'Salvo ✓' : 'Salvar configuração'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    p: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
    b: { color: colors.text, fontWeight: '700' },
    row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    field: { flex: 1 },
    label: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
    input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.sm, padding: spacing.md, fontSize: 15, marginBottom: spacing.sm },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
    primaryText: { color: '#fff', fontWeight: '700' },
  });
