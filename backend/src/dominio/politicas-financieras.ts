/**
 * ============================================================================
 * POLITICAS FINANCIERAS DEL MOTOR (FASE 6.B) - UNICA FUENTE DE PARAMETROS
 * ============================================================================
 *
 * >>> PROPUESTA TECNICA PENDIENTE DE RATIFICACION INSTITUCIONAL <<<
 *
 * Todos los valores de este modulo son la propuesta tecnica del desarrollador,
 * DELEGADA EXPLICITAMENTE POR EL SOLICITANTE EL 2026-11-10 ("lo de reglas mora
 * fifo investigalas tu, yo no tengo nada de reglas institucionales, te lo dejo
 * a tu criterio"). NO son politica institucional, NO sustituyen la ratificacion
 * de Direccion/cobros y NO constituyen acta del colegio. Estado registrado en
 * DEC-20 (docs/DECISIONES_Y_CONTRADICCIONES.md):
 * "PROPUESTA TECNICA; RATIFICACION INSTITUCIONAL PENDIENTE".
 *
 * NO PRESENTAR ESTOS VALORES COMO APROBADOS. Bloquean la aceptacion
 * institucional de importes finales hasta que el colegio ratifique o corrija
 * (vinculado a DEC-04, DEC-05, DEC-06, DEC-07 y DEC-08).
 *
 * PROPOSITO: que TODOS los parametros del motor financiero vivan aqui y en
 * ningun otro sitio. Ratificar o corregir la politica debe ser un cambio de
 * CONFIGURACION (variable de entorno validada) y nunca un cambio de codigo.
 * Ningun consumidor del motor puede incrustar un numero: lo lee de aqui.
 *
 * GARANTIAS DE ESTE MODULO:
 * - Importable sin efectos secundarios: NO lee la base de datos, NO abre
 *   conexiones, NO escribe archivos, NO usa console. Unica lectura permitida:
 *   el entorno recibido por parametro (process.env por defecto), igual que
 *   backend/src/config/env.ts. La resolucion es pura: construye objetos y no
 *   muta nada.
 * - Parametro ausente (o cadena vacia): se usa el valor PROPUESTO en DEC-20,
 *   documentado campo por campo mas abajo. No es un valor inventado: es la
 *   propuesta tecnica registrada.
 * - Parametro presente e invalido: FALLA RUIDOSO (lanza
 *   ErrorPoliticaFinancieraInvalida). Nunca se sustituye en silencio por otro
 *   valor, nunca se cae a 0, a null ni a NaN.
 * - Importes exactos: `porcentajeMora` es cadena decimal exacta y el redondeo
 *   se realiza en PostgreSQL (NUMERIC), nunca en JavaScript. Prohibido Number()
 *   y parseFloat() sobre importes.
 *
 * PARA RATIFICAR: no se edita este archivo para "aprobar" nada. Se registra la
 * decision (ID, decisor, fecha, evidencia) en
 * docs/DECISIONES_Y_CONTRADICCIONES.md y, si los valores cambian, se fijan las
 * variables de entorno validadas que se listan en
 * CLAVES_ENTORNO_POLITICAS_FINANCIERAS.
 */

import { z } from 'zod';

/* ==========================================================================
 * 1. Estado documental (constantes, sin logica)
 * ======================================================================== */

/** Estado registrado en DEC-20. No es una aprobacion. */
export const ESTADO_POLITICAS_FINANCIERAS =
  'PROPUESTA_TECNICA_PENDIENTE_DE_RATIFICACION' as const;

/** Fuente de todos los valores por defecto de este modulo. */
export const FUENTE_POLITICAS_FINANCIERAS =
  'DEC-20 - docs/DECISIONES_Y_CONTRADICCIONES.md' as const;

/** Delegacion que autoriza la propuesta (no la ratifica institucionalmente). */
export const DELEGACION_POLITICAS_FINANCIERAS =
  '2026-11-10 - delegacion explicita del solicitante' as const;

/** Discrepancia entre fuentes que queda registrada y NO se adopta. */
export interface DiscrepanciaRegistrada {
  readonly id: string;
  readonly fuentes: string;
  readonly contenido: string;
  readonly decision: string;
  readonly decisionReferencia: string;
}

/**
 * Conflictos entre documentos fuente que se registran sin adoptar. Cambiar
 * cualquiera de estas lineas exige una ratificacion institucional, no una
 * opinion tecnica: la propuesta del motor se mantiene con la mayoria de
 * fuentes (D02/D05/D07) y la minoria (D12) queda anotada, no reescrita.
 */
