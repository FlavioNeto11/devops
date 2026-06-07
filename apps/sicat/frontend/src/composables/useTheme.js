import { ref } from 'vue';

const THEME_STORAGE_KEY = 'sicat.ui.theme';

export function useTheme() {
  const currentTheme = ref('light');

  function applyTheme(nextTheme) {
    const normalizedTheme = nextTheme === 'dark' ? 'dark' : 'light';
    currentTheme.value = normalizedTheme;

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', normalizedTheme);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    }
  }

  function initTheme() {
    if (typeof localStorage === 'undefined') {
      applyTheme('light');
      return;
    }

    const preferredTheme = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(preferredTheme === 'dark' ? 'dark' : 'light');
  }

  function toggleTheme() {
    applyTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
  }

  return {
    currentTheme,
    initTheme,
    applyTheme,
    toggleTheme
  };
}
