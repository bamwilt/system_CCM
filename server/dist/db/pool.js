import pg from 'pg';
import { env, isProd } from '../config/env.js';
/**
 * Pool de conexiones a PostgreSQL.
 *
 * En `pg` los `bigint` y los `numeric` llegan como string para no perder
 * precisión. CCM no usa ninguno de esos tipos (todo es int/smallint), pero
 * se parsean igual los dos casos por si el esquema crece.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
export const pool = new pg.Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
pool.on('error', (err) => {
    // Un cliente que se cae a mitad de una query no debe tumbar el proceso.
    console.error('[db] error del pool:', err.message);
});
/**
 * Ejecuta un SELECT y devuelve las filas.
 *
 * Las queries SIEMPRE usan placeholders ($1, $2, ...). Nunca se concatena
 * texto de usuario dentro de una cadena SQL: los valores viajan aparte y
 * PostgreSQL los escapa. Los identificadores dinámicos (columna de orden, tabla)
 * se validan contra listas blancas en `lib/crud.ts`.
 */
export async function query(text, params = []) {
    const res = await pool.query(text, params);
    return res.rows;
}
/** Igual que `query` pero devuelve la primera fila, o `undefined`. */
export async function queryOne(text, params = []) {
    const rows = await query(text, params);
    return rows[0];
}
/**
 * Ejecuta un INSERT/UPDATE/DELETE y devuelve la fila afectada.
 * Falla si la operación no tocó ninguna fila.
 */
export async function queryOneRequired(text, params = [], contexto = 'registro') {
    const fila = await queryOne(text, params);
    if (!fila) {
        throw Object.assign(new Error(`No se encontró el ${contexto}`), {
            code: 'NOT_FOUND',
        });
    }
    return fila;
}
/**
 * Ejecuta `fn` dentro de una transacción.
 *
 * Hace falta cuando una sola operación de la API toca varias tablas: si la
 * segunda sentencia falla, la primera debe revertirse. Sin esto, un alta de
 * docente a medias dejaría un empleado huérfano en `empleados`.
 *
 * El cliente se toma del pool y se devuelve al terminar, incluso si hay error.
 */
export async function transaccion(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const resultado = await fn(client);
        await client.query('COMMIT');
        return resultado;
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => {
            // Si el ROLLBACK falla la conexión ya está rota; `pg` la descarta.
        });
        throw err;
    }
    finally {
        client.release();
    }
}
/** Traduce el código de error de PostgreSQL a un mensaje entendible. */
export function dbErrorMessage(err) {
    const e = err;
    switch (e?.code) {
        case '23505':
            return {
                status: 409,
                message: `Ya existe un registro con ese valor${e.constraint ? ` (${e.constraint})` : ''}`,
            };
        case '23503':
            return { status: 409, message: 'No se puede: hay registros relacionados que apuntan a este' };
        case '23502':
            return { status: 400, message: 'Faltan campos obligatorios' };
        case '23514':
            return { status: 400, message: 'Un valor no cumple una restricción de la base de datos' };
        case '22P02':
            return { status: 400, message: 'Formato de dato inválido (esperaba un número)' };
        case '22001':
            return { status: 400, message: 'Un valor excede el tamaño máximo permitido' };
        case 'ECONNREFUSED':
            return { status: 503, message: 'No hay conexión con la base de datos' };
        default:
            return { status: 500, message: 'Error interno de la base de datos' };
    }
}
export async function checkDb() {
    try {
        await pool.query('SELECT 1');
        return true;
    }
    catch {
        return false;
    }
}
export async function closePool() {
    if (!isProd)
        await pool.end();
}
//# sourceMappingURL=pool.js.map