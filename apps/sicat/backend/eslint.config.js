import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "frontend/**",
      "storage/**",
      ".git/**"
    ]
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest"
      }
    },
    rules: {}
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest"
    },
    rules: {}
  }
];