export const DISCREPANCIAS_REGISTRADAS_NO_ADOPTADAS: readonly DiscrepanciaRegistrada[] =
  [
    {
      id: 'D12-DIA-5-MORA',
      fuentes: 'D12 P0227 y Anexo D FUN-04',
      contenido: 'mora a partir del dia 5 (despues del dia 5)',
      decision:
        'discrepancia registrada, NO adoptada; se mantiene vencimiento dia 10 y mora desde el dia 11',
      decisionReferencia: 'DEC-04 / DEC-20 (D02 FR-038, D05 RN-03)',
    },
    {
      id: 'D07-P0350-DESCUENTO-COMO-EFECTIVO',
      fuentes: 'D07 P0350',
      contenido: 'sumar el descuento al efectivo recibido',
      decision:
        'no adoptado; el descuento no se contabiliza como dinero cobrado',
      decisionReferencia: 'DEC-07 / DEC-20',
    },
    {
      id: 'D07-PORCENTAJES-DIDACTICOS',
      fuentes: 'D07 ejemplos (15% hermanos, 10% pronto pago, 50% beca, 25% convenio)',
      contenido: 'porcentajes de descuento de ejemplo',
      decision:
        'ejemplos didacticos, no adoptados; no existe porcentaje de descuento por defecto',
      decisionReferencia: 'DEC-07 / DEC-20',
    },
    {
      id: 'D05-EJEMPLO-SIN-MORA',
      fuentes: 'D05 P0336-0342',
      contenido: 'pagos en abril de deudas de febrero/marzo sin mora',
      decision:
        'no se trata como politica ni como exencion tacita de mora',
      decisionReferencia: 'DEC-04',
    },
    {
      id: 'DEC-06-EXCEDENTE-ALTERNATIVAS',
      fuentes: 'DEC-06 / D10 parrafo III',
      contenido:
        'alternativas de excedente: recibir solo la deuda y devolver cambio, o generar saldo a favor',
      decision:
        'descartadas mientras no haya ratificacion; se rechaza el excedente por ser la opcion conservadora',
      decisionReferencia: 'DEC-06 / DEC-20',
    },
  ];

/* ==========================================================================
 * 2. Error ruidoso
 * ======================================================================== */

/**
 * Error de configuracion de las politicas financieras. Se lanza cuando una
 * variable de entorno esta presente pero no es valida, o cuando la
 * documentacion interna del modulo diverge del codigo. Jamas se devuelve un
 * valor por defecto distinto del documentado para "no romper" el arranque.
 */
export class ErrorPoliticaFinancieraInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorPoliticaFinancieraInvalida';
  }
}

/* ==========================================================================
 * 3. Validadores estrictos (Zod) para cada familia de valores
 * ======================================================================== */

/**
 * Entero sin signo en rango. La cadena se valida con regex ANTES de convertir:
 * no se usa parseInt ni Number() sobre cadenas permisivas.
 */
function esquemaEnteroRango(
  etiqueta: string,
  min: number,
  max: number,
  patron: RegExp = /^\d{1,3}$/
) {
  return z
    .string()
    .regex(patron, {
      message: `${etiqueta}: se esperaba un entero sin signo (solo digitos, sin ceros a la izquierda)`,
    })
    .transform((valor) => Number(valor))
    .refine((valor) => Number.isSafeInteger(valor) && valor >= min && valor <= max, {
      message: `${etiqueta}: fuera del rango permitido ${min}..${max}`,
    });
}

/** Dia del mes: entero de 1 a 28, sin ceros a la izquierda. */
function esquemaDiaDelMes(etiqueta: string) {
  return esquemaEnteroRango(etiqueta, 1, 28, /^[1-9][0-9]?$/);
}

/**
 * Booleano estricto: solo 'true' o 'false' (sin distinguir mayusculas).
 * No se aceptan '1'/'0'/'yes'/'on': una variable mal escrita debe fallar,
 * no interpretarse.
 */
function esquemaBooleano(etiqueta: string) {
  return z
    .string()
    .toLowerCase()
    .refine((valor) => valor === 'true' || valor === 'false', {
      message: `${etiqueta}: se esperaba exactamente 'true' o 'false'`,
    })
    .transform((valor) => valor === 'true');
}

/**
 * Decimal exacto en TEXTO para porcentajes (0..100). Nunca number, nunca
 * parseFloat: la cadena se consume tal cual y la aritmetica la resuelve
 * PostgreSQL. Se rechazan signo, ceros a la izquierda, notacion cientifica y
 * separadores de miles.
 */
const DECIMAL_EXACTO = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;

function esquemaDecimalExacto(etiqueta: string) {
  return z
    .string()
    .regex(DECIMAL_EXACTO, {
      message: `${etiqueta}: se esperaba un decimal exacto en texto (p. ej. '10' o '12.5'), sin signo, sin ceros a la izquierda y sin notacion cientifica`,
    })
    .refine((valor) => {
      const [entero, fraccion] = valor.split('.');
      if (Number(entero) > 100) {
        return false;
      }
      if (entero === '100' && fraccion !== undefined) {
        return false; // 100.x es mayor que 100
      }
      return true;
    }, { message: `${etiqueta}: el valor debe estar entre 0 y 100` });
}

/** Token de orden tipo 'fecha_vencimiento_asc' (clave de ORDER BY). */
const TOKEN_ORDEN = /^[a-z][a-z0-9_]*(?:_asc|_desc)$/;

/** Token generico en snake_case (contrato simbolico del motor). */
const TOKEN_SNAKE = /^[a-z][a-z0-9_]*$/;

