import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { ApiError } from './ApiError.js';
import { parseBody, parseParams, parseQuery } from './validate.js';
import { requiereEscritura } from '../middleware/auth.js';
/**
 * Fábrica de CRUD genérico.
 *
 * Los ocho módulos de la aplicación comparten exactamente el mismo
 * comportamiento (listar con búsqueda/filtros/paginación/orden, ver, crear,
 * editar, borrar), así que se define UNA vez y cada módulo declara su tabla,
 * sus columnas buscables y sus esquemas de validación.
 *
 * ── Seguridad ────────────────────────────────────────────────────────────
 * Los identificadores que vienen del cliente (columna de orden, nombre de
 * filtro) NUNCA se interpolan sin validar: se buscan en una lista blanca
 * (`sortable`, `filters`, `searchable`) y, si no están, se ignora o se
 * rechaza. Todos los VALORES viajan como placeholders `$n`.
 */
// --- Esquemas de query compartidos ----------------------------------------
/** Texto opcional: `""` y `undefined` se normalizan a `undefined`. */
const textoOpcional = z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? undefined : v))
    .optional();
/** Query string → entero, con valor por defecto si viene vacío o inválido. */
const enteroParam = (def) => z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
    if (v === undefined || v === '')
        return def;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
});
export const listQuerySchema = (filtros) => z
    .object({
    q: textoOpcional,
    page: enteroParam(1).refine((v) => v >= 1, 'La página debe ser >= 1'),
    pageSize: enteroParam(20).refine((v) => v >= 1 && v <= 200, 'pageSize entre 1 y 200'),
    orderBy: z.string().optional(),
    sort: z.enum(['asc', 'desc']).catch('asc'),
    ...Object.fromEntries(filtros.map((c) => [c, textoOpcional])),
})
    .transform((v) => v);
export const idParamSchema = z.object({
    id: z.coerce.number().int('El id debe ser un entero').positive('El id debe ser mayor que 0'),
});
// --- Implementación --------------------------------------------------------
/**
 * Devuelve la fila recién escrita usando el MISMO `select`/`from` que usa GET.
 *
 * INSERT y UPDATE terminan con `RETURNING *`, que devuelve las columnas con el
 * nombre físico de la tabla. Para `docentes` eso significa `categorioa_docente`
 * (con el typo heredado) y sin los campos calculados del JOIN, así que el
 * cliente vería una forma distinta según usar POST o GET. Releer la fila deja
 * la respuesta idéntica en todos los endpoints.
 */
