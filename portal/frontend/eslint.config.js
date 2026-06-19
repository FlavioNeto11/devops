// Flat config (ESLint 9) — portal NovaIT (vanilla ESM).
// Browser para os assets, Node para os testes. Sem framework.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // sincronizados de packages/platform-shell (codegen-sync; lint/format vivem no pacote)
  { ignores: ['node_modules/**', 'assets/platform-shell.js', 'assets/platform-shell.css', 'assets/platform-tokens.css'] },
  js.configs.recommended,
  {
    files: ['assets/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['test/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