/** Token de estado en MAYUSCULAS (valores almacenados en base de datos). */
const TOKEN_ESTADO = /^[A-Z][A-Z0-9_]*$/;

/**
 * Criterio de desempate FIFO: lista ordenada de 1 a 4 tokens separados por
 * coma, sin repetidos. El valor propuesto por DEC-20 es determinista y no
 * depende del orden de insercion.
 */
function esquemaDesempate(etiqueta: string) {
  return z
    .string()
    .transform((valor) =>
      valor
        .split(',')
        .map((parte) => parte.trim())
        .filter((parte) => parte.length > 0)
    )
    .refine((partes) => partes.length >= 1 && partes.length <= 4, {
      message: `${etiqueta}: se esperaba de 1 a 4 criterios separados por coma`,
    })
    .refine((partes) => partes.every((parte) => TOKEN_ORDEN.test(parte)), {
      message: `${etiqueta}: cada criterio debe ser un token como 'numero_cuota_asc' o 'id_asc'`,
    })
    .refine((partes) => new Set(partes).size === partes.length, {
      message: `${etiqueta}: los criterios no pueden repetirse`,
    })
    .transform((partes) => partes.join(','));
}

/* ==========================================================================
 * 4. Enums de alternativas DOCUMENTADAS en las fuentes
 * ======================================================================== */

/**
 * Ambito FIFO. DEC-06 documenta exactamente dos alcances: el plan del anio
 * academico de la matricula o la deuda completa del estudiante. D07 P0128
 * acota al ciclo actual; cruzar anos no tiene regla aprobada.
 */
export type AmbitoFifo = 'plan_de_la_matricula' | 'deuda_completa_del_estudiante';

/**
 * Tratamiento del excedente sobre la deuda total. DEC-06 documenta tres
 * alternativas; D10 parrafo III (montos validos <= deuda total) y D05 CU-02
 * (sobrante solo entre cuotas) respaldan rechazar.
 */
export type TratamientoExcedente =
  | 'rechazar'
  | 'recibir_solo_deuda_y_devolver_cambio'
  | 'saldo_a_favor';

/**
 * Momento del descuento. DEC-07 documenta tres alternativas; D05 CU-01 fija
 * antes de generar el plan de pago.
 */
export type PoliticaDescuento =
  | 'antes_de_generar_el_plan'
  | 'beca_al_generar_plan'
  | 'descuento_de_obligacion_autorizado_posteriormente';

/* ==========================================================================
 * 5. Esquema de las politicas (un parametro por campo, con su default DEC-20)
 * ======================================================================== */

