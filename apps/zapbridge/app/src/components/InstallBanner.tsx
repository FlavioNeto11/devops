import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const W: any = typeof window !== 'undefined' ? window : {};

const isStandalone = () =>
  !!(W.matchMedia?.('(display-mode: standalone)')?.matches || W.navigator?.standalone === true);

const isIos = () => /iphone|ipad|ipod/i.test(W.navigator?.userAgent || '');

const DISMISS_KEY = 'zb-install-dismissed';

// Banner "Instalar app": dispara o prompt nativo (Android/desktop) ou abre
// instruções (iPhone). Some quando já instalado ou dispensado.
export function InstallBanner() {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isStandalone()) return;
    try {
      if (W.localStorage?.getItem(DISMISS_KEY)) return;
    } catch {
      // ignora
    }
    setVisible(!!W.__deferredInstallPrompt || isIos());
    const onInstallable = () => setVisible(true);
    const onInstalled = () => setVisible(false);
    W.addEventListener?.('pwa-installable', onInstallable);
    W.addEventListener?.('pwa-installed', onInstalled);
    return () => {
      W.removeEventListener?.('pwa-installable', onInstallable);
      W.removeEventListener?.('pwa-installed', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      W.localStorage?.setItem(DISMISS_KEY, '1');
    } catch {
      // ignora
    }
  };

  const install = async () => {
    const dp = W.__deferredInstallPrompt;
    if (dp) {
      dp.prompt();
      await dp.userChoice?.catch(() => undefined);
      W.__deferredInstallPrompt = null;
      setVisible(false);
    } else {
      setShowIosHelp(true);
    }
  };

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <>
      <View style={styles.banner}>
        <Text style={styles.icon}>📲</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Instalar o ZapBridge</Text>
          <Text style={styles.sub} numberOfLines={1}>Abra como um app, em tela cheia.</Text>
        </View>
        <TouchableOpacity style={styles.btn} onPress={install}>
          <Text style={styles.btnText}>Instalar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.close} onPress={dismiss}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      {showIosHelp && <IosHelp onClose={() => setShowIosHelp(false)} colors={colors} />}
    </>
  );
}

// Modal com o passo a passo de instalação no iPhone (Safari).
function IosHelp({ onClose, colors }: { onClose: () => void; colors: Palette }) {
  const styles = makeStyles(colors);
  const steps: [string, string][] = [
    ['1', 'Abra esta página no Safari (se estiver em outro navegador).'],
    ['2', 'Toque no botão Compartilhar — o quadrado com a seta para cima ↑.'],
    ['3', 'Role para baixo e toque em "Adicionar à Tela de Início".'],
    ['4', 'Confirme em "Adicionar". O ícone aparece na tela inicial.'],
  ];
  return (
    <View style={styles.modalBackdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Instalar no iPhone</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        {steps.map(([n, t]) => (
          <View key={n} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{n}</Text>
            </View>
            <Text style={styles.stepText}>{t}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.modalBtn} onPress={onClose}>
          <Text style={styles.modalBtnText}>Entendi</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    icon: { fontSize: 22 },
    title: { color: colors.text, fontSize: 14, fontWeight: '700' },
    sub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    close: { paddingHorizontal: 6, paddingVertical: 4 },
    closeText: { color: colors.textMuted, fontSize: 18 },

    modalBackdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    modal: {
      width: '90%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: spacing.lg,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
    stepNum: {
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      marginRight: spacing.sm, marginTop: 1,
    },
    stepNumText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    stepText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 },
    modalBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
