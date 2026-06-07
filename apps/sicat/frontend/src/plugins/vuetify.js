import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { getStoredThemeMode, toVuetifyThemeName } from '../composables/useAppTheme.js';

const vuexyTheme = {
  dark: false,
  colors: {
    primary: '#0F9D72',
    secondary: '#2D7A66',
    success: '#1E9E57',
    warning: '#D7831A',
    error: '#D64D4D',
    info: '#199FA4',
    background: '#F2F8F4',
    surface: '#FFFFFF',
    'surface-bright': '#FFFFFF',
    'surface-light': '#EDF7F0'
  }
};

export default createVuetify({
  components,
  directives,
  display: {
    mobileBreakpoint: 'sm'
  },
  theme: {
    defaultTheme: toVuetifyThemeName(getStoredThemeMode()),
    themes: {
      vuexy: vuexyTheme,
      vuexyDark: {
        dark: true,
        colors: {
          primary: '#34C993',
          secondary: '#54A78A',
          success: '#4BD98A',
          warning: '#F4B650',
          error: '#F07F7F',
          info: '#4CC9CC',
          background: '#03131A',
          surface: '#08222B',
          'surface-bright': '#0E2C36',
          'surface-light': '#103642'
        }
      }
    }
  },
  defaults: {
    global: {
      style: '--v-font-family: var(--font-family-base); font-family: var(--font-family-base);'
    },
    VBtn: {
      style: 'text-transform: capitalize;',
      rounded: 'lg'
    },
    VCard: {
      rounded: 'xl',
      elevation: 0
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: 'auto'
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: 'auto'
    },
    VTextarea: {
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: 'auto'
    },
    VSheet: {
      rounded: 'xl'
    },
    VTable: {
      hover: true
    }
  }
});
