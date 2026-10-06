import { readFileSync } from 'node:fs';

/**
 * Carga `server/.env` en `process.env` antes de que se importe cualquier
 * módulo del servidor.
 *
 * Hace falta porque en producción se arranca con `node --env-file=.env`, pero
 * Vitest no lo hace, y `config/env.ts` valida las variables al importarse: sin
 * esto abortaría el proceso con "Configuración inválida" antes de empezar.
 *
 * Solo se completa lo que falte, así que las variables ya definidas (CI, shell)
 * tienen prioridad.
 */

const archivo = new URL('../.env', import.meta.url);

try {
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const limpio = linea.trim();
    if (!limpio || limpio.startsWith('#')) continue;
    const igual = limpio.indexOf('=');
    if (igual < 1) continue;
    const clave = limpio.slice(0, igual).trim();
    const valor = limpio
      .slice(igual + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    process.env[clave] ??= valor;
  }
} catch {
  console.warn(
    '[entorno] No se encontró server/.env. Las pruebas de integración necesitan la base de datos.',
  );
}