const esquemaPoliticas = z.object({
  /* ---- Vencimiento y mora (D02 FR-038, D02 CA-04, D05 RN-03, D05 P0227) ---- */

  /**
   * Dia del mes en que vence la cuota.
   * Fuente: D02 FR-038 y D05 RN-03 (vencimiento dia 10). D12 P0227 y Anexo D
   * FUN-04 dicen "despues del dia 5": DISCREPANCIA REGISTRADA, NO ADOPTADA
   * (ver DISCREPANCIAS_REGISTRADAS_NO_ADOPTADAS). PROPUESTA PENDIENTE DE
   * RATIFICACION INSTITUCIONAL (DEC-20/DEC-04).
   * Alias historico: MOTOR_DIA_CORTE (DEC-20 habla de "dia de corte").
   */
  diaVencimiento: esquemaDiaDelMes('MOTOR_DIA_VENCIMIENTO').default('10'),

  /**
   * Primer dia en que la cuota vencida genera mora.
   * Fuente: D02 FR-038 y D05 RN-03 (mora 10% desde el dia 11). Misma
   * discrepancia del dia 5 NO adoptada. PROPUESTA PENDIENTE DE RATIFICACION.
   */
  diaInicioMora: esquemaDiaDelMes('MOTOR_DIA_INICIO_MORA').default('11'),

  /**
   * Porcentaje de mora como CADENA DECIMAL EXACTA ('10' = 10%). Nunca number,
   * nunca parseFloat: la aritmetica y el redondeo ocurren en PostgreSQL.
   * Fuente: D02 CA-04 y D05 RN-03 (10% desde el dia 11). PROPUESTA PENDIENTE
   * DE RATIFICACION INSTITUCIONAL (DEC-20/DEC-04).
   */
  porcentajeMora: esquemaDecimalExacto('MOTOR_PORCENTAJE_MORA').default('10'),

  /**
   * La mora se cobra UNA SOLA VEZ sobre el monto base de la cuota vencida no
   * saldada (no se reaplica por anio de antiguedad).
   * Fuente: D05 P0227. PROPUESTA PENDIENTE DE RATIFICACION.
   */
  moraUnicaSobreMontoBase: esquemaBooleano(
    'MOTOR_MORA_UNICA_SOBRE_MONTO_BASE'
  ).default('true'),

  /**
   * La mora NO capitaliza: reducir el saldo de una cuota no recalcula su mora
   * y la mora no entra en la base de un nuevo calculo.
   * Fuente: D05 P0227 y DEC-04 (no capitalizacion). PROPUESTA PENDIENTE DE
   * RATIFICACION. Contradice `moraUnicaSobreMontoBase = true`.
   */
  moraCapitalizable: esquemaBooleano('MOTOR_MORA_CAPITALIZABLE').default('false'),

  /* ---- Aplicacion de abonos: FIFO (D02 P0101, D02 CA-03, D05 RN-02, D07 P0347, D07 P0128) ---- */

  /**
   * Clave de orden FIFO: aplicar el abono a la cuota vencida mas antigua,
   * recalculando el saldo antes de pasar a la siguiente.
   * Fuente: D02 P0101/CA-03, D05 RN-02 y D07 P0347 coinciden. Valor propuesto
   * 'fecha_vencimiento_asc'. PROPUESTA PENDIENTE DE RATIFICACION (DEC-20/DEC-06).
   */
  ordenFifo: z.string().regex(TOKEN_ORDEN, {
    message:
      "MOTOR_ORDEN_FIFO: se esperaba un token de orden como 'fecha_vencimiento_asc'",
  }).default('fecha_vencimiento_asc'),

  /**
   * Criterios de desempate del orden FIFO, en orden de prioridad.
   * Fuente: determinismo exigido por DEC-20 (sin depender del orden de
   * insercion): `numero_cuota` ascendente y despues `id` ascendente.
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  desempate: esquemaDesempate('MOTOR_DESEMPATE_FIFO').default(
    'numero_cuota_asc,id_asc'
  ),

  /**
   * Ambito de la ventana FIFO.
   * Fuente: D07 P0128 acota a la deuda del ciclo actual. Cruzar anios
   * academicos NO tiene regla aprobada (DEC-06), por eso el ambito es el plan
   * de la matricula y no la deuda historica completa del estudiante.
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  ambitoFifo: z
    .enum(['plan_de_la_matricula', 'deuda_completa_del_estudiante'])
    .default('plan_de_la_matricula'),

  /**
   * Tratamiento del excedente sobre la deuda total.
   * Fuente: D10 parrafo III (montos validos <= deuda total) y su endpoint
   * ilustrativo rechaza el excedente; D05 CU-02 solo admite sobrante ENTRE
   * cuotas, no credito global. Rechazar es la alternativa conservadora y evita
   * inventar "saldo a favor" sin norma. PROPUESTA PENDIENTE DE RATIFICACION.
   */
  tratamientoExcedente: z
    .enum(['rechazar', 'recibir_solo_deuda_y_devolver_cambio', 'saldo_a_favor'])
    .default('rechazar'),

  /**
   * Modo de aplicacion del abono parcial: secuencial con remanente, sin
   * generar saldo negativo en ninguna cuota.
   * Fuente: D05 CU-02 (el sobrante pasa a la cuota siguiente). PROPUESTA
   * PENDIENTE DE RATIFICACION (DEC-20).
   */
  modoAbonoParcial: z.string().regex(TOKEN_SNAKE, {
    message: "MOTOR_MODO_ABONO_PARCIAL: se esperaba un token como 'secuencial_con_remanente'",
  }).default('secuencial_con_remanente'),

  /**
   * Prohibicion explicita de saldo negativo por cuota al aplicar un abono.
   * Fuente: D05 CU-02 / DEC-20 ("sin generar saldo negativo en ninguna cuota").
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  permitirSaldoNegativoEnCuota: esquemaBooleano(
    'MOTOR_PERMITIR_SALDO_NEGATIVO'
  ).default('false'),

  /* ---- Precision y redondeo (D09, D02 anexos, DEC-05/DEC-20) ---- */

  /**
   * Modo de redondeo. D09 propone centavos y aritmetica exacta y advierte que
   * NINGUNA fuente fija el modo: el valor propuesto es `half-up` resuelto por
   * PostgreSQL. PROPUESTA PENDIENTE DE RATIFICACION.
   */
  modoRedondeo: z.string().regex(TOKEN_SNAKE, {
    message: "MOTOR_MODO_REDONDEO: se esperaba un token como 'half_up_por_postgresql'",
  }).default('half_up_por_postgresql'),

  /**
   * Momento del redondeo: en base de datos (PostgreSQL NUMERIC), NUNCA en
   * JavaScript. Fuente: D02/D09 exigen evitar el error de redondeo flotante y
   * DEC-20 descarta "redondeo en JavaScript". Modificarlo contradice la
   * exactitud exigida: requiere ratificacion explicita. PROPUESTA PENDIENTE.
   */
  momentoRedondeo: z.string().regex(TOKEN_SNAKE, {
    message: "MOTOR_MOMENTO_REDONDEO: se esperaba un token como 'en_base_de_datos'",
  }).default('en_base_de_datos'),

  /**
   * Decimales de precision. D09 propone DECIMAL(10,2)/centavos y DEC-20 fija
   * NUMERIC(12,2) en base de datos con strings exactos en TypeScript.
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  precisionDecimales: esquemaEnteroRango('MOTOR_PRECISION_DECIMALES', 0, 6).default('2'),

  /* ---- Descuentos (D05 CU-01, D07 P0350, DEC-07) ---- */

  /**
   * Momento en que se aplica el descuento autorizado.
   * Fuente: D05 CU-01 (alternativo): el porcentaje autorizado se aplica ANTES
   * de generar el plan y afecta al `monto_cuota` almacenado. La alternativa
   * posterior contradice CU-01. PROPUESTA PENDIENTE DE RATIFICACION.
   */
  politicaDescuento: z
    .enum([
      'antes_de_generar_el_plan',
      'beca_al_generar_plan',
      'descuento_de_obligacion_autorizado_posteriormente',
    ])
    .default('antes_de_generar_el_plan'),

  /**
   * El descuento NO se contabiliza como efectivo recibido.
   * Fuente: D07 P0350 (sumar el descuento al efectivo) NO FUE ADOPTADO
   * (DEC-07/DEC-20); D07 exige separar efectivo recibido de importe exonerado.
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  descuentoComoEfectivo: esquemaBooleano('MOTOR_DESCUENTO_COMO_EFECTIVO').default(
    'false'
  ),

  /**
   * Porcentaje de descuento por defecto: 'ninguno'. El porcentaje debe venir
   * explicito y autorizado en la peticion (D05 CU-01); los porcentajes 15/10/
   * 50/25% de D07 son ejemplos didacticos NO adoptados. Un decimal explicito
   * solo tiene sentido si una ratificacion lo autoriza.
   * PROPUESTA PENDIENTE DE RATIFICACION.
   */
  porcentajeDescuentoPorDefecto: z
    .union([z.literal('ninguno'), esquemaDecimalExacto('MOTOR_PORCENTAJE_DESCUENTO_POR_DEFECTO')])
    .default('ninguno'),

  /* ---- Moneda (D02 anexo B, D09, DEC-05/DEC-20) ---- */

  /**
   * Fuente de la moneda operativa: la ya almacenada en `planes_pago.moneda`.
   * Fuente: DEC-20 (una moneda operativa por plan, sin conversion y sin
   * default; las filas legacy quedan null). PROPUESTA PENDIENTE DE RATIFICACION.
   */
  fuenteMoneda: z
    .string()
    .regex(/^[a-z][a-z0-9_.]*$/, {
      message: "MOTOR_FUENTE_MONEDA: se esperaba un token como 'planes_pago.moneda'",
    })
    .default('planes_pago.moneda'),

  /**
   * Sin conversion entre monedas: no existe regla institucional de conversion
   * (DEC-05/DEC-20). PROPUESTA PENDIENTE DE RATIFICACION.
   */
  conversionMoneda: esquemaBooleano('MOTOR_CONVERSION_MONEDA').default('false'),

  /**
   * Moneda por defecto: 'ninguna'. No se inventa moneda cuando el plan no la
   * tiene almacenada (las filas legacy quedan null). PROPUESTA PENDIENTE DE
   * RATIFICACION.
   */
  monedaPorDefecto: z
    .union([z.literal('ninguna'), z.string().regex(/^[A-Za-z]{3}$/, {
      message: "MOTOR_MONEDA_POR_DEFECTO: se esperaba 'ninguna' o un codigo de 3 letras",
    })])
    .default('ninguna'),

  /* ---- Cancelacion de cuotas (DEC-20) ---- */

  /**
   * Estado almacenado de una cuota con `saldo_pendiente = 0`.
   * Fuente: DEC-20 (cancelacion): pasa a 'PAGADA'. El dominio de estados de
   * `mensualidades` es VARCHAR(20) con DEFAULT 'PENDIENTE'
   * (database/migrations/001_create_base_tables.sql). PROPUESTA PENDIENTE DE
   * RATIFICACION.
   */
  estadoCuotaSaldada: z
    .string()
    .regex(TOKEN_ESTADO, {
      message: "MOTOR_ESTADO_CUOTA_SALDADA: se esperaba un token en mayusculas como 'PAGADA'",
    })
    .refine((valor) => valor.length <= 20, {
      message: 'MOTOR_ESTADO_CUOTA_SALDADA: excede los 20 caracteres de la columna estado',
    })
    .default('PAGADA'),

  /**
   * La mora ya aplicada se CONSERVA al saldar la cuota; no se borra.
   * Fuente: DEC-20 (cancelacion). PROPUESTA PENDIENTE DE RATIFICACION.
   */
  conservarMoraAlSaldar: esquemaBooleano('MOTOR_CONSERVAR_MORA_AL_SALDAR').default(
    'true'
  ),
});

