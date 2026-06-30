// Barra de abas inferior no estilo do WhatsApp iOS.
// Abas reais do ZapBridge: Conversas (lista) e Você (Configurações). As demais
// (Atualizações/Ligações/Comunidades) abrem uma tela "em breve" — visual idêntico.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { IconUpdates, IconCalls, IconCommunities, IconChats, IconPerson } from './icons';

export type TabKey = 'updates' | 'calls' | 'communities' | 'chats' | 'you';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'updates', label: 'Atualizações' },
  { key: 'calls', label: 'Ligações' },
  { key: 'communities', label: 'Comunidades' },
  { key: 'chats', label: 'Conversas' },
  { key: 'you', label: 'Você' },
];

function TabIcon({ tab, color, active }: { tab: TabKey; color: string; active: boolean }) {
  switch (tab) {
    case 'updates':
      return <IconUpdates color={color} />;
    case 'calls':
      return <IconCalls color={color} />;
    case 'communities':
      return <IconCommunities color={color} />;
    case 'chats':
      return <IconChats color={color} filled={active} />;
    case 'you':
      return <IconPerson color={color} />;
  }
}

export function WhatsAppTabBar({
  active,
  unread = 0,
  onTab,
}: {
  active: TabKey;
  unread?: number;
  onTab: (key: TabKey) => void;
}) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? colors.primary : colors.textMuted;
        return (
          <TouchableOpacity key={t.key} style={styles.item} onPress={() => onTab(t.key)} activeOpacity={0.7}>
            <View>
              <TabIcon tab={t.key} color={color} active={isActive} />
              {t.key === 'chats' && unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.header,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3 },
    label: { fontSize: 10.5, fontWeight: '500' },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: '#0b0b0b', fontSize: 10, fontWeight: '800' },
  });
