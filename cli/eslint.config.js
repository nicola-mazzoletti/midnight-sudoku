import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

const config = tseslint.config(
  {
    ignores: ['eslint.config.js', 'vitest.config.js', 'vitest.setup.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      '@typescript-eslint/no-redeclare': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
);

export default config;