/**
 * Comprobaciones transversales del esquema: combinaciones que las fuentes
 * declararian contradictorias. Se rechazan en la resolucion (no en silencio).
 */
const esquemaRaiz = esquemaPoliticas.superRefine((politicas, ctx) => {
  // D05 P0227: "una sola vez sobre el monto base" implica no capitalizable.
  if (politicas.moraUnicaSobreMontoBase && politicas.moraCapitalizable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'MOTOR_MORA_CAPITALIZABLE: mora unica sobre el monto base (D05 P0227) no puede combinarse con mora capitalizable',
    });
  }
  // D05 CU-02 / DEC-20: "sin generar saldo negativo en ninguna cuota".
  if (politicas.permitirSaldoNegativoEnCuota && politicas.modoAbonoParcial === 'secuencial_con_remanente') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'MOTOR_PERMITIR_SALDO_NEGATIVO: el modo secuencial con remanente (D05 CU-02) no admite saldo negativo por cuota',
    });
  }
});

/** Politicas financieras resueltas y tipadas. */
export type MotorFinancieroPoliticas = z.infer<typeof esquemaRaiz>;

/* ==========================================================================
 * 6. Tabla campo -> claves de entorno (cobertura verificada)
 * ======================================================================== */

/**
 * Relacion explicita entre cada parametro del objeto resuelto y las variables
 * de entorno que lo pueden sustituir. Se verifica en cada resolucion que esta
 * tabla cubre EXACTAMENTE los campos del esquema: asi ningun parametro puede
 * quedar sin override externo ni ninguna clave huerfana sin efecto.
 */
