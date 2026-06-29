import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSessionStore } from '../store/session.store';
import { spacing, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const LABEL: Record<string, string> = {
  disconnected: 'WhatsApp desconectado',
  logged_out: 'Você removeu o ZapBridge pelo celular — reconecte',
  connecting: 'Conectando ao WhatsApp…',
  qr: 'Aguardando leitura do QR Code',
  connected: 'Conectado',
};

// Banner global do estado da sessão. Não renderiza nada quando conectado.
export function ConnectionBanner() {
  const status = useSessionStore((s) => s.status);
  const colors = useTheme();
  const styles = makeStyles(colors);
  if (status === 'connected') return null;

  const bg =
    status === 'disconnected' || status === 'logged_out'
      ? colors.danger
      : status === 'connecting'
        ? colors.warning
        : colors.surfaceAlt;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={styles.text}>{LABEL[status] ?? status}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  banner: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  text: { color: '#fff', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
