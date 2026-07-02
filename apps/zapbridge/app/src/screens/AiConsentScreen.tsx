import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { aiApi } from '../api/ai';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AiConsent'>;

const TONES: [string, string][] = [
  ['informal', 'Informal'],
  ['neutro', 'Neutro'],
  ['formal', 'Formal'],
];

export function AiConsentScreen({ navigation }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(true);
  const [consented, setConsented] = useState(false);
  const [tone, setTone] = useState('neutro');
  const [includeGroups, setIncludeGroups] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    aiApi
      .getConsent()
      .then((r) => {
        setConsented(r.settings.consented);
        setTone(r.settings.tone);
        setIncludeGroups(r.settings.includeGroups);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const accept = async () => {
    setBusy(true);
    try {
      await aiApi.accept({ tone, includeGroups, suggestionsEnabled: true });
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await aiApi.revoke();
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.h1}>✨ Inteligência (IA)</Text>
      <Text style={styles.p}>
        A IA ajuda você a responder mais rápido (sugestões de resposta, reescrita, resumo) e a buscar no seu
        histórico. É <Text style={styles.b}>opcional</Text> e você controla tudo.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>O que é enviado</Text>
        <Text style={styles.li}>• O texto das conversas que você usar com a IA (ex.: últimas mensagens do chat para sugerir uma resposta).</Text>
        <Text style={styles.li}>• Reescrita envia apenas o seu rascunho.</Text>
        <Text style={styles.cardTitle}>Para onde</Text>
        <Text style={styles.li}>• Para a Anthropic (Claude) para gerar texto e a OpenAI para a busca por significado.</Text>
        <Text style={styles.cardTitle}>O que NÃO acontece</Text>
        <Text style={styles.li}>• Não treinamos modelos com suas mensagens.</Text>
        <Text style={styles.li}>• A IA nunca envia uma mensagem sem você confirmar.</Text>
        <Text style={styles.li}>• Grupos ficam fora por padrão (mensagens de terceiros).</Text>
        <Text style={styles.li}>• Você pode apagar todos os dados de IA quando quiser.</Text>
      </View>

      <Text style={styles.label}>Tom das sugestões</Text>
      <View style={styles.toneRow}>
        {TONES.map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[styles.toneOpt, tone === k && styles.toneActive]} onPress={() => setTone(k)}>
            <Text style={[styles.toneText, tone === k && styles.toneTextActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Incluir grupos (não recomendado)</Text>
        <Switch value={includeGroups} onValueChange={setIncludeGroups} trackColor={{ true: colors.primary }} />
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={accept} disabled={busy}>
        <Text style={styles.primaryText}>{consented ? 'Salvar' : 'Ativar IA'}</Text>
      </TouchableOpacity>
      {consented && (
        <TouchableOpacity style={styles.dangerBtn} onPress={revoke} disabled={busy}>
          <Text style={styles.dangerText}>Desligar a IA</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    h1: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: spacing.sm },
    p: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
    b: { color: colors.text, fontWeight: '700' },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
    cardTitle: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: spacing.sm, marginBottom: 4 },
    li: { color: colors.text, fontSize: 13, lineHeight: 19 },
    label: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', marginBottom: spacing.sm },
    toneRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    toneOpt: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
    toneActive: { backgroundColor: colors.primary },
    toneText: { color: colors.text, fontWeight: '600' },
    toneTextActive: { color: '#fff' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
    switchLabel: { color: colors.text, fontSize: 14, flex: 1 },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    dangerBtn: { padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    dangerText: { color: colors.danger, fontWeight: '700' },
  });
