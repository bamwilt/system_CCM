import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      // No está instalado eslint-plugin-react-hooks.
      'react-hooks/exhaustive-deps': 'off',
      // Regla ruidosa con muchos falsos positivos en este proyecto.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.*', 'index.html'],
  }
);