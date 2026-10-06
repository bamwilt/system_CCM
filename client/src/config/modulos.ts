import type { Catalogos } from '../api/tipos';

/**
 * Descripción declarativa de los ocho módulos.
 *
 * Cada módulo declara sus columnas y la pantalla genérica de CRUD construye
 * tabla, búsqueda, filtros y formulario a partir de esta configuración. Así la
 * interfaz de los ocho módulos es exactamente la misma y agregar una columna
 * es una línea, no un componente nuevo.
 *
 * Los nombres de campo coinciden exactamente con lo que expone la API
 * (`server/src/routes/modulos.routes.ts`).
 */

/** Tipo de dato de una columna: define el input del formulario y el filtro. */
export type TipoColumna =
  | 'texto'
  | 'numero'
  | 'decimal'
  | 'fecha'
  | 'booleano'
  | 'seleccion'
  | 'email'
  | 'telefono'
  | 'area'
  | 'autoincremento';

export interface Columna {
  /** Nombre exacto de la clave en la respuesta de la API. */
  clave: string;
  /** Nunca se escribe: la genera la base con `DEFAULT nextval(...)`. */
  autogenerada?: boolean;
  etiqueta: string;
  tipo: TipoColumna;
  /**
   * La columna no aparece en el listado, solo en el formulario.
   *
   * Se reserva para campos que se escriben pero no interesa mostrar (por
   * ejemplo el ID que el usuario teclea al dar de alta un empleado).
   */
  soloFormulario?: boolean;
  /**
   * La columna no aparece en el formulario: es de solo lectura.
   *
   * Es el caso de todo lo que calcula el servidor —`promedio`, `total_matriculas`,
   * `nombre_completo`— y de las columnas que vienen de un JOIN. No existen en la
   * tabla base, así que mandarlas en un POST haría fallar la inserción.
   */
  soloLectura?: boolean;
  /** Valor por defecto al crear. */
  porDefecto?: string | number | boolean;
  /** Marca el campo como obligatorio en el formulario. */
  requerido?: boolean;
  /** Longitud máxima, alineada con el `varchar` del esquema. */
  max?: number;
  /** Decimales a mostrar en el listado. */
  decimales?: number;
  /** Renderiza el valor como monto en pesos (RD$). */
  moneda?: boolean;
  /** Opciones cuando `tipo` es `seleccion`. */
  opciones?: readonly string[];
  /** Catálogo de `Catalogos` para poblar el desplegable. */
  catalogo?: keyof Catalogos;
  /** Texto de ayuda bajo el input. */
  ayuda?: string;
  /** Columna de la fila que se usa como subtítulo al mostrar un desplegable. */
  subGrupo?: keyof Catalogos;
  /**
   * Clave que espera la API en `?orderBy=` para esta columna.
   *
   * Hace falta porque los dos lados usan nombres distintos: la API ordena por
   * nombres legibles (`apellido`, `promedio`, `grupo`) mientras que la fila usa
   * las columnas de la tabla (`primer_apellido`, `promedio`, `grupo_nombre`).
   * Sin este mapeo, ordenar por una columna devolvería un error 400.
   */
  ordenApi?: string;
}

export interface ConfiguracionModulo {
  /** Segmento de la ruta de la API, ej. 'estudiantes'. */
  modulo: string;
  titulo: string;
  singular: string;
  descripcion: string;
  /** Icono del menú lateral. */
  icono: string;
  /** Clave primaria, usada para editar y borrar. */
  pk: string;
  /** Columnas mostradas en la tabla, en orden. */
  columnas: readonly Columna[];
  /** Columna por la que se ordena el listado inicialmente. */
  ordenInicial?: { columna: string; direccion: 'asc' | 'desc' };
  /** Filtros combinables que aparecen sobre la tabla. */
  filtros?: readonly Columna[];
  /** Texto del placeholder del buscador. */
  placeholderBusqueda?: string;
  /** Oculta el botón de crear (no todos los roles necesitan dar de alta). */
  sinCrear?: boolean;
}

// --- Reutilizables ---------------------------------------------------------

const opcionesCliente: readonly string[] = ['Tutor', 'Padre', 'Madre', 'Estudiante'];

const opcionesTurno: readonly string[] = ['Matutina', 'Vespertina'];

// --- 1. Estudiantes --------------------------------------------------------

