import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { aiApi, AssistantResult } from '../api/ai';
import { errorMessage } from '../api/client';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AiAssistant'>;

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  proposals?: AssistantResult['proposals'];
  done?: Record<number, 'ok' | 'fail'>;
}

export function AiAssistantScreen(_props: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', text: 'Pergunte sobre suas conversas — ex.: "onde combinei o pagamento com o João?" ou "resuma e proponha uma resposta para o último cliente".' },
  ]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const msg = value.trim();
    if (!msg || busy) return;
    setValue('');
    setTurns((p) => [...p, { role: 'user', text: msg }]);
    setBusy(true);
    try {
      const r = await aiApi.assistant(msg);
      setTurns((p) => [...p, { role: 'assistant', text: r.text || '(sem resposta)', proposals: r.proposals, done: {} }]);
    } catch (e) {
      setTurns((p) => [...p, { role: 'assistant', text: errorMessage(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (turnIdx: number, propIdx: number, token: string) => {
    try {
      await aiApi.confirm(token);
      setTurns((p) => p.map((t, i) => (i === turnIdx ? { ...t, done: { ...(t.done ?? {}), [propIdx]: 'ok' } } : t)));
    } catch {
      setTurns((p) => p.map((t, i) => (i === turnIdx ? { ...t, done: { ...(t.done ?? {}), [propIdx]: 'fail' } } : t)));
    }
  };

  const proposalLabel = (name: string, args: Record<string, unknown>): string => {
    if (name === 'send_message') return `Enviar: "${String(args.text ?? '')}"`;
    if (name === 'react') return `Reagir com ${String(args.emoji ?? '')}`;
    if (name === 'mark_read') return 'Marcar como lida';
    return name;
  };

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {turns.map((t, i) => (
          <View key={i} style={[styles.bubble, t.role === 'user' ? styles.user : styles.assistant]}>
            <Text style={t.role === 'user' ? styles.userText : styles.assistantText}>{t.text}</Text>
            {t.proposals?.map((pr, j) => {
              const state = t.done?.[j];
              return (
                <View key={j} style={styles.proposal}>
                  <Text style={styles.proposalText}>🤖 {proposalLabel(pr.name, pr.arguments)}</Text>
                  {state === 'ok' ? (
                    <Text style={styles.proposalDone}>✓ Feito</Text>
                  ) : state === 'fail' ? (
                    <Text style={styles.proposalFail}>Falhou</Text>
                  ) : (
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(i, j, pr.token)}>
                      <Text style={styles.confirmText}>Confirmar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ))}
        {busy && <ActivityIndicator color={colors.primary} />}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Pergunte ao seu WhatsApp…"
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={setValue}
          multiline
          {...(Platform.OS === 'web' ? { onKeyDown: (e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } } : { onSubmitEditing: send })}
        />
        <TouchableOpacity style={styles.send} onPress={send} disabled={busy}>
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    bubble: { borderRadius: radius.md, padding: spacing.md, maxWidth: '90%' },
    user: { backgroundColor: colors.bubbleOut, alignSelf: 'flex-end' },
    assistant: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
    userText: { color: colors.bubbleOutText, fontSize: 14 },
    assistantText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    proposal: { marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    proposalText: { color: colors.text, fontSize: 13, flex: 1 },
    confirmBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    confirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    proposalDone: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    proposalFail: { color: colors.danger, fontWeight: '700', fontSize: 13 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, backgroundColor: colors.header, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    input: { flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, maxHeight: 120, fontSize: 15 },
    send: { marginLeft: spacing.sm, backgroundColor: colors.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    sendIcon: { color: '#fff', fontSize: 18 },
  });
