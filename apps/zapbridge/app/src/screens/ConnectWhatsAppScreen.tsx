import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useSessionStore } from '../store/session.store';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectWhatsApp'>;
type Mode = 'qr' | 'pairing';

// Código de pareamento do WhatsApp: 8 caracteres exibidos como XXXX-XXXX.
function formatCode(code: string | null): string {
  if (!code) return '';
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : code;
}

export function ConnectWhatsAppScreen({ navigation }: Props) {
  const { status, qr, pairingCode, error, start, startPairing, setQr, setPairingCode, setError } =
    useSessionStore();
  const [mode, setMode] = useState<Mode>('qr');
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const colors = useTheme();
  const styles = makeStyles(colors);

  // Ao trocar de aba: limpa o estado e (no QR) inicia a geração.
  useEffect(() => {
    setQr(null);
    setPairingCode(null);
    setError(null);
    setCopied(false);
    if (mode === 'qr') start();
  }, [mode]);

  // Quando conectar, volta para a lista de conversas.
  useEffect(() => {
    if (status === 'connected') navigation.replace('ChatList');
  }, [status]);

  const switchMode = (m: Mode) => {
    if (m !== mode) setMode(m);
  };

  const copyCode = async () => {
    const text = formatCode(pairingCode);
    try {
      if (Platform.OS === 'web' && (navigator as any)?.clipboard) {
        await (navigator as any).clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignora
    }
  };

  const digits = phone.replace(/\D/g, '');
  const canGenerate = digits.length >= 8;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Conectar WhatsApp</Text>

        <View style={styles.tabs}>
          <Tab label="QR Code" active={mode === 'qr'} onPress={() => switchMode('qr')} />
          <Tab
            label="Número de telefone"
            active={mode === 'pairing'}
            onPress={() => switchMode('pairing')}
          />
        </View>

        {mode === 'qr' ? (
          <View style={styles.section}>
            <Text style={styles.help}>
              No celular dono da conta: WhatsApp → Aparelhos conectados → Conectar um aparelho, e
              aponte a câmera para o código.
            </Text>
            <View style={styles.qrBox}>
              {qr ? (
                <Image source={{ uri: qr }} style={styles.qr} resizeMode="contain" />
              ) : (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.qrLoading}>
                    {status === 'connecting' ? 'Gerando QR Code…' : 'Aguardando…'}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.linkBtn} onPress={() => start()}>
              <Text style={styles.linkText}>Gerar novo código</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            {!pairingCode ? (
              <>
                <Text style={styles.help}>
                  Digite o número desta conta com DDI e DDD. Geramos um código de 8 dígitos para você
                  inserir no WhatsApp do celular.
                </Text>
                <View style={styles.phoneRow}>
                  <Text style={styles.plus}>+</Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="55 11 99999 8888"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={[styles.button, !canGenerate && styles.buttonDisabled]}
                  onPress={() => startPairing(digits)}
                  disabled={!canGenerate}
                >
                  {status === 'connecting' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Gerar código</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Código em destaque + copiar */}
                <Text style={styles.codeLabel}>Seu código de pareamento</Text>
                <TouchableOpacity style={styles.codeBox} onPress={copyCode} activeOpacity={0.8}>
                  <Text style={styles.code}>{formatCode(pairingCode)}</Text>
                  <Text style={styles.copyHint}>{copied ? '✓ Copiado' : '📋 Toque para copiar'}</Text>
                </TouchableOpacity>

                {/* Passos */}
                <View style={styles.steps}>
                  <Step n={1} colors={colors}>Abra o WhatsApp no celular desta conta.</Step>
                  <Step n={2} colors={colors}>
                    Toque em <Text style={styles.b}>Aparelhos conectados</Text> →{' '}
                    <Text style={styles.b}>Conectar um aparelho</Text>.
                  </Step>
                  <Step n={3} colors={colors}>
                    Toque em <Text style={styles.b}>Conectar com número de telefone</Text>.
                  </Step>
                  <Step n={4} colors={colors}>Digite o código acima no celular.</Step>
                </View>

                <View style={styles.waitingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.waitingText}>Aguardando confirmação no celular…</Text>
                </View>

                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => {
                    setPairingCode(null);
                    setPhone('');
                  }}
                >
                  <Text style={styles.linkText}>Usar outro número</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.legal}>
          Uso legítimo: conecte apenas a sua própria conta. O ZapBridge não é afiliado ao WhatsApp.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = makeStyles(useTheme());
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Step({ n, colors, children }: { n: number; colors: Palette; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm }}>
      <View
        style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
          marginRight: spacing.sm, marginTop: 1,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{n}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: {
      alignItems: 'center',
      padding: spacing.xl,
      paddingBottom: spacing.xl * 2,
      maxWidth: 480,
      alignSelf: 'center',
      width: '100%',
    },
    title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: spacing.lg },
    tabs: { flexDirection: 'row', marginBottom: spacing.xl, gap: spacing.sm },
    tab: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
    tabText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
    tabTextActive: { color: '#fff' },
    section: { width: '100%', alignItems: 'center' },
    help: { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
    qrBox: {
      width: 260, height: 260,
      backgroundColor: '#fff',
      borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    qr: { width: 240, height: 240 },
    center: { alignItems: 'center', justifyContent: 'center' },
    qrLoading: { color: '#667781', marginTop: spacing.md },

    // Telefone
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      width: '100%',
      marginBottom: spacing.md,
    },
    plus: { color: colors.text, fontSize: 18, fontWeight: '600', marginRight: 4 },
    phoneInput: { flex: 1, color: colors.text, paddingVertical: spacing.md, fontSize: 18, letterSpacing: 1 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      width: '100%',
      minHeight: 48,
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    // Código
    codeLabel: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
    codeBox: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      width: '100%',
      marginBottom: spacing.lg,
    },
    code: {
      color: colors.primary,
      fontSize: 40,
      fontWeight: '800',
      letterSpacing: 8,
      fontVariant: ['tabular-nums'],
      ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
    },
    copyHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },

    steps: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    b: { fontWeight: '700', color: colors.text },

    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    waitingText: { color: colors.textMuted, fontSize: 13 },

    error: { color: colors.danger, marginTop: spacing.lg, textAlign: 'center' },
    linkBtn: { marginTop: spacing.md, padding: spacing.sm },
    linkText: { color: colors.primary, fontWeight: '600' },
    legal: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: spacing.xl },
  });