const CAMPOS: readonly {
  readonly campo: keyof MotorFinancieroPoliticas;
  readonly claves: readonly string[];
}[] = [
  { campo: 'diaVencimiento', claves: ['MOTOR_DIA_VENCIMIENTO', 'MOTOR_DIA_CORTE'] },
  { campo: 'diaInicioMora', claves: ['MOTOR_DIA_INICIO_MORA'] },
  { campo: 'porcentajeMora', claves: ['MOTOR_PORCENTAJE_MORA'] },
  { campo: 'moraUnicaSobreMontoBase', claves: ['MOTOR_MORA_UNICA_SOBRE_MONTO_BASE'] },
  { campo: 'moraCapitalizable', claves: ['MOTOR_MORA_CAPITALIZABLE'] },
  { campo: 'ordenFifo', claves: ['MOTOR_ORDEN_FIFO'] },
  { campo: 'desempate', claves: ['MOTOR_DESEMPATE_FIFO'] },
  { campo: 'ambitoFifo', claves: ['MOTOR_AMBITO_FIFO'] },
  { campo: 'tratamientoExcedente', claves: ['MOTOR_TRATAMIENTO_EXCEDENTE'] },
  { campo: 'modoAbonoParcial', claves: ['MOTOR_MODO_ABONO_PARCIAL'] },
  { campo: 'permitirSaldoNegativoEnCuota', claves: ['MOTOR_PERMITIR_SALDO_NEGATIVO'] },
  { campo: 'modoRedondeo', claves: ['MOTOR_MODO_REDONDEO'] },
  { campo: 'momentoRedondeo', claves: ['MOTOR_MOMENTO_REDONDEO'] },
  { campo: 'precisionDecimales', claves: ['MOTOR_PRECISION_DECIMALES'] },
  { campo: 'politicaDescuento', claves: ['MOTOR_POLITICA_DESCUENTO'] },
  { campo: 'descuentoComoEfectivo', claves: ['MOTOR_DESCUENTO_COMO_EFECTIVO'] },
  { campo: 'porcentajeDescuentoPorDefecto', claves: ['MOTOR_PORCENTAJE_DESCUENTO_POR_DEFECTO'] },
  { campo: 'fuenteMoneda', claves: ['MOTOR_FUENTE_MONEDA'] },
  { campo: 'conversionMoneda', claves: ['MOTOR_CONVERSION_MONEDA'] },
  { campo: 'monedaPorDefecto', claves: ['MOTOR_MONEDA_POR_DEFECTO'] },
  { campo: 'estadoCuotaSaldada', claves: ['MOTOR_ESTADO_CUOTA_SALDADA'] },
  { campo: 'conservarMoraAlSaldar', claves: ['MOTOR_CONSERVAR_MORA_AL_SALDAR'] },
];

/** Claves de entorno del motor, una por parametro (alias incluido aparte). */
export const CLAVES_ENTORNO_POLITICAS_FINANCIERAS: readonly string[] = CAMPOS.map(
  (campo) => campo.claves[0] as string
);

/* ==========================================================================
 * 7. Valores propuestos en DEC-20 (para fijar en entorno sin tocar codigo)
 * ======================================================================== */

/**
 * Los valores PROPUESTOS por DEC-20 escritos como variables de entorno listas
 * para copiar. Sirven de documentacion ejecutable: la resolucion comprueba que
 * estos textos producen EXACTAMENTE los valores por defecto del esquema. Si
 * alguien cambia un default y olvida esta tabla (o viceversa), el modulo falla
 * ruidoso en lugar de servir una politica distinta de la documentada.
 */
