import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { darkColors, lightColors, Palette, ThemeName } from './theme';
import { storageGet, storageSet } from '../storage/tokenStore';

const KEY = 'zapbridge.theme';

interface ThemeCtx {
  colors: Palette;
  name: ThemeName;
  resolved: 'light' | 'dark';
  setTheme: (n: ThemeName) => void;
}

const defaultCtx: ThemeCtx = {
  colors: darkColors,
  name: 'dark',
  resolved: 'dark',
  setTheme: () => undefined,
};

const ThemeContext = createContext<ThemeCtx>(defaultCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>('dark');

  useEffect(() => {
    storageGet(KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setName(v);
    });
  }, []);

  const sysScheme = Appearance.getColorScheme();
  const resolved: 'light' | 'dark' =
    name === 'system' ? (sysScheme === 'light' ? 'light' : 'dark') : name;
  const colors = resolved === 'light' ? lightColors : darkColors;

  const setTheme = (n: ThemeName) => {
    setName(n);
    storageSet(KEY, n);
  };

  return (
    <ThemeContext.Provider value={{ colors, name, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Retorna a paleta ativa (uso: `const colors = useTheme()`).
export const useTheme = (): Palette => useContext(ThemeContext).colors;
// Controles de tema (nome atual + setter) para a tela de configurações.
export const useThemeControls = () => useContext(ThemeContext);
