import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
const niveles = () => query(`SELECT nivel_academico_id AS id, nivel_nombre AS etiqueta, edad_min AS extra
       FROM nivel_academico ORDER BY nivel_nombre`);
const grupos = () => query(`SELECT g.grupo_academico_id AS id, g.grupo_nombre AS etiqueta, n.nivel_nombre AS extra
       FROM grupo_academico g
       JOIN nivel_academico n ON n.nivel_academico_id = g.nivel_academico_id
      ORDER BY g.grupo_nombre`);
const programas = () => query(`SELECT p.programa_academico_id AS id, p.nombre_pograma AS etiqueta, g.grupo_nombre AS extra
       FROM programa_academico p
       JOIN grupo_academico g ON g.grupo_academico_id = p.grupo_academico_id
      ORDER BY p.nombre_pograma`);
const asignaturas = () => query(`SELECT asignatura_id AS id, nombre_asignatura AS etiqueta, horas_semana AS extra
       FROM asignaturas ORDER BY nombre_asignatura`);
const estudiantes = () => query(`SELECT estudiante_id AS id,
            primer_nombre || ' ' || primer_apellido AS etiqueta,
            cliente_id AS extra
       FROM estudiantes ORDER BY primer_apellido, primer_nombre`);
const clientes = () => query(`SELECT cliente_id AS id, nombre AS etiqueta, cliente_tipo AS extra
       FROM clientes ORDER BY nombre`);
const docentes = () => query(`SELECT d.empleado_id AS id,
            em.primer_nombre || ' ' || em.primer_apellido AS etiqueta,
            d.especialidad AS extra
       FROM docentes d
       JOIN empleados em ON em.empleado_id = d.empleado_id
      ORDER BY em.primer_apellido, em.primer_nombre`);
/**
 * Evaluaciones con el detalle necesario para validar una nota en el cliente:
 * el `notaTotal` es el máximo de la evaluación y la asignatura a la que
 * pertenece, así el formulario puede avisar antes de dejar que el usuario
 * escriba un puntaje imposible.
 */
const evaluaciones = () => query(`SELECT ev.evaluacion_id AS id,
            ev.evaluacion_nombre AS etiqueta,
            ev.nota_total,
            a.nombre_asignatura AS asignatura
       FROM evaluaciones ev
       JOIN asignaturas a ON a.asignatura_id = ev.asignatura_id
      ORDER BY a.nombre_asignatura, ev.evaluacion_nombre`);
const usuarios = () => query(`SELECT usuario_id AS id, nombre AS etiqueta, rol AS extra
       FROM usuarios WHERE activo = true ORDER BY nombre`);
const metodosPago = () => query(`SELECT metodo_pago_id AS id, nombre_metodo AS etiqueta, descripcion AS extra
       FROM metodo_pago ORDER BY nombre_metodo`);
export const catalogosRouter = Router();
catalogosRouter.get('/', requiereAuth, async (_req, res) => {
    // Todas las consultas son independientes: se lanzan a la vez.
    const [niveles_, grupos_, programas_, asignaturas_, estudiantes_, clientes_, docentes_, evaluaciones_, usuarios_, metodosPago_,] = await Promise.all([
        niveles(),
        grupos(),
        programas(),
        asignaturas(),
        estudiantes(),
        clientes(),
        docentes(),
        evaluaciones(),
        usuarios(),
        metodosPago(),
    ]);
    res.json({
        data: {
            niveles: niveles_,
            grupos: grupos_,
            programas: programas_,
            asignaturas: asignaturas_,
            estudiantes: estudiantes_,
            clientes: clientes_,
            docentes: docentes_,
            evaluaciones: evaluaciones_,
            usuarios: usuarios_,
            metodosPago: metodosPago_,
        },
    });
});
//# sourceMappingURL=catalogos.routes.js.map