export const VALORES_PROPUESTA_EN_ENTORNO: Readonly<Record<string, string>> = {
  MOTOR_DIA_VENCIMIENTO: '10',
  MOTOR_DIA_INICIO_MORA: '11',
  MOTOR_PORCENTAJE_MORA: '10',
  MOTOR_MORA_UNICA_SOBRE_MONTO_BASE: 'true',
  MOTOR_MORA_CAPITALIZABLE: 'false',
  MOTOR_ORDEN_FIFO: 'fecha_vencimiento_asc',
  MOTOR_DESEMPATE_FIFO: 'numero_cuota_asc,id_asc',
  MOTOR_AMBITO_FIFO: 'plan_de_la_matricula',
  MOTOR_TRATAMIENTO_EXCEDENTE: 'rechazar',
  MOTOR_MODO_ABONO_PARCIAL: 'secuencial_con_remanente',
  MOTOR_PERMITIR_SALDO_NEGATIVO: 'false',
  MOTOR_MODO_REDONDEO: 'half_up_por_postgresql',
  MOTOR_MOMENTO_REDONDEO: 'en_base_de_datos',
  MOTOR_PRECISION_DECIMALES: '2',
  MOTOR_POLITICA_DESCUENTO: 'antes_de_generar_el_plan',
  MOTOR_DESCUENTO_COMO_EFECTIVO: 'false',
  MOTOR_PORCENTAJE_DESCUENTO_POR_DEFECTO: 'ninguno',
  MOTOR_FUENTE_MONEDA: 'planes_pago.moneda',
  MOTOR_CONVERSION_MONEDA: 'false',
  MOTOR_MONEDA_POR_DEFECTO: 'ninguna',
  MOTOR_ESTADO_CUOTA_SALDADA: 'PAGADA',
  MOTOR_CONSERVAR_MORA_AL_SALDAR: 'true',
};

/* ==========================================================================
 * 8. Resolucion: ausente -> default DEC-20; invalido -> fallo ruidoso
 * ======================================================================== */

/**
 * Lee el primer valor definido entre las claves dadas. Una cadena vacia o de
 * solo espacios se trata como NO FIJADA (comportamiento habitual de .env) y
 * devuelve el valor propuesto por defecto; queda registrado aqui para que no
 * sea una decision silenciosa.
 */
function leerValorDeEntorno(
  entorno: NodeJS.ProcessEnv,
  claves: readonly string[]
): string | undefined {
  for (const clave of claves) {
    const valor = entorno[clave];
    if (valor === undefined) {
      continue;
    }
    const limpio = valor.trim();
    if (limpio === '') {
      continue;
    }
    return limpio;
  }
  return undefined;
}

/** Convierte los issues de Zod en un mensaje unico y accionable. */
function formatearErrorDeValidacion(error: z.ZodError): string {
  const detalle = error.issues
    .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join(' | ');
  return (
    'Politicas financieras del motor: variable de entorno invalida. ' +
    'No se aplica ningun valor alterno en silencio: corrija la variable o ' +
    'eliminela para usar el valor propuesto en DEC-20 (propuesta tecnica ' +
    'pendiente de ratificacion institucional). Detalle: ' +
    detalle
  );
}

/**
 * Resuelve las politicas financieras desde un entorno dado.
 *
 * - Sin argumentos usa `process.env` (unica lectura permitida).
 * - Parametro ausente -> valor propuesto por DEC-20.
 * - Parametro presente e invalido -> ErrorPoliticaFinancieraInvalida.
 * - Funcion pura: no lee la base de datos ni realiza otra I/O.
 */
export function resolverPoliticasFinancieras(
  entorno: NodeJS.ProcessEnv = process.env
): MotorFinancieroPoliticas {
  verificarCoberturaDeCampos();

  const crudo: Record<string, string | undefined> = {};
  for (const { campo, claves } of CAMPOS) {
    crudo[campo] = leerValorDeEntorno(entorno, claves);
  }

  const resultado = esquemaRaiz.safeParse(crudo);
  if (!resultado.success) {
    throw new ErrorPoliticaFinancieraInvalida(formatearErrorDeValidacion(resultado.error));
  }
  return resultado.data;
}

/* ==========================================================================
 * 9. Comprobaciones internas puras (sin I/O, sin entorno)
 * ======================================================================== */

/**
 * La tabla CAMPOS debe cubrir exactamente los campos del esquema: ni un
 * parametro sin variable de entorno, ni una clave sin destino.
 */
function verificarCoberturaDeCampos(): void {
  const esperados = new Set(Object.keys(esquemaPoliticas.shape));
  const cubiertos = new Set<string>();
  for (const { campo, claves } of CAMPOS) {
    if (!esperados.has(campo)) {
      throw new ErrorPoliticaFinancieraInvalida(
        `Modulo politicas-financieras incoherente: clave desconocida en la tabla CAMPOS: ${campo}`
      );
    }
    if (cubiertos.has(campo)) {
      throw new ErrorPoliticaFinancieraInvalida(
        `Modulo politicas-financieras incoherente: campo duplicado en la tabla CAMPOS: ${campo}`
      );
    }
    cubiertos.add(campo);
    if (claves.length === 0 || claves.some((clave) => clave.trim() === '')) {
      throw new ErrorPoliticaFinancieraInvalida(
        `Modulo politicas-financieras incoherente: ${campo} sin clave de entorno valida`
      );
    }
  }
  for (const esperado of esperados) {
    if (!cubiertos.has(esperado)) {
      throw new ErrorPoliticaFinancieraInvalida(
        `Modulo politicas-financieras incoherente: ${esperado} no tiene variable de entorno que lo sustituya`
      );
    }
  }
}

