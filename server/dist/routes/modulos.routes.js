import { Router } from 'express';
import { z } from 'zod';
import { crearCrud } from '../lib/crud.js';
import { ApiError } from '../lib/ApiError.js';
import { requiereAuth } from '../middleware/auth.js';
import { transaccion } from '../db/pool.js';
/**
 * Catálogo de los ocho módulos de la aplicación.
 *
 * Cada entrada declara su tabla, el SELECT con los JOIN necesarios, las
 * columnas buscables y ordenables, y los esquemas Zod de alta y edición.
 * El comportamiento (paginación, filtros, borrado protegido) viene de
 * `crearCrud`, que ya resuelve el SQL de forma parametrizada.
 */
// --- Validadores reutilizables --------------------------------------------
// El esquema original usa character varying(30/40/...) sin tildes ni ñ.
// Se replican esos límites para que la API rechace lo mismo que rechaza la BD
// (y devuelva un 422 con el nombre del campo en vez de un error de PostgreSQL).
const v30 = z.string().trim().max(30);
const v40 = z.string().trim().max(40);
const v50 = z.string().trim().max(50);
const v90 = z.string().trim().max(90);
const fecha = z.iso.date('Formato de fecha esperado: AAAA-MM-DD');
const booleano = z.coerce.boolean();
const email = z.email('Email inválido').trim().toLowerCase().max(60);
// --- Escritura de docentes (dos tablas) ------------------------------------
/**
 * Columnas de `empleados` y de `docentes` que guarda cada campo del formulario.
 * La API expone un solo recurso «docente», pero la persona y el cargo viven en
 * tablas distintas: el nombre no se guarda en `docentes`.
 */
const EMPLEADO_DESDE = [
    'primer_nombre',
    'primer_apellido',
    'cedula',
    'email',
    'telefono',
    'salario',
];
const DOCENTE_DESDE = [
    'docente_codigo',
    'titulo_profesional',
    'especialidad',
    'nivel_formacion',
    'experiencia_docente',
    'fecha_ingreso',
    'categoria_docente',
    'dedicacion',
    'estado',
];
/**
 * Separa el cuerpo en las claves que pertenecen a cada tabla.
 *
 * Se usan listas de，允许 explícitas en vez de «todo lo que no sea de la otra
 * tabla»: una clave desconocida se descarta en vez de terminar en una sentencia
 * SQL con un identificador que viene del cliente.
 */
