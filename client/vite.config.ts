import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Configuracion de Vite.
 *
 * En desarrollo el cliente llama a rutas relativas (`/api/...`) y el proxy
 * de Vite las reenvia al servidor Express. Asi no hay CORS ni URLs distintas
 * entre desarrollo y produccion: el build se sirve desde el mismo origen.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const objetivoApi = env.VITE_API_TARGET ?? 'http://localhost:4000';

  return {
    plugins: react(),
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: objetivoApi,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      // React y el router cambian muy pocas veces: separarlos del código de
      // la aplicación deja la caché del navegador válida entre despliegues entre
      // despliegues en lugar de invalidar todo el bundle.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'react';
            }
            return undefined;
          },
        },
      },
    },
  };
});