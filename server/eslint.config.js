import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ESLint plano (sin dependencias extra de configuración).
 *
 * Se ejecuta `npm run lint` para detectar código muerto, promesas sin
 * await y problemas de tipos antes de que lleguen a producción.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // `vitest.config.ts` está fuera de `include` de tsconfig.json (su
          // rootDir es src/), pero ESLint igual lo tiene que poder tipar.
          allowDefaultProject: ['vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // El middleware de auth ya garantiza la presencia de `req.usuario`,
      // por lo que el `!` posterior no necesita un chequeo adicional.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Sin `any` implícito en el código de la app.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // Ignore deben justificarse.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },

  // Los tests y el arranque pueden usar console freely.
  {
    files: ['src/index.ts', 'src/config/env.ts'],
    rules: { '@typescript-eslint/no-unnecessary-condition': 'off' },
  },

  /**
   * En los tests, `response.body` de supertest viene como `any`: los JSON que
   * se comprueban son justamente datos sin tipar. Anotarlos uno por uno los
   * haría ilegibles sin aportar nada, porque el tipo real lo verifica el
   * `tsc --noEmit` (que sí cubre los archivos de prueba).
   */
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);