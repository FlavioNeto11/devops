import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Animated, Easing,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { aiApi, AssistantResult } from '../api/ai';
import { errorMessage } from '../api/client';
import { Markdown } from '../components/Markdown';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AiAssistant'>;

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  proposals?: AssistantResult['proposals'];
  done?: Record<number, 'ok' | 'fail'>;
  error?: boolean;
}

const STARTERS = [
  'Com quem eu falei ultimamente?',
  'Resuma minhas conversas não lidas',
  'O que combinei com a última pessoa?',
  'Onde falaram sobre pagamento?',
];

const GREETING =
  'Pergunte sobre suas conversas — ex.: "onde combinei o pagamento com o João?" ou "resuma e proponha uma resposta para o último cliente".';

function TypingDots({ color }: { color: string }) {
  const a = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const loops = a.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.ease, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(v, { toValue: 0.3, duration: 320, easing: Easing.ease, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
      {a.map((v, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: v }} />
      ))}
    </View>
  );
}

function copyText(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
    (navigator as any).clipboard.writeText(text).catch(() => undefined);
  }
}

export function AiAssistantScreen({ navigation }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const clear = () => { setTurns([]); setValue(''); };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        turns.length ? (
          <TouchableOpacity onPress={clear} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>＋ Nova</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, turns.length, colors]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [turns, busy]);

  const send = async (msgArg?: string) => {
    const msg = (msgArg ?? value).trim();
    if (!msg || busy) return;
    setValue('');
    setTurns((p) => [...p, { role: 'user', text: msg }]);
    setBusy(true);
    try {
      const r = await aiApi.assistant(msg);
      setTurns((p) => [...p, { role: 'assistant', text: r.text || '(sem resposta)', proposals: r.proposals, done: {} }]);
    } catch (e) {
      setTurns((p) => [...p, { role: 'assistant', text: errorMessage(e), error: true }]);
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

  const doCopy = (idx: number, text: string) => {
    copyText(text);
    setCopied(idx);
    setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1500);
  };

  const proposalLabel = (name: string, args: Record<string, unknown>): string => {
    if (name === 'send_message') return `Enviar “${String(args.text ?? '')}”`;
    if (name === 'react') return `Reagir com ${String(args.emoji ?? '')}`;
    if (name === 'mark_read') return 'Marcar como lida';
    return name;
  };

  const empty = turns.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {empty && (
          <View style={styles.welcome}>
            <Text style={styles.welcomeIcon}>✨</Text>
            <Text style={styles.welcomeText}>{GREETING}</Text>
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <TouchableOpacity key={s} style={styles.starter} onPress={() => send(s)}>
                  <Text style={styles.starterText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {turns.map((t, i) =>
          t.role === 'user' ? (
            <View key={i} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{t.text}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={styles.assistantRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>✨</Text></View>
              <View style={styles.assistantBubble}>
                {t.error ? (
                  <Text style={styles.errText}>{t.text}</Text>
                ) : (
                  <Markdown text={t.text} />
                )}
                {t.proposals?.map((pr, j) => {
                  const state = t.done?.[j];
                  return (
                    <View key={j} style={styles.proposal}>
                      <Text style={styles.proposalText} numberOfLines={2}>🤖 {proposalLabel(pr.name, pr.arguments)}</Text>
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
                {!t.error && (
                  <TouchableOpacity style={styles.copyBtn} onPress={() => doCopy(i, t.text)}>
                    <Text style={styles.copyText}>{copied === i ? '✓ copiado' : '⧉ copiar'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ),
        )}

        {busy && (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>✨</Text></View>
            <View style={[styles.assistantBubble, { paddingVertical: spacing.md }]}>
              <TypingDots color={colors.textMuted} />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Pergunte ao seu WhatsApp…"
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={setValue}
          multiline
          editable={!busy}
          {...(Platform.OS === 'web'
            ? { onKeyDown: (e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } }
            : { onSubmitEditing: () => send() })}
        />
        <TouchableOpacity
          style={[styles.send, (!value.trim() || busy) && styles.sendDisabled]}
          onPress={() => send()}
          disabled={!value.trim() || busy}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.md, gap: spacing.md },
    welcome: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
    welcomeIcon: { fontSize: 40 },
    welcomeText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: spacing.md },
    starters: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
    starter: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    starterText: { color: colors.text, fontSize: 14 },

    userRow: { alignItems: 'flex-end' },
    userBubble: { backgroundColor: colors.bubbleOut, borderRadius: radius.md, borderTopRightRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '85%' },
    userText: { color: colors.bubbleOutText, fontSize: 14.5, lineHeight: 20 },

    assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, maxWidth: '96%' },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    avatarText: { fontSize: 15 },
    assistantBubble: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderTopLeftRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    errText: { color: colors.danger, fontSize: 14 },

    proposal: { marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    proposalText: { color: colors.text, fontSize: 13, flex: 1 },
    confirmBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    confirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    proposalDone: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    proposalFail: { color: colors.danger, fontWeight: '700', fontSize: 13 },

    copyBtn: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: 2 },
    copyText: { color: colors.textMuted, fontSize: 12 },

    inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, backgroundColor: colors.header, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    input: { flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, maxHeight: 140, fontSize: 15 },
    send: { marginLeft: spacing.sm, backgroundColor: colors.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    sendDisabled: { opacity: 0.45 },
    sendIcon: { color: '#fff', fontSize: 18 },
  });
