import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Platform, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export function MessageInput({
  onSend,
  onAttach,
  onTyping,
  onSendAudio,
  disabled,
}: {
  onSend: (text: string) => void;
  onAttach: () => void;
  onTyping?: () => void;
  onSendAudio?: (file: { uri: string; name: string; mime: string }) => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [value, setValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recorderRef = useRef<any>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const onChange = (t: string) => {
    setValue(t);
    onTyping?.();
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

  // Gravação de voz: web/PWA via MediaRecorder; nativo via expo-av.
  const toggleRecord = async () => {
    if (!onSendAudio) return;

    // ---- Web / PWA (MediaRecorder) ----
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

    // ---- Nativo (expo-av) ----
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
  const mmss = `${String(Math.floor(recSecs / 60)).padStart(2, '0')}:${String(recSecs % 60).padStart(2, '0')}`;

  return (
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
          // móvel: blurOnSubmit=false mantém o teclado aberto
          blurOnSubmit={false}
          // web: onKeyDown intercepta Enter antes de inserir newline
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
      {showSend ? (
        <TouchableOpacity style={styles.send} onPress={submit} disabled={disabled}>
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.send, recording && styles.recording]}
          onPress={toggleRecord}
          disabled={disabled}
        >
          <Text style={styles.sendIcon}>{recording ? '■' : '🎤'}</Text>
        </TouchableOpacity>
      )}
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
      // Android: alinha o cursor ao centro na linha única
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
  });