export const MODULOS: readonly ConfiguracionModulo[] = [
  {
    modulo: 'estudiantes',
    titulo: 'Estudiantes',
    singular: 'estudiante',
    descripcion: 'Alumnos matriculados, sus datos de contacto y su promedio.',
    icono: 'estudiantes',
    pk: 'estudiante_id',
    ordenInicial: { columna: 'primer_apellido', direccion: 'asc' },
    placeholderBusqueda: 'Buscar por nombre, apellido, dirección o teléfono',
    filtros: [{ clave: 'estado', etiqueta: 'Estado', tipo: 'booleano' }],
    columnas: [
      { clave: 'estudiante_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'primer_nombre',
        etiqueta: 'Nombres',
        tipo: 'texto',
        requerido: true,
        max: 20,
        ordenApi: 'nombre',
      },
      {
        clave: 'primer_apellido',
        etiqueta: 'Apellidos',
        tipo: 'texto',
        requerido: true,
        max: 20,
        ordenApi: 'apellido',
      },
      {
        clave: 'nacimiento',
        etiqueta: 'Nacimiento',
        tipo: 'fecha',
        requerido: true,
        ordenApi: 'nacimiento',
      },
      {
        // La fecha de registro la pone el servidor; se muestra pero no se edita.
        clave: 'fecha_registro',
        etiqueta: 'Registrado',
        tipo: 'fecha',
        ordenApi: 'registro',
        soloLectura: true,
      },
      { clave: 'direccion', etiqueta: 'Dirección', tipo: 'texto', max: 90 },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', max: 12 },
      { clave: 'cliente_id', etiqueta: 'Cliente', tipo: 'seleccion', catalogo: 'clientes' },
      {
        clave: 'cliente_nombre',
        etiqueta: 'Cliente (nombre)',
        tipo: 'texto',
        soloLectura: true,
      },
      { clave: 'tutor_nombre', etiqueta: 'Tutor', tipo: 'texto', soloLectura: true },
      { clave: 'total_matriculas', etiqueta: 'Matrículas', tipo: 'numero', soloLectura: true },
      {
        clave: 'promedio',
        etiqueta: 'Promedio',
        tipo: 'decimal',
        decimales: 1,
        ordenApi: 'promedio',
        soloLectura: true,
      },
      { clave: 'estado', etiqueta: 'Activo', tipo: 'booleano', porDefecto: true },
    ],
  },

  // --- 2. Clientes ---------------------------------------------------------

  {
    modulo: 'clientes',
    titulo: 'Clientes',
    singular: 'cliente',
    descripcion: 'Padres, madres y tutores responsables de los estudiantes.',
    icono: 'clientes',
    pk: 'cliente_id',
    ordenInicial: { columna: 'nombre', direccion: 'asc' },
    placeholderBusqueda: 'Buscar por nombre, email o teléfono',
    filtros: [
      { clave: 'cliente_tipo', etiqueta: 'Tipo', tipo: 'seleccion', opciones: opcionesCliente },
    ],
    columnas: [
      { clave: 'cliente_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'nombre',
        etiqueta: 'Nombre',
        tipo: 'texto',
        requerido: true,
        max: 40,
        ordenApi: 'nombre',
      },
      {
        clave: 'cliente_tipo',
        etiqueta: 'Tipo',
        tipo: 'seleccion',
        opciones: opcionesCliente,
        porDefecto: 'Padre',
        ordenApi: 'tipo',
      },
      { clave: 'email', etiqueta: 'Email', tipo: 'email', max: 60 },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', max: 12 },
      { clave: 'total_estudiantes', etiqueta: 'Estudiantes', tipo: 'numero', soloLectura: true },
      { clave: 'total_tutores', etiqueta: 'Tutores', tipo: 'numero', soloLectura: true },
      { clave: 'total_ordenes', etiqueta: 'Órdenes', tipo: 'numero', soloLectura: true },
    ],
  },

  // --- 3. Docentes ---------------------------------------------------------

  {
    modulo: 'docentes',
    titulo: 'Docentes',
    singular: 'docente',
    descripcion: 'Personal docente con su código, especialidad y asignación.',
    icono: 'docentes',
    pk: 'empleado_id',
    ordenInicial: { columna: 'nombre_completo', direccion: 'asc' },
    placeholderBusqueda: 'Buscar por nombre, cédula, email o especialidad',
    filtros: [
      { clave: 'especialidad', etiqueta: 'Especialidad', tipo: 'texto' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'booleano' },
    ],
    columnas: [
      {
        // `empleados.empleado_id` es integer NOT NULL sin DEFAULT (a diferencia
        // de las demas PK), asi que el usuario debe indicar el codigo al alta.
        clave: 'empleado_id',
        etiqueta: 'ID de empleado',
        tipo: 'numero',
        requerido: true,
      },
      {
        clave: 'docente_codigo',
        etiqueta: 'Código',
        tipo: 'numero',
        requerido: true,
        ordenApi: 'codigo',
      },
      {
        clave: 'nombre_completo',
        etiqueta: 'Nombre',
        tipo: 'texto',
        ordenApi: 'nombre',
        soloLectura: true,
      },
      {
        clave: 'primer_nombre',
        etiqueta: 'Nombres',
        tipo: 'texto',
        requerido: true,
        max: 30,
      },
      {
        clave: 'primer_apellido',
        etiqueta: 'Apellidos',
        tipo: 'texto',
        requerido: true,
        max: 30,
      },
      {
        clave: 'cedula',
        etiqueta: 'Cédula',
        tipo: 'texto',
        requerido: true,
        max: 30,
      },
      { clave: 'email', etiqueta: 'Email', tipo: 'email', max: 60 },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', max: 12 },
      { clave: 'especialidad', etiqueta: 'Especialidad', tipo: 'texto', max: 50 },
      { clave: 'titulo_profesional', etiqueta: 'Título', tipo: 'texto', max: 50 },
      { clave: 'nivel_formacion', etiqueta: 'Formación', tipo: 'texto', max: 50 },
      { clave: 'categoria_docente', etiqueta: 'Categoría', tipo: 'texto', max: 50 },
      { clave: 'dedicacion', etiqueta: 'Dedicación', tipo: 'texto', max: 50 },
      { clave: 'experiencia_docente', etiqueta: 'Experiencia', tipo: 'texto', max: 20 },
      { clave: 'fecha_ingreso', etiqueta: 'Ingreso', tipo: 'fecha' },
      {
        clave: 'salario',
        etiqueta: 'Salario',
        // `empleados.salario` es integer: declararlo decimal haría que el
        // formulario mandara 12.5 y la API lo rechace.
        tipo: 'numero',
        moneda: true,
      },
      { clave: 'total_asignaturas', etiqueta: 'Asignaturas', tipo: 'numero', soloLectura: true },
      { clave: 'estado', etiqueta: 'Activo', tipo: 'booleano', porDefecto: true },
    ],
  },

  // --- 4. Asignaturas ------------------------------------------------------

  {
    modulo: 'asignaturas',
    titulo: 'Asignaturas',
    singular: 'asignatura',
    descripcion: 'Materias del plan de estudios y su carga horaria semanal.',
    icono: 'asignaturas',
    pk: 'asignatura_id',
    ordenInicial: { columna: 'nombre_asignatura', direccion: 'asc' },
    placeholderBusqueda: 'Buscar asignatura, código o programa',
    filtros: [
      {
        clave: 'programa_academico_id',
        etiqueta: 'Programa',
        tipo: 'seleccion',
        catalogo: 'programas',
      },
    ],
    columnas: [
      { clave: 'asignatura_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      { clave: 'codigo', etiqueta: 'Código', tipo: 'numero', requerido: true, ordenApi: 'codigo' },
      {
        clave: 'nombre_asignatura',
        etiqueta: 'Asignatura',
        tipo: 'texto',
        requerido: true,
        max: 30,
        ordenApi: 'nombre',
      },
      { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', max: 30 },
      {
        clave: 'programa_academico_id',
        etiqueta: 'Programa',
        tipo: 'seleccion',
        catalogo: 'programas',
        requerido: true,
      },
      { clave: 'programa', etiqueta: 'Programa (nombre)', tipo: 'texto', soloLectura: true },
      { clave: 'grupo_nombre', etiqueta: 'Grupo', tipo: 'texto', soloLectura: true },
      { clave: 'horas_semana', etiqueta: 'Horas/sem', tipo: 'numero', ordenApi: 'horas' },
      { clave: 'total_docentes', etiqueta: 'Docentes', tipo: 'numero', soloLectura: true },
      {
        clave: 'total_evaluaciones',
        etiqueta: 'Evaluaciones',
        tipo: 'numero',
        soloLectura: true,
      },
    ],
  },

  // --- 5. Grupos -----------------------------------------------------------

  {
    modulo: 'grupos',
    titulo: 'Grupos académicos',
    singular: 'grupo',
    descripcion: 'Secciones por nivel y turno, con su matrícula consolidada.',
    icono: 'grupos',
    pk: 'grupo_academico_id',
    ordenInicial: { columna: 'grupo_nombre', direccion: 'asc' },
    placeholderBusqueda: 'Buscar grupo, turno o nivel',
    filtros: [
      { clave: 'nivel_academico_id', etiqueta: 'Nivel', tipo: 'seleccion', catalogo: 'niveles' },
      { clave: 'turno', etiqueta: 'Turno', tipo: 'seleccion', opciones: opcionesTurno },
    ],
    columnas: [
      { clave: 'grupo_academico_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'grupo_nombre',
        etiqueta: 'Grupo',
        tipo: 'texto',
        requerido: true,
        max: 20,
        ordenApi: 'grupo',
      },
      {
        clave: 'nivel_academico_id',
        etiqueta: 'Nivel',
        tipo: 'seleccion',
        catalogo: 'niveles',
        requerido: true,
      },
      {
        clave: 'nivel_nombre',
        etiqueta: 'Nivel (nombre)',
        tipo: 'texto',
        ordenApi: 'nivel',
        soloLectura: true,
      },
      {
        clave: 'turno',
        etiqueta: 'Turno',
        tipo: 'seleccion',
        opciones: opcionesTurno,
        max: 30,
        ordenApi: 'turno',
      },
      { clave: 'edad_min', etiqueta: 'Edad mín.', tipo: 'numero', soloLectura: true },
      { clave: 'edad_max', etiqueta: 'Edad máx.', tipo: 'numero', soloLectura: true },
      { clave: 'matriculados', etiqueta: 'Matriculados', tipo: 'numero', soloLectura: true },
    ],
  },

  // --- 6. Matrículas -------------------------------------------------------

  {
    modulo: 'matriculas',
    titulo: 'Matrículas',
    singular: 'matrícula',
    descripcion: 'Inscripción de estudiantes en grupos y su estado de pensiones.',
    icono: 'matriculas',
    pk: 'matricula_id',
    ordenInicial: { columna: 'matricula_fecha', direccion: 'desc' },
    placeholderBusqueda: 'Buscar estudiante, grupo u observación',
    filtros: [
      { clave: 'grupo_academico_id', etiqueta: 'Grupo', tipo: 'seleccion', catalogo: 'grupos' },
      {
        clave: 'estudiante_id',
        etiqueta: 'Estudiante',
        tipo: 'seleccion',
        catalogo: 'estudiantes',
      },
    ],
    columnas: [
      { clave: 'matricula_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'estudiante_id',
        etiqueta: 'Estudiante',
        tipo: 'seleccion',
        catalogo: 'estudiantes',
        requerido: true,
      },
      {
        clave: 'estudiante_nombre',
        etiqueta: 'Estudiante (nombre)',
        tipo: 'texto',
        ordenApi: 'estudiante',
        soloLectura: true,
      },
      {
        clave: 'grupo_academico_id',
        etiqueta: 'Grupo',
        tipo: 'seleccion',
        catalogo: 'grupos',
        requerido: true,
      },
      {
        clave: 'grupo_nombre',
        etiqueta: 'Grupo (nombre)',
        tipo: 'texto',
        ordenApi: 'grupo',
        soloLectura: true,
      },
      { clave: 'turno', etiqueta: 'Turno', tipo: 'texto', soloLectura: true },
      { clave: 'nivel_nombre', etiqueta: 'Nivel', tipo: 'texto', soloLectura: true },
      {
        clave: 'matricula_fecha',
        etiqueta: 'Fecha',
        tipo: 'fecha',
        requerido: true,
        ordenApi: 'fecha',
      },
      { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto', max: 30 },
      { clave: 'total_pensiones', etiqueta: 'Pensiones', tipo: 'numero', soloLectura: true },
      {
        clave: 'monto_pensiones',
        moneda: true,
        etiqueta: 'Monto',
        tipo: 'decimal',
        decimales: 2,
        soloLectura: true,
      },
      { clave: 'pendientes', etiqueta: 'Pendientes', tipo: 'numero', soloLectura: true },
    ],
  },

  // --- 7. Notas ------------------------------------------------------------

  {
    modulo: 'notas',
    titulo: 'Notas',
    singular: 'nota',
    descripcion: 'Puntajes por evaluación y el porcentaje obtenido.',
    icono: 'notas',
    pk: 'nota_id',
    ordenInicial: { columna: 'fecha_registro', direccion: 'desc' },
    placeholderBusqueda: 'Buscar asignatura, evaluación o estudiante',
    filtros: [
      {
        clave: 'estudiante_id',
        etiqueta: 'Estudiante',
        tipo: 'seleccion',
        catalogo: 'estudiantes',
      },
      {
        clave: 'evaluacion_id',
        etiqueta: 'Evaluación',
        tipo: 'seleccion',
        catalogo: 'evaluaciones',
      },
    ],
    columnas: [
      { clave: 'nota_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'evaluacion_id',
        etiqueta: 'Evaluación',
        tipo: 'seleccion',
        catalogo: 'evaluaciones',
        requerido: true,
      },
      {
        clave: 'evaluacion_nombre',
        etiqueta: 'Evaluación (nombre)',
        tipo: 'texto',
        soloLectura: true,
      },
      { clave: 'nombre_asignatura', etiqueta: 'Asignatura', tipo: 'texto', soloLectura: true },
      { clave: 'nota_total', etiqueta: 'Máximo', tipo: 'numero', soloLectura: true },
      {
        clave: 'estudiante_id',
        etiqueta: 'Estudiante',
        tipo: 'seleccion',
        catalogo: 'estudiantes',
        requerido: true,
      },
      {
        clave: 'estudiante_nombre',
        etiqueta: 'Estudiante (nombre)',
        tipo: 'texto',
        ordenApi: 'estudiante',
        soloLectura: true,
      },
      {
        clave: 'puntaje',
        etiqueta: 'Puntaje',
        tipo: 'numero',
        requerido: true,
        ordenApi: 'puntaje',
      },
      {
        clave: 'porcentaje',
        etiqueta: '% Obtenido',
        tipo: 'decimal',
        decimales: 1,
        ordenApi: 'porcentaje',
        soloLectura: true,
      },
      {
        clave: 'fecha_registro',
        etiqueta: 'Fecha',
        tipo: 'fecha',
        ordenApi: 'fecha',
        soloLectura: true,
      },
    ],
  },

  // --- 8. Pagos ------------------------------------------------------------

  {
    modulo: 'pagos',
    titulo: 'Órdenes de pago',
    singular: 'orden de pago',
    descripcion: 'Facturación a clientes y cobros registrados.',
    icono: 'pagos',
    pk: 'orden_pago_id',
    ordenInicial: { columna: 'fecha_emision', direccion: 'desc' },
    placeholderBusqueda: 'Buscar cliente o usuario emisor',
    filtros: [
      { clave: 'cliente_id', etiqueta: 'Cliente', tipo: 'seleccion', catalogo: 'clientes' },
      { clave: 'usuario_id', etiqueta: 'Usuario', tipo: 'seleccion', catalogo: 'usuarios' },
    ],
    columnas: [
      { clave: 'orden_pago_id', etiqueta: 'ID', tipo: 'autoincremento', autogenerada: true },
      {
        clave: 'cliente_id',
        etiqueta: 'Cliente',
        tipo: 'seleccion',
        catalogo: 'clientes',
        requerido: true,
      },
      {
        clave: 'cliente_nombre',
        etiqueta: 'Cliente (nombre)',
        tipo: 'texto',
        ordenApi: 'cliente',
        soloLectura: true,
      },
      {
        clave: 'usuario_id',
        etiqueta: 'Usuario',
        tipo: 'seleccion',
        catalogo: 'usuarios',
        requerido: true,
      },
      {
        clave: 'usuario_nombre',
        etiqueta: 'Usuario (nombre)',
        tipo: 'texto',
        soloLectura: true,
      },
      { clave: 'fecha_emision', etiqueta: 'Emisión', tipo: 'fecha', ordenApi: 'fecha' },
      { clave: 'fecha_finalizacion', etiqueta: 'Pago', tipo: 'fecha' },
      { clave: 'total_productos', etiqueta: 'Productos', tipo: 'numero', soloLectura: true },
      { clave: 'total_servicios', etiqueta: 'Servicios', tipo: 'numero', soloLectura: true },
      {
        clave: 'total_pagado',
        moneda: true,
        etiqueta: 'Pagado',
        tipo: 'decimal',
        decimales: 2,
        soloLectura: true,
      },
      {
        clave: 'total_orden',
        moneda: true,
        etiqueta: 'Total',
        tipo: 'decimal',
        decimales: 2,
        soloLectura: true,
      },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'texto', soloLectura: true },
    ],
  },
];

export function modulosVisibles(tieneEdicion: boolean): readonly ConfiguracionModulo[] {
  return MODULOS.filter((m) => tieneEdicion || !m.sinCrear);
}