function repartir(cuerpo) {
    const empleado = {};
    const docente = {};
    for (const [clave, valor] of Object.entries(cuerpo)) {
        if (valor === undefined)
            continue;
        if (EMPLEADO_DESDE.includes(clave)) {
            empleado[clave] = valor;
        }
        else if (DOCENTE_DESDE.includes(clave)) {
            // La API expone `categoria_docente`; la columna se llama
            // `categorioa_docente` (typo heredado del esquema original).
            docente[clave === 'categoria_docente' ? 'categorioa_docente' : clave] = valor;
        }
    }
    return { empleado, docente };
}
/** `UPDATE ... SET` con placeholders, o `undefined` si no hay columnas. */
function setsDe(columnas, arranque) {
    return Object.keys(columnas)
        .map((columna, i) => `${columna} = $${i + arranque}`)
        .join(', ');
}
const escribirDocente = {
    /** Alta: crea primero el empleado y luego el docente, en una sola transacción. */
    async insertar(cuerpo) {
        const { empleado, docente } = repartir(cuerpo);
        const empleadoId = Number(empleado.empleado_id ?? cuerpo.empleado_id);
        const colsEmpleado = { ...empleado, empleado_id: empleadoId };
        const colsDocente = docente;
        return transaccion(async (client) => {
            const cols = Object.keys(colsEmpleado);
            await client.query(`INSERT INTO empleados (${cols.join(', ')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(colsEmpleado));
            const colsD = Object.keys(colsDocente);
            await client.query(`INSERT INTO docentes (${colsD.join(', ')}, empleado_id)
         VALUES (${colsD.map((_, i) => `$${i + 1}`).join(', ')}, $${colsD.length + 1})`, [...Object.values(colsDocente), empleadoId]);
            return empleadoId;
        });
    },
    /** Edición: reparte los cambios entre las dos tablas. */
    async aplicar(id, cuerpo) {
        const { empleado, docente } = repartir(cuerpo);
        return transaccion(async (client) => {
            const existe = await client.query('SELECT 1 FROM docentes WHERE empleado_id = $1', [id]);
            if (existe.rowCount === 0)
                return false;
            const setEmpleado = setsDe(empleado, 1);
            if (setEmpleado) {
                await client.query(`UPDATE empleados SET ${setEmpleado} WHERE empleado_id = $${Object.keys(empleado).length + 1}`, [...Object.values(empleado), id]);
            }
            const setDocente = setsDe(docente, 1);
            if (setDocente) {
                await client.query(`UPDATE docentes SET ${setDocente} WHERE empleado_id = $${Object.keys(docente).length + 1}`, [...Object.values(docente), id]);
            }
            return true;
        });
    },
    /**
     * Borrado: se va la fila de `docentes` y también la de `empleados` que creó
     * el alta, para no dejar un empleado sin persona asociada. Se comprueba antes
     * que ninguna otra tabla (secretarias) lo use.
     */
    async eliminar(id) {
        return transaccion(async (client) => {
            const enSecretaria = await client.query('SELECT 1 FROM secretarias WHERE empleado_id = $1', [
                id,
            ]);
            if (enSecretaria.rowCount && (enSecretaria.rowCount ?? 0) > 0) {
                throw ApiError.conflict('No se puede eliminar: el empleado está asociado a una secretaría.');
            }
            const borrado = await client.query('DELETE FROM docentes WHERE empleado_id = $1', [id]);
            if ((borrado.rowCount ?? 0) === 0)
                return false;
            await client.query('DELETE FROM empleados WHERE empleado_id = $1', [id]);
            return true;
        });
    },
};
// --- 1. Estudiantes -------------------------------------------------------
const estudiantes = crearCrud({
    tabla: 'estudiantes',
    pk: 'estudiante_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna estudiante_id es ambigua».
    pkEnJoin: 'e.estudiante_id',
    select: `
    e.estudiante_id, e.cliente_id, e.primer_nombre, e.primer_apellido,
    e.direccion, e.nacimiento, e.telefono, e.fecha_registro, e.estado,
    cl.nombre AS cliente_nombre, cl.email AS cliente_email,
    (t.primer_nombre || ' ' || t.primer_apellido) AS tutor_nombre,
    COALESCE(mx.total_matriculas, 0) AS total_matriculas,
    COALESCE(pr.promedio, 0) AS promedio
  `,
    from: `
    estudiantes e
    LEFT JOIN clientes cl ON cl.cliente_id = e.cliente_id
    LEFT JOIN tutor_estudiante te ON te.estudiante_id = e.estudiante_id
    LEFT JOIN tutores t ON t.tutor_id = te.tutor_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_matriculas
        FROM matriculas mm WHERE mm.estudiante_id = e.estudiante_id
    ) mx ON TRUE
    LEFT JOIN LATERAL (
      SELECT round(avg(nn.puntaje::numeric /
             (SELECT ev.nota_total FROM evaluaciones ev
               WHERE ev.evaluacion_id = nn.evaluacion_id) * 100), 1) AS promedio
        FROM nota nn WHERE nn.estudiante_id = e.estudiante_id
    ) pr ON TRUE
  `,
    buscables: ['e.primer_nombre', 'e.primer_apellido', 'e.direccion', 'e.telefono', 'cl.nombre'],
    ordenables: {
        nombre: "e.primer_nombre || ' ' || e.primer_apellido",
        apellido: 'e.primer_apellido',
        nacimiento: 'e.nacimiento',
        registro: 'e.fecha_registro',
        promedio: 'pr.promedio',
        id: 'e.estudiante_id',
    },
    filtros: { estado: 'e.estado = $1::boolean' },
    ordenPorDefecto: 'e.primer_apellido',
    create: z.object({
        cliente_id: z.coerce.number().int().positive().nullish(),
        primer_nombre: z.string().trim().min(2).max(20),
        primer_apellido: z.string().trim().min(2).max(20),
        direccion: v90.nullish(),
        nacimiento: fecha,
        telefono: z.string().trim().max(12).nullish(),
        estado: booleano.default(true),
    }),
    update: z.object({
        cliente_id: z.coerce.number().int().positive().nullish(),
        primer_nombre: z.string().trim().min(2).max(20),
        primer_apellido: z.string().trim().min(2).max(20),
        direccion: v90.nullish(),
        nacimiento: fecha,
        telefono: z.string().trim().max(12).nullish(),
        estado: booleano,
    }),
    dependencias: [
        {
            nombre: 'matrículas',
            conteo: 'SELECT count(*)::int AS n FROM matriculas WHERE estudiante_id = $1',
        },
        { nombre: 'notas', conteo: 'SELECT count(*)::int AS n FROM nota WHERE estudiante_id = $1' },
        {
            nombre: 'asignación de tutor',
            conteo: 'SELECT count(*)::int AS n FROM tutor_estudiante WHERE estudiante_id = $1',
        },
    ],
});
// --- 2. Clientes ----------------------------------------------------------
const clientes = crearCrud({
    tabla: 'clientes',
    pk: 'cliente_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna cliente_id es ambigua».
    pkEnJoin: 'cl.cliente_id',
    select: `
    cl.cliente_id, cl.nombre, cl.telefono, cl.email, cl.cliente_tipo,
    (SELECT count(*)::int FROM estudiantes es WHERE es.cliente_id = cl.cliente_id) AS total_estudiantes,
    (SELECT count(*)::int FROM tutores t  WHERE t.cliente_id  = cl.cliente_id) AS total_tutores,
    (SELECT count(*)::int FROM orden_pago o WHERE o.cliente_id = cl.cliente_id) AS total_ordenes
  `,
    from: 'clientes cl',
    buscables: ['cl.nombre', 'cl.email', 'cl.telefono'],
    ordenables: { nombre: 'cl.nombre', tipo: 'cl.cliente_tipo', id: 'cl.cliente_id' },
    filtros: { cliente_tipo: 'cl.cliente_tipo = $1' },
    ordenPorDefecto: 'cl.nombre',
    create: z.object({
        nombre: v40.min(3, 'El nombre es obligatorio'),
        telefono: z.string().trim().max(12).nullish(),
        email: email.nullish(),
        cliente_tipo: z.enum(['Tutor', 'Padre', 'Madre', 'Estudiante']).default('Padre'),
    }),
    update: z.object({
        nombre: v40.min(3),
        telefono: z.string().trim().max(12).nullish(),
        email: email.nullish(),
        cliente_tipo: z.enum(['Tutor', 'Padre', 'Madre', 'Estudiante']),
    }),
    dependencias: [
        {
            nombre: 'estudiantes',
            conteo: 'SELECT count(*)::int AS n FROM estudiantes WHERE cliente_id = $1',
        },
        { nombre: 'tutores', conteo: 'SELECT count(*)::int AS n FROM tutores WHERE cliente_id = $1' },
        {
            nombre: 'órdenes de pago',
            conteo: 'SELECT count(*)::int AS n FROM orden_pago WHERE cliente_id = $1',
        },
    ],
});
// --- 3. Docentes ----------------------------------------------------------
const docentes = crearCrud({
    tabla: 'docentes',
    pk: 'empleado_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna empleado_id es ambigua».
    pkEnJoin: 'd.empleado_id',
    // La tabla tiene el typo heredado `categorioa_docente`; la API expone la
    // clave limpia `categoria_docente` y el mapeo la traduce al escribir.
    columnas: { categoria_docente: 'categorioa_docente' },
    // Los hijos cuelgan de `docente_codigo`, no de la PK `empleado_id`.
    pkDependencia: 'docente_codigo',
    select: `
    d.empleado_id, d.docente_codigo, d.titulo_profesional, d.especialidad,
    d.nivel_formacion, d.experiencia_docente, d.fecha_ingreso,
    d.categorioa_docente AS categoria_docente, d.dedicacion, d.estado,
    em.primer_nombre, em.primer_apellido, em.cedula, em.email, em.telefono, em.salario,
    (em.primer_nombre || ' ' || em.primer_apellido) AS nombre_completo,
    COALESCE(a.total_asignaturas, 0) AS total_asignaturas
  `,
    from: `
    docentes d
    JOIN empleados em ON em.empleado_id = d.empleado_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_asignaturas
        FROM docente_asignatura da WHERE da.docente_codigo = d.docente_codigo
    ) a ON TRUE
  `,
    buscables: ['em.primer_nombre', 'em.primer_apellido', 'em.cedula', 'em.email', 'd.especialidad'],
    ordenables: {
        nombre: 'em.primer_apellido',
        codigo: 'd.docente_codigo',
        salario: 'em.salario',
        ingreso: 'd.fecha_ingreso',
        id: 'd.empleado_id',
    },
    filtros: { estado: 'd.estado = $1::boolean', especialidad: 'd.especialidad = $1' },
    ordenPorDefecto: 'em.primer_apellido',
    create: z.object({
        empleado_id: z.coerce.number().int().positive(),
        docente_codigo: z.coerce.number().int().positive(),
        // Datos de la persona: viven en `empleados`, no en `docentes`.
        primer_nombre: v30,
        primer_apellido: v30,
        // `empleados.cedula` es NOT NULL: sin ella el INSERT falla con un 400
        // genérico de la base, así que se exige desde el esquema.
        cedula: z.string().trim().max(30),
        email: email.nullish(),
        telefono: z.string().trim().max(12).nullish(),
        salario: z.coerce.number().int().positive().nullish(),
        titulo_profesional: v50.nullish(),
        especialidad: v50.nullish(),
        nivel_formacion: v50.nullish(),
        experiencia_docente: z.string().trim().max(20).nullish(),
        fecha_ingreso: fecha.nullish(),
        categoria_docente: v50.nullish(),
        dedicacion: v50.nullish(),
        estado: booleano.default(true),
    }),
    update: z.object({
        // Datos de la persona (van a `empleados`).
        primer_nombre: v30,
        primer_apellido: v30,
        cedula: z.string().trim().max(30).nullish(),
        email: email.nullish(),
        telefono: z.string().trim().max(12).nullish(),
        salario: z.coerce.number().int().positive().nullish(),
        // Datos del cargo (van a `docentes`).
        titulo_profesional: v50.nullish(),
        especialidad: v50.nullish(),
        nivel_formacion: v50.nullish(),
        experiencia_docente: z.string().trim().max(20).nullish(),
        fecha_ingreso: fecha.nullish(),
        categoria_docente: v50.nullish(),
        dedicacion: v50.nullish(),
        estado: booleano,
    }),
    escribir: escribirDocente,
    dependencias: [
        {
            nombre: 'asignaturas asignadas',
            conteo: 'SELECT count(*)::int AS n FROM docente_asignatura WHERE docente_codigo = $1',
        },
    ],
});
// --- 4. Asignaturas -------------------------------------------------------
const asignaturas = crearCrud({
    tabla: 'asignaturas',
    pk: 'asignatura_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna asignatura_id es ambigua».
    pkEnJoin: 'a.asignatura_id',
    select: `
    a.asignatura_id, a.programa_academico_id, a.nombre_asignatura, a.codigo,
    a.horas_semana, a.descripcion,
    p.nombre_pograma AS programa, g.grupo_nombre,
    COALESCE(d.total_docentes, 0) AS total_docentes,
    COALESCE(ev.total_evaluaciones, 0) AS total_evaluaciones
  `,
    from: `
    asignaturas a
    JOIN programa_academico p ON p.programa_academico_id = a.programa_academico_id
    JOIN grupo_academico g ON g.grupo_academico_id = p.grupo_academico_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_docentes FROM docente_asignatura da WHERE da.asignatura_id = a.asignatura_id
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_evaluaciones FROM evaluaciones ev WHERE ev.asignatura_id = a.asignatura_id
    ) ev ON TRUE
  `,
    buscables: ['a.nombre_asignatura', 'a.descripcion', 'p.nombre_pograma'],
    ordenables: {
        nombre: 'a.nombre_asignatura',
        codigo: 'a.codigo',
        horas: 'a.horas_semana',
        id: 'a.asignatura_id',
    },
    filtros: { programa_academico_id: 'a.programa_academico_id = $1::integer' },
    ordenPorDefecto: 'a.nombre_asignatura',
    create: z.object({
        programa_academico_id: z.coerce.number().int().positive(),
        nombre_asignatura: v30.min(2, 'El nombre es obligatorio'),
        codigo: z.coerce.number().int().positive().max(32767),
        horas_semana: z.coerce.number().int().min(0).max(32767).nullish(),
        descripcion: v30.nullish(),
    }),
    update: z.object({
        programa_academico_id: z.coerce.number().int().positive(),
        nombre_asignatura: v30.min(2),
        codigo: z.coerce.number().int().positive().max(32767),
        horas_semana: z.coerce.number().int().min(0).max(32767).nullish(),
        descripcion: v30.nullish(),
    }),
    dependencias: [
        {
            nombre: 'evaluaciones',
            conteo: 'SELECT count(*)::int AS n FROM evaluaciones WHERE asignatura_id = $1',
        },
        {
            nombre: 'docentes asignados',
            conteo: 'SELECT count(*)::int AS n FROM docente_asignatura WHERE asignatura_id = $1',
        },
        {
            nombre: 'horarios',
            conteo: 'SELECT count(*)::int AS n FROM horario_asignatura WHERE asignatura_id = $1',
        },
    ],
});
// --- 5. Grupos académicos -------------------------------------------------
const grupos = crearCrud({
    tabla: 'grupo_academico',
    pk: 'grupo_academico_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna grupo_academico_id es ambigua».
    pkEnJoin: 'g.grupo_academico_id',
    select: `
    g.grupo_academico_id, g.nivel_academico_id, g.grupo_nombre, g.turno,
    n.nivel_nombre, n.edad_min, n.edad_max,
    COALESCE(m.total_matriculas, 0) AS total_matriculas,
    COALESCE(m.total_matriculas, 0) AS matriculados
  `,
    from: `
    grupo_academico g
    JOIN nivel_academico n ON n.nivel_academico_id = g.nivel_academico_id
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT mm.estudiante_id)::int AS total_matriculas
        FROM matriculas mm WHERE mm.grupo_academico_id = g.grupo_academico_id
    ) m ON TRUE
  `,
    buscables: ['g.grupo_nombre', 'g.turno', 'n.nivel_nombre'],
    ordenables: {
        grupo: 'g.grupo_nombre',
        nivel: 'n.nivel_nombre',
        turno: 'g.turno',
        id: 'g.grupo_academico_id',
    },
    filtros: { nivel_academico_id: 'g.nivel_academico_id = $1::integer', turno: 'g.turno = $1' },
    ordenPorDefecto: 'g.grupo_nombre',
    create: z.object({
        nivel_academico_id: z.coerce.number().int().positive(),
        grupo_nombre: z.string().trim().min(2).max(20),
        turno: z.string().trim().max(30).nullish(),
    }),
    update: z.object({
        nivel_academico_id: z.coerce.number().int().positive(),
        grupo_nombre: z.string().trim().min(2).max(20),
        turno: z.string().trim().max(30).nullish(),
    }),
    dependencias: [
        {
            nombre: 'matrículas',
            conteo: 'SELECT count(*)::int AS n FROM matriculas WHERE grupo_academico_id = $1',
        },
        {
            nombre: 'programas',
            conteo: 'SELECT count(*)::int AS n FROM programa_academico WHERE grupo_academico_id = $1',
        },
    ],
});
// --- 6. Matrículas --------------------------------------------------------
const matriculas = crearCrud({
    tabla: 'matriculas',
    pk: 'matricula_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna matricula_id es ambigua».
    pkEnJoin: 'm.matricula_id',
    select: `
    m.matricula_id, m.estudiante_id, m.grupo_academico_id, m.matricula_fecha, m.observaciones,
    (e.primer_nombre || ' ' || e.primer_apellido) AS estudiante_nombre,
    g.grupo_nombre, g.turno, n.nivel_nombre,
    COALESCE(pen.total_pensiones, 0) AS total_pensiones,
    COALESCE(pen.monto_pensiones, 0) AS monto_pensiones,
    COALESCE(pen.pendientes, 0) AS pendientes
  `,
    from: `
    matriculas m
    JOIN estudiantes e ON e.estudiante_id = m.estudiante_id
    JOIN grupo_academico g ON g.grupo_academico_id = m.grupo_academico_id
    JOIN nivel_academico n ON n.nivel_academico_id = g.nivel_academico_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_pensiones,
             coalesce(sum(pa.monto), 0)::int AS monto_pensiones,
             count(*) FILTER (WHERE pa.estado = false)::int AS pendientes
        FROM pension_academica pa WHERE pa.matricula_id = m.matricula_id
    ) pen ON TRUE
  `,
    buscables: ['e.primer_nombre', 'e.primer_apellido', 'g.grupo_nombre', 'm.observaciones'],
    ordenables: {
        estudiante: 'e.primer_apellido',
        grupo: 'g.grupo_nombre',
        fecha: 'm.matricula_fecha',
        id: 'm.matricula_id',
    },
    filtros: {
        grupo_academico_id: 'm.grupo_academico_id = $1::integer',
        estudiante_id: 'm.estudiante_id = $1::integer',
    },
    ordenPorDefecto: 'm.matricula_fecha DESC',
    create: z.object({
        estudiante_id: z.coerce.number().int().positive(),
        grupo_academico_id: z.coerce.number().int().positive(),
        matricula_fecha: fecha,
        observaciones: v30.nullish(),
    }),
    update: z.object({
        estudiante_id: z.coerce.number().int().positive(),
        grupo_academico_id: z.coerce.number().int().positive(),
        matricula_fecha: fecha,
        observaciones: v30.nullish(),
    }),
    dependencias: [
        {
            nombre: 'pensiones',
            conteo: 'SELECT count(*)::int AS n FROM pension_academica WHERE matricula_id = $1',
        },
    ],
});
// --- 7. Notas -------------------------------------------------------------
const notas = crearCrud({
    tabla: 'nota',
    pk: 'nota_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna nota_id es ambigua».
    pkEnJoin: 'n.nota_id',
    select: `
    n.nota_id, n.evaluacion_id, n.estudiante_id, n.puntaje, n.fecha_registro,
    ev.evaluacion_nombre, ev.nota_total, a.nombre_asignatura,
    (e.primer_nombre || ' ' || e.primer_apellido) AS estudiante_nombre,
    (n.puntaje::numeric / ev.nota_total * 100) AS porcentaje
  `,
    from: `
    nota n
    JOIN evaluaciones ev ON ev.evaluacion_id = n.evaluacion_id
    JOIN asignaturas a ON a.asignatura_id = ev.asignatura_id
    JOIN estudiantes e ON e.estudiante_id = n.estudiante_id
  `,
    buscables: [
        'a.nombre_asignatura',
        'ev.evaluacion_nombre',
        'e.primer_nombre',
        'e.primer_apellido',
    ],
    ordenables: {
        puntaje: 'n.puntaje',
        porcentaje: '(n.puntaje::numeric / ev.nota_total * 100)',
        estudiante: 'e.primer_apellido',
        fecha: 'n.fecha_registro',
        id: 'n.nota_id',
    },
    filtros: {
        estudiante_id: 'n.estudiante_id = $1::integer',
        evaluacion_id: 'n.evaluacion_id = $1::integer',
        asignatura_id: 'ev.asignatura_id = $1::integer',
    },
    ordenPorDefecto: 'n.fecha_registro DESC',
    create: z.object({
        evaluacion_id: z.coerce.number().int().positive(),
        estudiante_id: z.coerce.number().int().positive(),
        puntaje: z.coerce.number().int().min(0).max(32767),
        fecha_registro: fecha.nullish(),
    }),
    update: z.object({
        evaluacion_id: z.coerce.number().int().positive(),
        estudiante_id: z.coerce.number().int().positive(),
        puntaje: z.coerce.number().int().min(0).max(32767),
        fecha_registro: fecha.nullish(),
    }),
});
// --- 8. Pagos -------------------------------------------------------------
const pagos = crearCrud({
    tabla: 'orden_pago',
    pk: 'orden_pago_id',
    // La PK se referencia calificada: los JOIN y subconsultas LATERAL
    // repiten el mismo nombre de columna, y sin el alias PostgreSQL
    // responderia «la referencia a la columna orden_pago_id es ambigua».
    pkEnJoin: 'o.orden_pago_id',
    select: `
    o.orden_pago_id, o.cliente_id, o.usuario_id, o.fecha_emision, o.fecha_finalizacion,
    cl.nombre AS cliente_nombre, u.nombre AS usuario_nombre,
    CASE WHEN o.fecha_finalizacion IS NULL THEN 'Pendiente' ELSE 'Pagada' END AS estado,
    COALESCE(prod.total_productos, 0) AS total_productos,
    COALESCE(serv.total_servicios, 0) AS total_servicios,
    COALESCE(pag.total_pagado, 0) AS total_pagado,
    COALESCE(prod.monto_productos, 0) + COALESCE(serv.monto_servicios, 0) AS total_orden
  `,
    from: `
    orden_pago o
    JOIN clientes cl ON cl.cliente_id = o.cliente_id
    JOIN usuarios u  ON u.usuario_id  = o.usuario_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_productos, sum(op.subtotal)::int AS monto_productos
        FROM orden_producto op WHERE op.orden_pago_id = o.orden_pago_id
    ) prod ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_servicios, sum(os.total)::int AS monto_servicios
        FROM orden_servicio os WHERE os.orden_pago_id = o.orden_pago_id
    ) serv ON TRUE
    LEFT JOIN LATERAL (
      SELECT sum(p.monto_pagado)::int AS total_pagado
        FROM pagos p WHERE p.orden_pago_id = o.orden_pago_id
    ) pag ON TRUE
  `,
    buscables: ['cl.nombre', 'u.nombre'],
    ordenables: { fecha: 'o.fecha_emision', cliente: 'cl.nombre', id: 'o.orden_pago_id' },
    filtros: { cliente_id: 'o.cliente_id = $1::integer', usuario_id: 'o.usuario_id = $1::integer' },
    ordenPorDefecto: 'o.fecha_emision DESC',
    create: z.object({
        cliente_id: z.coerce.number().int().positive(),
        usuario_id: z.coerce.number().int().positive(),
        fecha_finalizacion: fecha.nullish(),
    }),
    update: z.object({
        cliente_id: z.coerce.number().int().positive(),
        fecha_finalizacion: fecha.nullish(),
    }),
    dependencias: [
        {
            nombre: 'líneas de producto',
            conteo: 'SELECT count(*)::int AS n FROM orden_producto WHERE orden_pago_id = $1',
        },
        {
            nombre: 'líneas de servicio',
            conteo: 'SELECT count(*)::int AS n FROM orden_servicio WHERE orden_pago_id = $1',
        },
        { nombre: 'pagos', conteo: 'SELECT count(*)::int AS n FROM pagos WHERE orden_pago_id = $1' },
    ],
});
// --- Montaje --------------------------------------------------------------
export const modulosRouter = Router();
modulosRouter.use('/estudiantes', requiereAuth, estudiantes);
modulosRouter.use('/clientes', requiereAuth, clientes);
modulosRouter.use('/docentes', requiereAuth, docentes);
modulosRouter.use('/asignaturas', requiereAuth, asignaturas);
modulosRouter.use('/grupos', requiereAuth, grupos);
modulosRouter.use('/matriculas', requiereAuth, matriculas);
modulosRouter.use('/notas', requiereAuth, notas);
modulosRouter.use('/pagos', requiereAuth, pagos);
//# sourceMappingURL=modulos.routes.js.map