import { describe, expect, it } from 'vitest';
import { MODULOS } from '../config/modulos';

/**
 * Contrato entre la configuración de pantalla y el esquema de PostgreSQL.
 *
 * La API expone cada módulo con JOINs: la fila trae columnas calculadas
 * (`promedio`, `total_matriculas`, `nombre_completo`...) que existen en el
 * SELECT pero no en la tabla. Si alguna de esas llega al formulario, el
 * `INSERT` incluye una columna inexistente y PostgreSQL responde con un error
 * que no ayuda a nadie.
 *
 * Las listas de abajo son las columnas reales de cada tabla; si se agrega una
 * columna al esquema hay que actualizarlas.
 */

const COLUMNAS_DE_LA_TABLA: Record<string, readonly string[]> = {
  estudiantes: [
    'estudiante_id',
    'cliente_id',
    'primer_nombre',
    'primer_apellido',
    'direccion',
    'nacimiento',
    'telefono',
    'fecha_registro',
    'estado',
  ],
  clientes: ['cliente_id', 'nombre', 'telefono', 'email', 'cliente_tipo'],
  // `docentes` reparte sus columnas entre dos tablas: el cargo en `docentes`
  // y los datos de la persona en `empleados`.
  docentes: [
    'empleado_id',
    'docente_codigo',
    'titulo_profesional',
    'especialidad',
    'nivel_formacion',
    'experiencia_docente',
    'fecha_ingreso',
    'categoria_docente',
    'dedicacion',
    'estado',
    'primer_nombre',
    'primer_apellido',
    'cedula',
    'email',
    'telefono',
    'salario',
  ],
  asignaturas: [
    'asignatura_id',
    'programa_academico_id',
    'nombre_asignatura',
    'codigo',
    'horas_semana',
    'descripcion',
  ],
  grupos: ['grupo_academico_id', 'nivel_academico_id', 'grupo_nombre', 'turno'],
  matriculas: [
    'matricula_id',
    'estudiante_id',
    'grupo_academico_id',
    'matricula_fecha',
    'observaciones',
  ],
  notas: ['nota_id', 'evaluacion_id', 'estudiante_id', 'puntaje', 'fecha_registro'],
  pagos: ['orden_pago_id', 'cliente_id', 'usuario_id', 'fecha_emision', 'fecha_finalizacion'],
};

describe('columnas de la tabla base', () => {
  it('cubre los ocho módulos', () => {
    expect(Object.keys(COLUMNAS_DE_LA_TABLA).sort()).toEqual(MODULOS.map((m) => m.modulo).sort());
  });

  it('toda columna calculada queda fuera del formulario', () => {
    const derivadas: string[] = [];

    for (const mod of MODULOS) {
      const reales = COLUMNAS_DE_LA_TABLA[mod.modulo];
      for (const columna of mod.columnas) {
        // Una columna que no existe en la tabla solo puede ser de lectura: si
        // entrara al formulario, el INSERT llevaría un identificador inexistente.
        const esReal = reales.includes(columna.clave);
        const entraAlFormulario = !columna.soloLectura && !columna.autogenerada;
        if (!esReal && entraAlFormulario) derivadas.push(`${mod.modulo}.${columna.clave}`);
      }
    }

    expect(
      derivadas,
      'estas columnas no existen en la tabla: márcalas con soloLectura para que el formulario no las envíe',
    ).toEqual([]);
  });

  it('toda columna de la tabla base está en la configuración', () => {
    const faltantes: string[] = [];

    for (const mod of MODULOS) {
      const declaradas = mod.columnas.map((c) => c.clave);
      for (const columna of COLUMNAS_DE_LA_TABLA[mod.modulo]) {
        if (!declaradas.includes(columna)) faltantes.push(`${mod.modulo}.${columna}`);
      }
    }

    // No bloquea, pero avisa: si la API empieza a exponer una columna nueva y
    // la pantalla no la muestra, el usuario no la ve en ninguna parte.
    expect(faltantes).toEqual([]);
  });

  it('las columnas primary de cada tabla no se editan', () => {
    // La PK la decide el servidor; mandarla en un POST rompería la inserción.
    for (const mod of MODULOS) {
      const reales = COLUMNAS_DE_LA_TABLA[mod.modulo];
      if (!mod.columnas.some((c) => c.clave === mod.pk)) continue;

      const pk = mod.columnas.find((c) => c.clave === mod.pk)!;
      // `docentes.empleado_id` es la excepción: no tiene DEFAULT en el esquema,
      // así que el usuario debe escribirla al dar de alta.
      if (mod.modulo === 'docentes' && mod.pk === 'empleado_id') continue;

      expect(reales).toContain(mod.pk);
      expect(pk.autogenerada, `${mod.modulo}.${mod.pk} debería estar marcada autogenerada`).toBe(
        true,
      );
    }
  });
});
