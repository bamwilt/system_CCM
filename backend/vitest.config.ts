import { defineConfig } from 'vitest/config';

/**
 * Configuracion de la suite de pruebas del backend SGPM.
 *
 * Contexto medido (FASE 5, lote sgpm-fase5-cierre-v3):
 * la suite corre contra PostgreSQL 16 real por socket Unix y cada prueba de
 * autenticacion realiza logines bcrypt con coste 12 (decision de seguridad
 * deliberada: anti-enumeracion). Bajo carga de maquina (load promedio > 3)
 * una prueba individual puede pasar de 5 s, momento en que Vitest la aborta
 * con "Test timed out in 5000ms". Se midio: la misma suite da 218/218 PASS con
 * la maquina libre (~283 s) y 17 timeouts con la maquina cargada (~470 s),
 * sin que falle ninguna asercion.
 *
 * Por eso el timeout por defecto se sube a 30 s: NO relaja ninguna asercion ni
 * oculta fallos logicos; solo da tiempo de reloj suficiente a trabajos de CPU
 * legitimos. Los tiempos observados por prueba individual estan muy por debajo.
 *
 * La ejecucion serial (--no-file-parallelism) es obligatoria: todas las suites
 * comparten la misma base de datos de prueba. Ver script "test" en package.json.
 */
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    // Los archivos de prueba comparten una unica base de datos PostgreSQL:
    // la paralizacion entre archivos provoca fallo masivo (medido: 102 FAIL).
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
