import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
/**
 * Métricas del panel principal.
 *
 * Cada consulta devuelve una fila; el endpoint las agrupa en un solo objeto
 * para que el dashboard haga una única llamada en lugar de ocho.
 */
export const dashboardRouter = Router();
dashboardRouter.use(requiereAuth);
dashboardRouter.get('/', async (_req, res) => {
    const [tarjetas, porNivel, porAsignatura, topEstudiantes, ultimasMatriculas, ingresos, estadoPagos,] = await Promise.all([
        queryOne(`SELECT
           (SELECT count(*)::int FROM estudiantes WHERE estado)          AS estudiantes,
           (SELECT count(*)::int FROM empleados WHERE estado)            AS empleados,
           (SELECT count(*)::int FROM docentes  WHERE estado)            AS docentes,
           (SELECT count(*)::int FROM asignaturas)                       AS asignaturas,
           (SELECT count(*)::int FROM matriculas)                        AS matriculas,
           (SELECT count(*)::int FROM nota)                              AS notas,
           (SELECT count(DISTINCT estudiante_id)::int FROM matriculas)   AS alumnos_matriculados,
           (SELECT round(avg(n.puntaje::numeric / ev.nota_total * 100), 1)
              FROM nota n
              JOIN evaluaciones ev ON ev.evaluacion_id = n.evaluacion_id) AS promedio_general`),
        query(`SELECT n.nivel_nombre AS nivel, count(DISTINCT m.estudiante_id)::int AS total
           FROM matriculas m
           JOIN grupo_academico g ON g.grupo_academico_id = m.grupo_academico_id
           JOIN nivel_academico n ON n.nivel_academico_id = g.nivel_academico_id
          GROUP BY n.nivel_nombre ORDER BY min(n.nivel_academico_id)`),
        query(`SELECT a.nombre_asignatura AS asignatura,
                round(avg(n.puntaje::numeric / ev.nota_total * 100), 1) AS promedio,
                count(*)::int AS total
           FROM nota n
           JOIN evaluaciones ev ON ev.evaluacion_id = n.evaluacion_id
           JOIN asignaturas a ON a.asignatura_id = ev.asignatura_id
          GROUP BY a.nombre_asignatura, a.asignatura_id
          ORDER BY promedio DESC NULLS LAST LIMIT 10`),
        query(`SELECT (e.primer_nombre || ' ' || e.primer_apellido) AS nombre,
                round(avg(n.puntaje::numeric / ev.nota_total * 100), 1) AS promedio,
                count(*)::int AS total
           FROM nota n
           JOIN evaluaciones ev ON ev.evaluacion_id = n.evaluacion_id
           JOIN estudiantes e ON e.estudiante_id = n.estudiante_id
          GROUP BY e.estudiante_id, e.primer_nombre, e.primer_apellido
         HAVING count(*) >= 2
          ORDER BY promedio DESC LIMIT 8`),
        query(`SELECT (e.primer_nombre || ' ' || e.primer_apellido) AS estudiante_nombre,
                g.grupo_nombre, m.matricula_fecha, m.matricula_id
           FROM matriculas m
           JOIN estudiantes e ON e.estudiante_id = m.estudiante_id
           JOIN grupo_academico g ON g.grupo_academico_id = m.grupo_academico_id
          ORDER BY m.matricula_fecha DESC, m.matricula_id DESC LIMIT 8`),
        // `pagos` no tiene columna de fecha en el esquema original: la fecha del
        // movimiento se toma de la orden a la que pertenece.
        query(`SELECT to_char(date_trunc('month', o.fecha_emision), 'YYYY-MM') AS mes,
                sum(p.monto_pagado)::int AS monto,
                count(*)::int AS ordenes
           FROM pagos p
           JOIN orden_pago o ON o.orden_pago_id = p.orden_pago_id
          GROUP BY 1 ORDER BY 1`),
        queryOne(`SELECT
           count(*) FILTER (WHERE fecha_finalizacion IS NULL)::int AS pendientes,
           count(*) FILTER (WHERE fecha_finalizacion IS NOT NULL)::int AS pagadas,
           count(*)::int AS total
         FROM orden_pago`),
    ]);
    res.json({
        data: {
            tarjetas: {
                estudiantes: tarjetas?.estudiantes ?? 0,
                empleados: tarjetas?.empleados ?? 0,
                docentes: tarjetas?.docentes ?? 0,
                asignaturas: tarjetas?.asignaturas ?? 0,
                matriculas: tarjetas?.matriculas ?? 0,
                notas: tarjetas?.notas ?? 0,
                alumnosMatriculados: tarjetas?.alumnos_matriculados ?? 0,
                promedioGeneral: Number(tarjetas?.promedio_general ?? 0),
            },
            porNivel,
            porAsignatura,
            topEstudiantes,
            ultimasMatriculas,
            ingresos,
            estadoPagos: estadoPagos ?? { pendientes: 0, pagadas: 0, total: 0 },
        },
    });
});
//# sourceMappingURL=dashboard.routes.js.map