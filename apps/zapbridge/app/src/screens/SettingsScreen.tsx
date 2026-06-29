import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { api } from '../api/client';
import { aiApi } from '../api/ai';
import { confirmAction } from '../utils/confirm';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/auth.store';
import { useSessionStore } from '../store/session.store';
import { disconnectSocket } from '../realtime/socket';
import { unregisterPush } from '../notifications/push';
import { spacing, radius, Palette, ThemeName } from '../theme/theme';
import { useTheme, useThemeControls } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando',
  qr: 'Aguardando QR',
  connected: 'Conectado',
};

export function SettingsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { status, phoneNumber, reconnect, disconnect } = useSessionStore();
  const colors = useTheme();
  const styles = makeStyles(colors);
  const { name: themeName, setTheme } = useThemeControls();
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockSecret, setLockSecret] = useState('');
  const [currentSecret, setCurrentSecret] = useState('');
  const [lockSaved, setLockSaved] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [aiConsented, setAiConsented] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => setLockEnabled(!!data.lockEnabled))
      .catch(() => undefined);
    aiApi.getConsent().then((r) => setAiConsented(r.settings.consented)).catch(() => undefined);
  }, []);

  const purgeAi = async () => {
    const ok = await confirmAction('Apagar dados de IA', 'Remove embeddings, memória, base de conhecimento e histórico de ações da IA. A IA continua disponível.');
    if (!ok) return;
    await aiApi.purge().catch(() => undefined);
  };

  const saveLockSecret = async () => {
    setLockError(null);
    try {
      const { data } = await api.post('/settings/lock-secret', {
        secret: lockSecret,
        currentSecret,
      });
      setLockEnabled(!!data.lockEnabled);
      setLockSecret('');
      setCurrentSecret('');
      setLockSaved(true);
      setTimeout(() => setLockSaved(false), 2500);
    } catch (e: any) {
      setLockError(e?.response?.status === 403 ? 'Código atual incorreto' : 'Falha ao salvar');
    }
  };

  const onReconnect = async () => {
    setReconnecting(true);
    try {
      await reconnect();
    } finally {
      setReconnecting(false);
    }
  };

  const onDisconnect = async () => {
    const ok = await confirmAction(
      'Desconectar WhatsApp',
      'Deseja encerrar a sessão? Todos os dados sincronizados (chats, mensagens, contatos) serão apagados localmente. Na próxima conexão, tudo será ressincronizado.',
    );
    if (!ok) return;
    setDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setDisconnecting(false);
    }
  };

  const onLogout = async () => {
    await unregisterPush();
    disconnectSocket();
    await logout();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Section title="Conta">
        <Row label="Nome" value={user?.displayName ?? '-'} />
        <Row label="E-mail" value={user?.email ?? '-'} />
      </Section>

      <Section title="Sessão WhatsApp">
        <Row label="Número" value={phoneNumber ?? 'Não conectado'} />
        <Row label="Status" value={STATUS_LABEL[status] ?? status} />
        {status === 'connected' ? (
          <>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onReconnect} disabled={reconnecting || disconnecting}>
              {reconnecting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryText}>Reconectar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerBtn} onPress={onDisconnect} disabled={disconnecting || reconnecting}>
              {disconnecting ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.dangerText}>Desconectar WhatsApp</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('ConnectWhatsApp')}>
            <Text style={styles.primaryText}>Conectar WhatsApp</Text>
          </TouchableOpacity>
        )}
      </Section>

      <Section title="Aparência">
        <View style={styles.themeRow}>
          {(
            [
              ['system', 'Sistema'],
              ['light', 'Claro'],
              ['dark', 'Escuro'],
            ] as [ThemeName, string][]
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.themeOpt, themeName === key && styles.themeOptActive]}
              onPress={() => setTheme(key)}
            >
              <Text style={[styles.themeOptText, themeName === key && styles.themeOptTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section title="Conversas trancadas">
        <Text style={styles.about}>
          Defina um código secreto. Para ver as conversas trancadas, digite esse código na barra de
          pesquisa (como no WhatsApp Web). Tranque uma conversa pelo 🔒 no topo dela.
          {lockEnabled ? ' (código configurado)' : ''}
        </Text>
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          {lockEnabled && (
            <TextInput
              style={styles.lockInput}
              placeholder="Código atual (obrigatório para alterar/remover)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={currentSecret}
              onChangeText={setCurrentSecret}
            />
          )}
          <TextInput
            style={styles.lockInput}
            placeholder={lockEnabled ? 'Novo código (vazio = remover a tranca)' : 'Definir código secreto'}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={lockSecret}
            onChangeText={setLockSecret}
          />
          {!!lockError && <Text style={styles.lockErr}>{lockError}</Text>}
          <TouchableOpacity style={styles.primaryBtn} onPress={saveLockSecret}>
            <Text style={styles.primaryText}>{lockSaved ? 'Salvo ✓' : 'Salvar'}</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Inteligência (IA)">
        <Row label="Status" value={aiConsented ? 'Ativada' : 'Desativada'} />
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('AiConsent')}>
          <Text style={styles.secondaryText}>{aiConsented ? 'Consentimento e preferências' : '✨ Ativar IA'}</Text>
        </TouchableOpacity>
        {aiConsented && (
          <>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('AiAssistant')}>
              <Text style={styles.secondaryText}>Assistente — pergunte ao seu WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('KnowledgeBase')}>
              <Text style={styles.secondaryText}>Base de conhecimento (atendimento)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('AutoReplyConfig')}>
              <Text style={styles.secondaryText}>Auto-resposta (configuração)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerBtn} onPress={purgeAi}>
              <Text style={styles.dangerText}>Apagar dados de IA agora</Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      <Section title="Sobre">
        <Text style={styles.about}>
          ZapBridge v0.1.0 — cliente de mensageria para uso pessoal e legítimo da sua própria conta.
          Não afiliado ao WhatsApp. Sem envio em massa.
        </Text>
      </Section>

      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>Sair do app</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  primaryBtn: { padding: spacing.md, alignItems: 'center' },
  primaryText: { color: colors.primary, fontWeight: '700' },
  secondaryBtn: {
    padding: spacing.md,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  secondaryText: { color: colors.primary, fontWeight: '600' },
  dangerBtn: { padding: spacing.md, alignItems: 'center' },
  dangerText: { color: colors.danger, fontWeight: '700' },
  about: { color: colors.textMuted, padding: spacing.md, fontSize: 13, lineHeight: 19 },
  lockInput: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 15,
  },
  lockErr: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  themeOpt: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  themeOptActive: { backgroundColor: colors.primary },
  themeOptText: { color: colors.text, fontWeight: '600' },
  themeOptTextActive: { color: '#fff' },
  logoutBtn: { padding: spacing.md, alignItems: 'center', marginBottom: spacing.xl },
  logoutText: { color: colors.danger, fontWeight: '700' },
});