/**
 * Los valores propuestos en DEC-20 (VALORES_PROPUESTA_EN_ENTORNO) deben
 * resolver EXACTAMENTE a los valores por defecto del esquema. Si divergen, el
 * modulo falla: la documentacion y el codigo no pueden seguir caminos
 * distintos sin que se note.
 */
function verificarCoherenciaConValoresPropuestos(): void {
  const conPropuesta = resolverPoliticasFinancieras(VALORES_PROPUESTA_EN_ENTORNO);
  const porDefecto = resolverPoliticasFinancieras({});
  const conPropuestaPlano = conPropuesta as unknown as Record<string, unknown>;
  const porDefectoPlano = porDefecto as unknown as Record<string, unknown>;
  for (const { campo } of CAMPOS) {
    const propuesto = conPropuestaPlano[campo];
    const porDefectoValor = porDefectoPlano[campo];
    if (propuesto !== porDefectoValor) {
      throw new ErrorPoliticaFinancieraInvalida(
        `Modulo politicas-financieras incoherente: el valor propuesto documentado para ${campo} (${String(propuesto)}) no coincide con el valor por defecto del esquema (${String(porDefectoValor)})`
      );
    }
  }
}

/* ==========================================================================
 * 10. Politica resuelta (objeto listo para consumir)
 * ======================================================================== */

// Comprobaciones internas puras: fallan ruidoso si el modulo se edita de forma
// incoherente. No leen process.env ni la base de datos.
verificarCoherenciaConValoresPropuestos();

/**
 * POLITICA RESUELTA del motor financiero. Unico punto de lectura de parametros:
 * ningun consumidor puede incrustar un numero.
 *
 * Valores = propuesta tecnica DEC-20 PENDIENTE DE RATIFICACION INSTITUCIONAL
 * (delegacion del solicitante 2026-11-10). No son politica institucional.
 *
 * Resolucion al importar: lectura pura de `process.env` (sin I/O adicional, sin
 * base de datos, sin mutacion de estado), igual que backend/src/config/env.ts.
 * Para pruebas o entornos alternativos use `resolverPoliticasFinancieras(env)`.
 */
export const politicasFinancieras: MotorFinancieroPoliticas =
  resolverPoliticasFinancieras(process.env);

/* ==========================================================================
 * 11. Avisos de coherencia (advertencias, no bloqueo)
 * ======================================================================== */

/**
 * Avisos sobre combinaciones que se apartan de la propuesta DEC-20 sin estar
 * prohibidas por el esquema. No lanzan ni imprimen nada (el modulo no hace
 * I/O): devuelven textos para que el llamador decida que hacer con ellos.
 * Un aviso no invalida la configuracion, solo documenta que requiere
 * ratificacion institucional explicita.
 */
export function comprobarAvisosDeCoherencia(
  politicas: MotorFinancieroPoliticas
): readonly string[] {
  const avisos: string[] = [];

  if (politicas.diaInicioMora !== politicas.diaVencimiento + 1) {
    avisos.push(
      `La mora no empieza el dia siguiente al vencimiento (vencimiento ${politicas.diaVencimiento}, mora desde ${politicas.diaInicioMora}): DEC-20 propone mora desde el dia siguiente; otro valor exige ratificacion explicita`
    );
  }
  if (politicas.descuentoComoEfectivo) {
    avisos.push(
      'El descuento se contabiliza como efectivo recibido: D07 P0350 no fue adoptado (DEC-07/DEC-20); requiere ratificacion'
    );
  }
  if (politicas.momentoRedondeo !== 'en_base_de_datos') {
    avisos.push(
      'El redondeo no se realiza en la base de datos: D02/D09 exigen aritmetica exacta en PostgreSQL y prohiben redondear en JavaScript; requiere ratificacion'
    );
  }
  if (politicas.conversionMoneda) {
    avisos.push(
      'Conversion de moneda habilitada: no existe regla institucional de conversion (DEC-05/DEC-20)'
    );
  }
  if (politicas.ambitoFifo !== 'plan_de_la_matricula') {
    avisos.push(
      `Ambito FIFO '${politicas.ambitoFifo}': cruzar anios academicos no tiene regla aprobada (D07 P0128 / DEC-06)`
    );
  }
  if (politicas.tratamientoExcedente !== 'rechazar') {
    avisos.push(
      `Tratamiento del excedente '${politicas.tratamientoExcedente}': alternativa de DEC-06 no ratificada; implicaria saldo a favor o devolucion sin norma institucional`
    );
  }
  // Aviso permanente: mientras DEC-20 no este ratificado, ningun valor de este
  // modulo es politica institucional.
  avisos.push(
    'Las politicas financieras son propuesta tecnica pendiente de ratificacion institucional (DEC-20); no presentar como aprobadas'
  );

  return avisos;
}
