import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Palette, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { WhatsAppTabBar, TabKey } from '../components/WhatsAppTabBar';
import { IconUpdates, IconCalls, IconCommunities } from '../components/icons';
import { routeTab } from '../navigation/tabs';

type Props = NativeStackScreenProps<RootStackParamList, 'ComingSoon'>;

function BigIcon({ tab, color }: { tab: TabKey; color: string }) {
  if (tab === 'updates') return <IconUpdates size={64} color={color} />;
  if (tab === 'calls') return <IconCalls size={60} color={color} />;
  if (tab === 'communities') return <IconCommunities size={66} color={color} />;
  return null;
}

export function ComingSoonScreen({ navigation, route }: Props) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const tab = route.params?.tab ?? 'updates';
  const title = route.params?.title ?? '';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.bigTitle}>{title}</Text>
      </View>
      <View style={styles.center}>
        <BigIcon tab={tab} color={colors.surfaceAlt} />
        <Text style={styles.emptyTitle}>Em breve</Text>
        <Text style={styles.emptySub}>Este recurso ainda não está disponível no ZapBridge.</Text>
      </View>
      <WhatsAppTabBar active={tab} onTab={(k) => routeTab(navigation, k)} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    bigTitle: { color: colors.text, fontSize: 30, fontWeight: '800' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
    emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: spacing.md },
    emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 260 },
  });
