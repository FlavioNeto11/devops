const THEME_STORAGE_KEY = 'sicat.ui.theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

function hasStorage() {
  return globalThis.localStorage !== undefined;
}

function hasDocument() {
  return typeof document !== 'undefined' && Boolean(document.documentElement);
}

export function normalizeThemeMode(value) {
  return value === THEME_DARK || value === 'vuexyDark' ? THEME_DARK : THEME_LIGHT;
}

export function toVuetifyThemeName(mode) {
  return normalizeThemeMode(mode) === THEME_DARK ? 'vuexyDark' : 'vuexy';
}

export function fromVuetifyThemeName(themeName) {
  return normalizeThemeMode(themeName);
}

export function getStoredThemeMode() {
  if (!hasStorage()) {
    return THEME_LIGHT;
  }

  const storedTheme = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  return normalizeThemeMode(storedTheme);
}

export function syncThemeSideEffects(mode) {
  const normalizedTheme = normalizeThemeMode(mode);

  if (hasDocument()) {
    document.documentElement.dataset.theme = normalizedTheme;
  }

  if (hasStorage()) {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  }
}

export function applyAppTheme(theme, mode) {
  const normalizedTheme = normalizeThemeMode(mode);
  const vuetifyThemeName = toVuetifyThemeName(normalizedTheme);

  if (theme?.global?.name) {
    theme.global.name.value = vuetifyThemeName;
  }

  if (typeof theme?.change === 'function') {
    theme.change(vuetifyThemeName);
  }

  syncThemeSideEffects(normalizedTheme);
  return normalizedTheme;
}

export function applyStoredAppTheme(theme) {
  return applyAppTheme(theme, getStoredThemeMode());
}

export function toggleAppTheme(theme, isDarkTheme) {
  return applyAppTheme(theme, isDarkTheme ? THEME_LIGHT : THEME_DARK);
}

export function bootstrapDocumentTheme() {
  syncThemeSideEffects(getStoredThemeMode());
}
