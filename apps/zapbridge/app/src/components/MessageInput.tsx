import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Platform, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const REWRITE_MODES: [string, string][] = [
  ['melhorar', '✨ Melhorar'],
  ['encurtar', '✂️ Encurtar'],
  ['formalizar', '🎩 Formalizar'],
  ['traduzir', '🌐 Traduzir'],
];

export function MessageInput({
  onSend,
  onAttach,
  onTyping,
  onSendAudio,
  disabled,
  // IA (opt-in): chips de sugestão (preenchem o campo) + ✨ reescrita do rascunho.
  suggestions,
  onClearSuggestions,
  aiEnabled,
  onRewrite,
}: {
  onSend: (text: string) => void;
  onAttach: () => void;
  onTyping?: () => void;
  onSendAudio?: (file: { uri: string; name: string; mime: string }) => void;
  disabled?: boolean;
  suggestions?: string[];
  onClearSuggestions?: () => void;
  aiEnabled?: boolean;
  onRewrite?: (text: string, mode: string) => Promise<string[]>;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [value, setValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const recorderRef = useRef<any>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    onClearSuggestions?.();
  };

  const onChange = (t: string) => {
    setValue(t);
    onTyping?.();
  };

  const useSuggestion = (s: string) => {
    setValue(s);
    onClearSuggestions?.();
  };

  const runRewrite = async (mode: string) => {
    if (!onRewrite || !value.trim()) return;
    setRewriteBusy(true);
    setVariants([]);
    try {
      const out = await onRewrite(value.trim(), mode);
      setVariants(out);
    } catch {
      setVariants([]);
    } finally {
      setRewriteBusy(false);
    }
  };

  const startTick = () => {
    setRecSecs(0);
    tickRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
  };
  const stopTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };
  useEffect(() => () => stopTick(), []);

  const toggleRecord = async () => {
    if (!onSendAudio) return;
    if (Platform.OS === 'web') {
      if (recording) {
        recorderRef.current?.stop();
        return;
      }
      try {
        const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
        const mr = new (window as any).MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e: any) => e.data.size > 0 && chunksRef.current.push(e.data);
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          stream.getTracks().forEach((t: any) => t.stop());
          stopTick();
          setRecording(false);
          if (blob.size > 0) {
            const uri = URL.createObjectURL(blob);
            onSendAudio({ uri, name: 'audio.webm', mime: blob.type || 'audio/webm' });
          }
        };
        recorderRef.current = mr;
        mr.start();
        startTick();
        setRecording(true);
      } catch {
        stopTick();
        setRecording(false);
      }
      return;
    }
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      stopTick();
      setRecording(false);
      try {
        await rec?.stopAndUnloadAsync();
        const uri = rec?.getURI();
        if (uri) onSendAudio({ uri, name: 'audio.m4a', mime: 'audio/m4a' });
      } catch {
        // descarta gravação com falha
      }
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recorderRef.current = rec;
      startTick();
      setRecording(true);
    } catch {
      stopTick();
      setRecording(false);
    }
  };

  const canRecord = !!onSendAudio;
  const showSend = value.trim().length > 0 || !canRecord;
  const showRewrite = !!aiEnabled && !!onRewrite && value.trim().length > 0 && !recording;
  const mmss = `${String(Math.floor(recSecs / 60)).padStart(2, '0')}:${String(recSecs % 60).padStart(2, '0')}`;

  return (
    <View>
      {/* Chips de sugestão de IA (preenchem o campo; o usuário edita antes de enviar). */}
      {!!suggestions?.length && !recording && (
        <View style={styles.chipsRow}>
          <Text style={styles.chipsHint}>✨</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {suggestions.slice(0, 3).map((s, i) => (
              <TouchableOpacity key={i} style={styles.chip} onPress={() => useSuggestion(s)}>
                <Text style={styles.chipText} numberOfLines={2}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClearSuggestions} style={styles.chipClose}>
            <Text style={styles.chipCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sheet de reescrita ✨ */}
      {rewriteOpen && (
        <View style={styles.rewriteSheet}>
          <View style={styles.rewriteModes}>
            {REWRITE_MODES.map(([mode, label]) => (
              <TouchableOpacity key={mode} style={styles.rewriteMode} onPress={() => runRewrite(mode)}>
                <Text style={styles.rewriteModeText}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.rewriteMode} onPress={() => { setRewriteOpen(false); setVariants([]); }}>
              <Text style={[styles.rewriteModeText, { color: colors.textMuted }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
          {rewriteBusy && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />}
          {variants.map((v, i) => (
            <TouchableOpacity key={i} style={styles.variant} onPress={() => { setValue(v); setRewriteOpen(false); setVariants([]); }}>
              <Text style={styles.variantText}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.wrap}>
        {!recording && (
          <TouchableOpacity style={styles.attach} onPress={onAttach} disabled={disabled}>
            <Text style={styles.attachIcon}>＋</Text>
          </TouchableOpacity>
        )}
        {recording ? (
          <View style={styles.recBar}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{mmss}</Text>
            <Text style={styles.recHint}>  Gravando áudio…</Text>
          </View>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Mensagem"
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={onChange}
            multiline
            editable={!disabled}
            blurOnSubmit={false}
            {...(Platform.OS === 'web'
              ? {
                  onKeyDown: (e: any) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  },
                }
              : { onSubmitEditing: submit })}
          />
        )}
        {showRewrite && (
          <TouchableOpacity style={styles.aiBtn} onPress={() => setRewriteOpen((v) => !v)} disabled={disabled}>
            <Text style={styles.aiIcon}>✨</Text>
          </TouchableOpacity>
        )}
        {showSend ? (
          <TouchableOpacity style={styles.send} onPress={submit} disabled={disabled}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.send, recording && styles.recording]} onPress={toggleRecord} disabled={disabled}>
            <Text style={styles.sendIcon}>{recording ? '■' : '🎤'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: spacing.sm,
      backgroundColor: colors.header,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    attach: { padding: spacing.sm },
    attachIcon: { color: colors.textMuted, fontSize: 24 },
    input: {
      flex: 1,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      paddingBottom: 10,
      minHeight: 42,
      maxHeight: 120,
      fontSize: 15,
      textAlignVertical: 'center',
    },
    send: {
      marginLeft: spacing.sm,
      backgroundColor: colors.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiBtn: { marginLeft: spacing.sm, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
    aiIcon: { fontSize: 18 },
    recording: { backgroundColor: colors.danger },
    sendIcon: { color: '#fff', fontSize: 18 },
    recBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      minHeight: 42,
    },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger, marginRight: 8 },
    recText: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
    recHint: { color: colors.textMuted, fontSize: 14 },
    chipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      backgroundColor: colors.header,
      gap: spacing.sm,
    },
    chipsHint: { fontSize: 14 },
    chip: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      maxWidth: 240,
    },
    chipText: { color: colors.text, fontSize: 13 },
    chipClose: { paddingHorizontal: spacing.sm },
    chipCloseText: { color: colors.textMuted, fontSize: 18 },
    rewriteSheet: {
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      padding: spacing.sm,
    },
    rewriteModes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    rewriteMode: { backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    rewriteModeText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    variant: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
    variantText: { color: colors.text, fontSize: 14 },
  });
