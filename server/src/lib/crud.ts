import { Router, type Request, type Response } from 'express';
import { z, type ZodType } from 'zod';
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
const enteroParam = (def: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : def;
    });

export const listQuerySchema = (filtros: string[]) =>
  z
    .object({
      q: textoOpcional,
      page: enteroParam(1).refine((v) => v >= 1, 'La página debe ser >= 1'),
      pageSize: enteroParam(20).refine((v) => v >= 1 && v <= 200, 'pageSize entre 1 y 200'),
      orderBy: z.string().optional(),
      sort: z.enum(['asc', 'desc']).catch('asc'),
      ...Object.fromEntries(filtros.map((c) => [c, textoOpcional])),
    })
    .transform((v) => v as typeof v & Record<string, string | undefined>);

export const idParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser un entero').positive('El id debe ser mayor que 0'),
});

// --- Tipos de configuración ----------------------------------------------

export interface Dependencia {
  /** Nombre legible, ej. 'matrículas'. */
  nombre: string;
  /** SQL que devuelve { n: number } contando los hijos. */
  conteo: string;
}

export interface CrudResource {
  /** Tabla física, ej. 'estudiantes'. */
  tabla: string;
  /** Columna PK, ej. 'estudiante_id'. */
  pk: string;
  /** Lista de columnas del SELECT, con alias si hace falta. */
  select: string;
  /** Cláusula FROM con los JOIN necesarios. */
  from: string;
  /** Condición fija adicional (ej. "e.estado = true"). */
  baseWhere?: string;
  /** Columnas donde buscar con ?q= (con alias de tabla). */
  buscables: string[];
  /** Columnas permitidas para ?orderBy=, mapeadas a su expresión SQL. */
  ordenables: Record<string, string>;
  /**
   * Referencia calificada de la PK para las consultas que usan `from`
   * (ver uno y comprobar existencia). Sin esto, `WHERE empleado_id = $1` es
   * ambiguo cuando el JOIN trae otra tabla con la misma columna.
   */
  pkEnJoin?: string;
  /**
   * Nombre público -> columna real. Permite exponer una clave limpia aunque la
   * tabla tenga un nombre heredado con typo (p.ej. `categorioa_docente`).
   */
  columnas?: Record<string, string>;
  /**
   * Columna de la que obtener el valor que se pasa a los `conteo` de
   * dependencias, cuando no es la propia PK.
   */
  pkDependencia?: string;
  /** Filtros exactos permitidos: queryKey -> condición SQL con $1. */
  filtros?: Record<string, string>;
  /** Condición por defecto de ordenamiento. */
  ordenPorDefecto: string;
  create: ZodType;
  update: ZodType;
  /** Tablas hijas, para impedir borrados accidentales en cascada. */
  dependencias?: Dependencia[];
  /**
   * Escritura personalizada para módulos que no caben en un solo INSERT.
   *
   * `docentes` es el caso real: la fila de `docentes` apunta a `empleados`,
   * que es donde viven nombre, cédula, email y salario. Un INSERT genérico en
   * `docentes` solo fallaría con un error de llave foránea, así que el módulo
   * provee su propia transacción.
   *
   * `insertar` recibe el cuerpo ya validado por `create` y devuelve la PK
   * nueva; `aplicar` recibe la PK existente y debe devolver `false` si no
   * existía.
   */
  escribir?: {
    insertar: (cuerpo: Record<string, unknown>) => Promise<number>;
    aplicar: (id: number, cuerpo: Record<string, unknown>) => Promise<boolean>;
    /**
     * Borra la fila y lo que la API creó junto a ella. Si no se borra también
     * la fila auxiliar, cada alta deja un registro huérfano en la tabla padre.
     */
    eliminar?: (id: number) => Promise<boolean>;
  };
}

type Ctx = Record<string, unknown>;

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
async function releer(id: number, r: CrudResource): Promise<Ctx> {
  const pkJoin = r.pkEnJoin ?? r.pk;
  const fila = await queryOne<Ctx>(`SELECT ${r.select} FROM ${r.from} WHERE ${pkJoin} = $1`, [id]);
  return fila ?? {};
}

