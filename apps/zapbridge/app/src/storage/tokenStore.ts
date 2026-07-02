import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Abstração de armazenamento: SecureStore no nativo, localStorage na web
// (expo-secure-store não existe na web). Mesma API assíncrona nos dois.

export async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignora (modo privado etc.)
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignora
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
