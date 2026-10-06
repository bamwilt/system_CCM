import { activarMensajesEnEspanol } from './lib/zod-es.js';
// Mensajes de validación en español en toda la API. Debe ejecutarse antes de
// que se definan los esquemas de Zod de las rutas.
activarMensajesEnEspanol();
import { crearApp } from './app.js';
import { env } from './config/env.js';
import { checkDb, closePool, pool } from './db/pool.js';
/**
 * Punto de entrada de la API.
 *
 * Las variables de entorno se cargan con `--env-file=.env` (ver los scripts de
 * package.json), que es la forma nativa de Node 22 y evita la dependencia
 * `dotenv`.
 */
const app = crearApp();
const server = app.listen(env.PORT, async () => {
    const dbOk = await checkDb();
    console.log('');
    console.log(`  API CCM  ->  http://localhost:${env.PORT}`);
    console.log(`  Entorno  ->  ${env.NODE_ENV}`);
    console.log(`  Base     ->  ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}  ${dbOk ? '(conectada)' : '(SIN CONEXIÓN)'}`);
    if (!dbOk) {
        console.log('');
        console.log('  No se pudo conectar a PostgreSQL. Verificá que esté corriendo y');
        console.log('  que server/.env tenga las credenciales correctas.');
        console.log('  Para reconstruir la base:  ./db/reset-db.sh');
    }
    console.log('');
});
/** Cierre ordenado: primero se deja de aceptar requests, luego se cierra el pool. */
function apagar(senal) {
    console.log(`\n${senal} recibido, cerrando...`);
    server.close(() => {
        void closePool().finally(() => process.exit(0));
    });
    // Si algo se cuelga, no quedamos colgados para siempre.
    setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
process.on('unhandledRejection', (motivo) => {
    console.error('[promesa rechazada sin manejar]', motivo);
    void pool.end().finally(() => process.exit(1));
});
//# sourceMappingURL=index.js.map