export function crearCrud(r: CrudResource): Router {
  const router = Router() as Router;

  // PATCH es una edicion parcial por semantica HTTP: solo se validan y escriben
  // las claves que el cliente envie. Sin esto, omitir un campo (por ejemplo al
  // cambiar solo la especialidad) fallaria con 422 pidiendo el resto del
  // formulario entero.
  const updateParcial =
    r.update instanceof z.ZodObject ? (r.update.partial() as unknown as ZodType) : r.update;

  // ---- LISTAR ------------------------------------------------------------
  router.get('/', async (req: Request, res: Response) => {
    const q = parseQuery(listQuerySchema(Object.keys(r.filtros ?? {})), req.query) as {
      q?: string;
      page: number;
      pageSize: number;
      orderBy?: string;
      sort: 'asc' | 'desc';
    } & Record<string, string | undefined>;

    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, valor: unknown) => {
      params.push(valor);
      where.push(sql.replace('?', `$${params.length}`));
    };

    if (r.baseWhere) where.push(r.baseWhere);

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
      if (valor === undefined) continue;
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
    const total = await queryOne<{ total: number }>(
      `SELECT count(DISTINCT ${pkCount})::int AS total FROM ${r.from} ${whereSql}`,
      totalParams,
    );

    const filas = await query(
      `SELECT ${r.select} FROM ${r.from} ${whereSql} ${ordenSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, offset],
    );

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
  router.get('/:id', async (req: Request, res: Response) => {
    const { id } = parseParams(idParamSchema, req.params) as { id: number };
    const pkJoin = r.pkEnJoin ?? r.pk;
    const fila = await queryOne<Ctx>(`SELECT ${r.select} FROM ${r.from} WHERE ${pkJoin} = $1`, [
      id,
    ]);
    if (!fila) throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
    res.json({ data: fila });
  });

  // ---- CREAR -------------------------------------------------------------
  router.post('/', requiereEscritura, async (req: Request, res: Response) => {
    const body = parseBody(r.create, req.body) as Record<string, unknown>;

    if (r.escribir) {
      const nuevoId = await r.escribir.insertar(body);
      res.status(201).json({ data: await releer(nuevoId, r), meta: { id: nuevoId } });
      return;
    }

    const { columnas, valores, nombres } = separate(body, r.columnas);

    const creado = await queryOne<{ [k: string]: unknown }>(
      `INSERT INTO ${r.tabla} (${columnas.join(', ')})
       VALUES (${valores.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING ${r.pk}`,
      valores,
    );
    const nuevoId = Number(creado?.[r.pk]);
    res.status(201).json({
      data: await releer(nuevoId, r),
      meta: { id: nuevoId, columnas: nombres },
    });
  });

  // ---- EDITAR ------------------------------------------------------------
  router.patch('/:id', requiereEscritura, async (req: Request, res: Response) => {
    const { id } = parseParams(idParamSchema, req.params) as { id: number };
    const body = parseBody(updateParcial, req.body) as Record<string, unknown>;

    if (Object.keys(body).length === 0) {
      throw ApiError.badRequest('No enviaste ningún campo para actualizar');
    }

    if (r.escribir) {
      const ok = await r.escribir.aplicar(id, body);
      if (!ok) throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
      res.json({ data: await releer(id, r) });
      return;
    }

    const { columnas, valores } = separate(body, r.columnas);
    const sets = columnas.map((c, i) => `${c} = $${i + 1}`);

    const actualizado = await queryOne<{ [k: string]: unknown }>(
      `UPDATE ${r.tabla} SET ${sets.join(', ')} WHERE ${r.pk} = $${valores.length + 1} RETURNING ${r.pk}`,
      [...valores, id],
    );
    if (!actualizado) throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
    res.json({ data: await releer(id, r) });
  });

  // ---- BORRAR ------------------------------------------------------------
  // Las 31 FKs del esquema son ON DELETE CASCADE: borrar un padre sin
  // verificación se llevaría por delante hijos (matrículas, notas, pagos) sin
  // avisar. Por defecto el borrado se bloquea si hay dependientes.
  router.delete('/:id', requiereEscritura, async (req: Request, res: Response) => {
    const { id } = parseParams(idParamSchema, req.params) as { id: number };
    const cascade = req.query.cascade === '1' || req.query.cascade === 'true';

    const existente = await queryOne<Ctx>(
      `SELECT ${r.pkEnJoin ?? r.pk} FROM ${r.from} WHERE ${r.pkEnJoin ?? r.pk} = $1`,
      [id],
    );
    if (!existente) throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);

    if (!cascade && r.dependencias?.length) {
      // Algunas tablas hijas cuelgan de una columna distinta a la PK (los
      // docentes, por ejemplo, se identifican por `docente_codigo`). Se
      // resuelve esa columna una vez y se usa para todos los conteos.
      let claveDependencia: unknown = id;
      if (r.pkDependencia) {
        const fila = await queryOne<Record<string, unknown>>(
          `SELECT ${r.pkDependencia} AS clave FROM ${r.tabla} WHERE ${r.pk} = $1`,
          [id],
        );
        claveDependencia = fila?.clave;
        if (claveDependencia === undefined || claveDependencia === null) {
          throw ApiError.conflict(
            'No se puede eliminar: el registro no tiene definida la clave que lo referencian sus registros relacionados.',
          );
        }
      }

      const conteos: Record<string, number> = {};
      let total = 0;
      for (const dep of r.dependencias) {
        const res2 = await queryOne<{ n: number }>(dep.conteo, [claveDependencia]);
        const n = res2?.n ?? 0;
        conteos[dep.nombre] = n;
        total += n;
      }
      if (total > 0) {
        throw ApiError.conflict(
          `No se puede eliminar: hay ${total} registro(s) relacionado. ` +
            'Revisá si querés eliminarlos también.',
          {
            dependientes: conteos,
            sugerencia: 'Repetí la petición con ?cascade=1 para forzar el borrado en cascada.',
          },
        );
      }
    }

    if (r.escribir?.eliminar) {
      const borrado = await r.escribir.eliminar(id);
      if (!borrado) throw ApiError.notFound(`No existe un registro con ${r.pk} = ${id}`);
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
function separate(body: Record<string, unknown>, mapeo?: Record<string, string>) {
  const columnas: string[] = [];
  const valores: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    columnas.push(mapeo?.[k] ?? k);
    valores.push(v);
  }
  if (columnas.length === 0) {
    throw ApiError.badRequest('No enviaste ningún campo');
  }
  return { columnas, valores, nombres: columnas };
}
