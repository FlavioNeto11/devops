import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.sm },
});
