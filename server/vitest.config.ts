import { defineConfig } from 'vitest/config';

/**
 * Configuración de pruebas del servidor.
 *
 * A diferencia del cliente, aquí no hay DOM: se prueban funciones puras
 * (validación, armado de SQL) y, aparte, la API completa con `supertest`.
 *
 * Las pruebas que necesitan PostgreSQL se nombran `.integration.test.ts`; para
 * dejarlas fuera sin base de datos levantada, usar el script de pruebas.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Carga server/.env antes de importar nada: `config/env.ts` valida al
    // importarse y abortaría el proceso si faltara DB_HOST.
    setupFiles: ['./src/test.env.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});