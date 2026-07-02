import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { InstallBanner } from '../components/InstallBanner';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Landing'>;

// Landing (web): apresenta o produto e leva para o app web ou para instalar no celular.
export function LandingScreen({ navigation }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const pageUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin + '/zapbridge'
      : 'https://dev.nvit.com.br/zapbridge';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InstallBanner />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.logo}>ZapBridge</Text>
        <Text style={styles.tagline}>Suas conversas, do seu jeito — em qualquer tela.</Text>
        <Text style={styles.desc}>
          Um cliente de mensageria moderno que conecta à sua própria conta de WhatsApp via QR Code.
          Veja e responda conversas em tempo real, no navegador ou no celular.
        </Text>

        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.ctaText}>Abrir o app web →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cards}>
        <Card
          title="🌐 Versão web"
          body="Use agora no navegador, sem instalar nada. Crie sua conta, conecte o WhatsApp e comece a conversar."
          actionLabel="Usar no navegador"
          onPress={() => navigation.navigate('Login')}
        />
        <Card
          title="📱 No celular (Android/iOS)"
          body={`Para a melhor experiência (e notificações), use o app mobile. Abra ${pageUrl} no celular ou rode via Expo Go a partir do projeto.`}
        />
      </View>

      <View style={styles.steps}>
        <Text style={styles.stepsTitle}>Como funciona</Text>
        <Step n="1" t="Crie sua conta no ZapBridge (e-mail e senha)." />
        <Step n="2" t="Conecte seu WhatsApp escaneando o QR Code com o celular dono da conta." />
        <Step n="3" t="Pronto: suas conversas sincronizam e você envia/recebe em tempo real." />
      </View>

      <Text style={styles.legal}>
        Uso legítimo: conecte apenas a sua própria conta. O ZapBridge não é afiliado ao WhatsApp e não
        faz envio em massa.
      </Text>
      </ScrollView>
    </View>
  );
}

function Card({
  title,
  body,
  actionLabel,
  onPress,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      {actionLabel && onPress && (
        <TouchableOpacity style={styles.cardBtn} onPress={onPress}>
          <Text style={styles.cardBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Step({ n, t }: { n: string; t: string }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{t}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, maxWidth: 820, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  logo: { color: colors.primary, fontSize: 44, fontWeight: '800' },
  tagline: { color: colors.text, fontSize: 18, marginTop: spacing.sm, textAlign: 'center' },
  desc: { color: colors.textMuted, fontSize: 15, marginTop: spacing.md, textAlign: 'center', lineHeight: 22 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  card: {
    flexGrow: 1,
    flexBasis: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cardBody: { color: colors.textMuted, fontSize: 14, marginTop: spacing.sm, lineHeight: 20 },
  cardBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cardBtnText: { color: colors.primary, fontWeight: '700' },
  steps: { marginTop: spacing.xl },
  stepsTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepBadgeText: { color: '#fff', fontWeight: '700' },
  stepText: { color: colors.text, fontSize: 15, flex: 1 },
  legal: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18 },
});