async function releer(id, r) {
    const pkJoin = r.pkEnJoin ?? r.pk;
    const fila = await queryOne(`SELECT ${r.select} FROM ${r.from} WHERE ${pkJoin} = $1`, [id]);
    return fila ?? {};
}
export function crearCrud(r) {
    const router = Router();
    // PATCH es una edicion parcial por semantica HTTP: solo se validan y escriben
    // las claves que el cliente envie. Sin esto, omitir un campo (por ejemplo al
    // cambiar solo la especialidad) fallaria con 422 pidiendo el resto del
    // formulario entero.
    const updateParcial = r.update instanceof z.ZodObject ? r.update.partial() : r.update;
    // ---- LISTAR ------------------------------------------------------------
    router.get('/', async (req, res) => {
        const q = parseQuery(listQuerySchema(Object.keys(r.filtros ?? {})), req.query);
        const params = [];
        const where = [];
        const add = (sql, valor) => {
            params.push(valor);
            where.push(sql.replace('?', `$${params.length}`));
        };
        if (r.baseWhere)
            where.push(r.baseWhere);
        if (q.q) {
            const cols = r.buscables;
            if (cols.length === 0) {
                throw ApiError.badRequest('Este recurso no admite búsqueda de texto');
            }
            const grupo = cols.map((c) => {
                params.push(`%${q.q}%`);
                return `${c}::text ILIKE $${params.length}`;
            });
            where.push(`(${grupo.join(' OR ')})`);
        }
        for (const [clave, condicion] of Object.entries(r.filtros ?? {})) {
            const valor = q[clave];
            if (valor === undefined)
                continue;
            add(condicion, valor);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        // Orden: solo columnas de la lista blanca. Si no es válida, se ignora.
        const dir = q.sort === 'desc' ? 'DESC' : 'ASC';
        const ordenCol = q.orderBy ? r.ordenables[q.orderBy] : undefined;
        // Si el orden por defecto ya declara su propia dirección (p.ej. "fecha DESC")
        // se respeta tal cual y no se le anexa otra, o PostgreSQL rechaza
        // "ORDER BY fecha DESC ASC".
        const porDefecto = r.ordenPorDefecto;
        const ordenSql = ordenCol
            ? `ORDER BY ${ordenCol} ${dir}`
            : /\b(asc|desc)\b/i.test(porDefecto)
                ? `ORDER BY ${porDefecto}`
                : `ORDER BY ${porDefecto} ${dir}`;
        const offset = (q.page - 1) * q.pageSize;
        // `count(*)` sobre el FROM contaria de mas cuando un JOIN trae filas
        // repetidas por entidad (p.ej. un estudiante con dos tutores), y el total
        // no cuadraria con las filas que devuelve LIMIT. Se cuenta la PK distinta.
        const pkCount = r.pkEnJoin ?? r.pk;
        const totalParams = [...params];
        const total = await queryOne(`SELECT count(DISTINCT ${pkCount})::int AS total FROM ${r.from} ${whereSql}`, totalParams);
        const filas = await query(`SELECT ${r.select} FROM ${r.from} ${whereSql} ${ordenSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.pageSize, offset]);
        const totalFilas = total?.total ?? 0;
        res.json({
            data: filas,
            meta: {
                page: q.page,
                pageSize: q.pageSize,
                total: totalFilas,
                totalPages: Math.max(1, Math.ceil(totalFilas / q.pageSize)),
            },
        });
    });
    // ---- VER UNO ------------------------------------------------------------
    router.get('/:id', async (req, res) => {
        const { id } = parseParams(idParamSchema, req.params);
        const pkJoin = r.pkEnJoin ?? r.pk;
        const fila = await queryOne(`SELECT ${r.select} FROM ${r.from} WHERE ${pkJoin} = $1`, [
            id,
        ]);
        if (!fila)
            throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
        res.json({ data: fila });
    });
    // ---- CREAR -------------------------------------------------------------
    router.post('/', requiereEscritura, async (req, res) => {
        const body = parseBody(r.create, req.body);
        if (r.escribir) {
            const nuevoId = await r.escribir.insertar(body);
            res.status(201).json({ data: await releer(nuevoId, r), meta: { id: nuevoId } });
            return;
        }
        const { columnas, valores, nombres } = separate(body, r.columnas);
        const creado = await queryOne(`INSERT INTO ${r.tabla} (${columnas.join(', ')})
       VALUES (${valores.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING ${r.pk}`, valores);
        const nuevoId = Number(creado?.[r.pk]);
        res.status(201).json({
            data: await releer(nuevoId, r),
            meta: { id: nuevoId, columnas: nombres },
        });
    });
    // ---- EDITAR ------------------------------------------------------------
    router.patch('/:id', requiereEscritura, async (req, res) => {
        const { id } = parseParams(idParamSchema, req.params);
        const body = parseBody(updateParcial, req.body);
        if (Object.keys(body).length === 0) {
            throw ApiError.badRequest('No enviaste ningún campo para actualizar');
        }
        if (r.escribir) {
            const ok = await r.escribir.aplicar(id, body);
            if (!ok)
                throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
            res.json({ data: await releer(id, r) });
            return;
        }
        const { columnas, valores } = separate(body, r.columnas);
        const sets = columnas.map((c, i) => `${c} = $${i + 1}`);
        const actualizado = await queryOne(`UPDATE ${r.tabla} SET ${sets.join(', ')} WHERE ${r.pk} = $${valores.length + 1} RETURNING ${r.pk}`, [...valores, id]);
        if (!actualizado)
            throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
        res.json({ data: await releer(id, r) });
    });
    // ---- BORRAR ------------------------------------------------------------
    // Las 31 FKs del esquema son ON DELETE CASCADE: borrar un padre sin
    // verificación se llevaría por delante hijos (matrículas, notas, pagos) sin
    // avisar. Por defecto el borrado se bloquea si hay dependientes.
    router.delete('/:id', requiereEscritura, async (req, res) => {
        const { id } = parseParams(idParamSchema, req.params);
        const cascade = req.query.cascade === '1' || req.query.cascade === 'true';
        const existente = await queryOne(`SELECT ${r.pkEnJoin ?? r.pk} FROM ${r.from} WHERE ${r.pkEnJoin ?? r.pk} = $1`, [id]);
        if (!existente)
            throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
        if (!cascade && r.dependencias?.length) {
            // Algunas tablas hijas cuelgan de una columna distinta a la PK (los
            // docentes, por ejemplo, se identifican por `docente_codigo`). Se
            // resuelve esa columna una vez y se usa para todos los conteos.
            let claveDependencia = id;
            if (r.pkDependencia) {
                const fila = await queryOne(`SELECT ${r.pkDependencia} AS clave FROM ${r.tabla} WHERE ${r.pk} = $1`, [id]);
                claveDependencia = fila?.clave;
                if (claveDependencia === undefined || claveDependencia === null) {
                    throw ApiError.conflict('No se puede eliminar: el registro no tiene definida la clave que lo referencian sus registros relacionados.');
                }
            }
            const conteos = {};
            let total = 0;
            for (const dep of r.dependencias) {
                const res2 = await queryOne(dep.conteo, [claveDependencia]);
                const n = res2?.n ?? 0;
                conteos[dep.nombre] = n;
                total += n;
            }
            if (total > 0) {
                throw ApiError.conflict(`No se puede eliminar: hay ${total} registro(s) relacionado. ` +
                    'Revisá si querés eliminarlos también.', {
                    dependientes: conteos,
                    sugerencia: 'Repetí la petición con ?cascade=1 para forzar el borrado en cascada.',
                });
            }
        }
        if (r.escribir?.eliminar) {
            const borrado = await r.escribir.eliminar(id);
            if (!borrado)
                throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
            res.status(204).end();
            return;
        }
        await query(`DELETE FROM ${r.tabla} WHERE ${r.pk} = $1`, [id]);
        res.status(204).end();
    });
    return router;
}
/**
 * Parte un objeto en columnas y valores, ignorando `undefined`.
 * `mapeo` traduce el nombre público de la clave a la columna real de la tabla.
 */
function separate(body, mapeo) {
    const columnas = [];
    const valores = [];
    for (const [k, v] of Object.entries(body)) {
        if (v === undefined)
            continue;
        columnas.push(mapeo?.[k] ?? k);
        valores.push(v);
    }
    if (columnas.length === 0) {
        throw ApiError.badRequest('No enviaste ningún campo');
    }
    return { columnas, valores, nombres: columnas };
}
//# sourceMappingURL=crud.js.map