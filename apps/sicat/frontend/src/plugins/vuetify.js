import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { getStoredThemeMode, toVuetifyThemeName } from '../composables/useAppTheme.js';

// Paleta monocromática institucional (ver styles/tokens.css): chrome em escala
// neutra de cinza-frio; UM acento verde-petróleo escuro. Manter em sincronia
// com os tokens CSS — o Vuetify alimenta componentes, os tokens o shell.
const vuexyTheme = {
  dark: false,
  colors: {
    primary: '#0E6E5C',
    secondary: '#45565E',
    success: '#1F7E58',
    warning: '#B06A14',
    error: '#C24444',
    info: '#1F758A',
    background: '#F5F7F8',
    surface: '#FFFFFF',
    'surface-bright': '#FFFFFF',
    'surface-light': '#F0F3F4'
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
          primary: '#35B493',
          secondary: '#97A8B0',
          success: '#4CC28E',
          warning: '#DCA557',
          error: '#E07B7B',
          info: '#56B8C4',
          background: '#0C1114',
          surface: '#131A1E',
          'surface-bright': '#192328',
          'surface-light': '#1E2A30'
        }
      }
    }
  },
  defaults: {
    global: {
      style: '--v-font-family: var(--font-family-base); font-family: var(--font-family-base);'
    },
    VBtn: {
      style: 'text-transform: none; letter-spacing: 0.01em;',
      rounded: 'lg'
    },
    VCard: {
      rounded: 'lg',
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
    VCombobox: {
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: 'auto'
    },
    VAutocomplete: {
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
      rounded: 'lg'
    },
    VTable: {
      hover: true
    }
  }
});
