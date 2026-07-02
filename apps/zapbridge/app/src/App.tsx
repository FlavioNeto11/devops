import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './navigation/RootNavigator';
import { useAuthStore } from './store/auth.store';
import { useSessionStore } from './store/session.store';
import { useChatsStore } from './store/chats.store';
import { registerForPush } from './notifications/push';
import { ThemeProvider, useTheme, useThemeControls } from './theme/ThemeContext';

function AppInner() {
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const colors = useTheme();
  const { resolved } = useThemeControls();

  // Revalida o token salvo ao abrir (substitui uma Splash dedicada).
  useEffect(() => {
    bootstrap();
  }, []);

  // Ao autenticar, liga os listeners de tempo real (sessão + chats) e registra push.
  useEffect(() => {
    if (user) {
      useSessionStore.getState().bindRealtime();
      useChatsStore.getState().bindRealtime();
      registerForPush();
    }
  }, [user]);

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.header,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  if (bootstrapping) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.fill}>
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
