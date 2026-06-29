import { Alert, Platform } from 'react-native';

// Confirmação cross-platform. No nativo usa Alert.alert; na web usa window.confirm
// (Alert.alert é no-op no react-native-web). Retorna true se o usuário confirmar.
export function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
