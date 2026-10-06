import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * ESLint del cliente React.
 *
 * Se usa `react-hooks` en lugar de `eslint-plugin-react`: este ultimo todavia
 * no declara soporte para ESLint 10 y sus reglas (`react/prop-types` y demas)
 * son redundantes con TypeScript en modo estricto. El plugin de hooks si es
 * imprescindible, porque detecta errores de dependencias y renderizado que el
 * typecheck no ve.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
);