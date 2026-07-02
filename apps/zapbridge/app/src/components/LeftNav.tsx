import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onSettings: () => void;
}

function NavBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useTheme();
  const inner = (
    <View style={s.btn}>
      <Text style={[s.icon, { color: active ? colors.primary : colors.textMuted }]}>{icon}</Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityLabel={label}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export function LeftNav({ onSettings }: Props) {
  const colors = useTheme();
  return (
    <View
      style={[
        s.strip,
        { backgroundColor: colors.surface, borderRightColor: colors.border },
      ]}
    >
      <View style={s.top}>
        <NavBtn icon="▣" label="Chats" active />
        <NavBtn icon="◎" label="Status" />
        <NavBtn icon="⊳" label="Canais" />
        <NavBtn icon="⊞" label="Comunidades" />
      </View>
      <View style={s.bottom}>
        <NavBtn icon="⚙" label="Configurações" onPress={onSettings} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  strip: {
    width: 64,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  top: {
    alignItems: 'center',
    gap: 2,
  },
  bottom: {
    alignItems: 'center',
  },
  btn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  icon: {
    fontSize: 22,
  },
});
