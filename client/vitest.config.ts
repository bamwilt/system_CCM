import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Configuración de pruebas.
 *
 * `environment: 'jsdom'` simula el DOM para poder montar componentes React.
 * `globals: true` evita tener que importar `describe`/`it` en cada archivo, y
 * `setupFiles` registra los matchers de jest-dom (`toBeInTheDocument`, etc.).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/preparacion.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
