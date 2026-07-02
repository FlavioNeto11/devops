import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { getStoredThemeMode, toVuetifyThemeName } from '../composables/useAppTheme.js';
// Paleta monocromática institucional (slate + verde-petróleo) GERADA de
// packages/design-tokens (marca sicat): o Vuetify alimenta componentes, os tokens
// CSS (styles/tokens.generated.css) o shell — sincronia garantida na fonte.
import { sicatVuetifyThemes } from './vuetify-theme.generated.js';

export default createVuetify({
  components,
  directives,
  display: {
    mobileBreakpoint: 'sm'
  },
  theme: {
    defaultTheme: toVuetifyThemeName(getStoredThemeMode()),
    themes: sicatVuetifyThemes
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
