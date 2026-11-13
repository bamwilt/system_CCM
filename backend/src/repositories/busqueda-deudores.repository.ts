import { Pool } from 'pg';
import { getPool } from '../config/database';

/**
 * ============================================================================
 * BUSQUEDA DE A QUIEN COBRAR (FASE 9.B) — SOLO LECTURA
 * ============================================================================
 *
 * Problema real de la ventanilla: para cobrar habia que saberse el NUMERO de
 * matricula de cada familia. Eso es un identificador de maquina, no una forma
 * de trabajar. Esta busqueda responde a como se habla en un colegio: por
 * nombre, apellido, grado o documento.
 *
 * Disciplinas (las mismas de `obligaciones.repository.ts`):
 *
 * 1. UNA sola consulta parametrizada. El detalle (cuotas pendientes) y el
 *    agregado (saldo) salen de la misma fila y del mismo snapshot.
 * 2. Los importes viajan como `::text` NUMERICO exacto: nunca `number`,
 *    `parseFloat` ni coma flotante. NO se recalcula nada: `saldo_total` es la
 *    suma de `mensualidades.saldo_pendiente` ALMACENADO.
 * 3. La moneda se lee tal cual de `planes_pago.moneda`. No se convierte.
 * 4. La busqueda es insensible a acentos (`translate` sobre ambos lados): si
 *    la familia anota "Maria", encuentra a "María".
 * 5. Solo se listan matriculas ACTIVAS de estudiantes activos. Una matricula
 *    DESACTIVADA no se ofrece para cobrar.
 */

/** Fila proyectada para la tabla de la pantalla de cobro. */
export interface DeudorRow {
  matricula_id: number;
  estudiante_id: number;
  nombre: string;
  apellidos: string;
  documento_identidad: string;
  grado: string;
  anio_lectivo: string;
  saldo_total: string;
  cuotas_pendientes: number;
  /** Tipo de deuda segun la tarifa del plan: "Mensualidad", "Uniforme", "Matricula". */
  conceptos: string;
  proximo_vencimiento: string | null;
  moneda: string | null;
}

/**
 * Quita acentos y pasa a minusculas. Va en el SQL para que la comparacion no
 * dependa de como escribio la persona (con o sin tilde) NI de como se guardo:
 * se normalizan los dos lados de la comparacion.
 */
const SIN_ACENTOS = `translate(lower(%s), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;
/** El termino de busqueda, normalizado IGUAL que las columnas. */
const TERMINO = SIN_ACENTOS.replace('%s', '$1');
/** El termino de busqueda, normalizado igual que las columnas. */

export class BusquedaDeudoresRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(): Pool {
    return this.pool ?? getPool();
  }

  /**
   * Filtros de la tabla de la pantalla de cobro. `q` y `grado` son parciales
   * (se envuelven en %...%); `soloConDeuda` restringe a quienes deben algo.
   * Todos los parametros viajan parametrizados: nunca se interpola texto.
   */
  async buscar(filtros: {
    termino: string | null;
    grado: string | null;
    soloConDeuda: boolean;
    limite: number;
  }): Promise<{ filas: DeudorRow[]; grados: string[] }> {
    const patronTexto = filtros.termino ? `%${filtros.termino}%` : null;
    const patronGrado = filtros.grado ? `%${filtros.grado}%` : null;

    // Los placeholders se numeran SEGUN LOS FILTROS ACTIVOS: si se pasaran
    // parametros que el SQL no referencia, PostgreSQL responde "could not
    // determine data type of parameter $1" (error real medido con la tabla
    // sin filtros). Cada parametro se agrega junto con su condicion.
    const params: unknown[] = [];
    const condiciones: string[] = ["ma.estado = 'ACTIVA'", 'e.activo'];
    if (patronTexto) {
      condiciones.push(`(
        ${SIN_ACENTOS.replace('%s', "e.nombres || ' ' || e.apellidos")} ILIKE ${TERMINO}
        OR ${SIN_ACENTOS.replace('%s', 'e.documento_identidad')} ILIKE ${TERMINO}
        OR ${SIN_ACENTOS.replace('%s', 'e.nombres')} ILIKE ${TERMINO}
        OR ${SIN_ACENTOS.replace('%s', 'e.apellidos')} ILIKE ${TERMINO}
        OR ${SIN_ACENTOS.replace('%s', "COALESCE(g.nombre, '')")} ILIKE ${TERMINO}
      )`);
      params.push(patronTexto);
    }
    if (patronGrado) {
      condiciones.push(
        `${SIN_ACENTOS.replace('%s', "COALESCE(g.nombre, '')")} ILIKE ${TERMINO}`
      );
      params.push(patronGrado);
    }
    // El limite es siempre el ultimo parametro.
    params.push(filtros.limite);
    const limite = `$${params.length}::int`;

    const where = `WHERE ${condiciones.join(' AND ')}`;
    // HAVING, no WHERE: la condicion es sobre el agregado ya calculado.
    const tenencia = filtros.soloConDeuda
      ? `HAVING COALESCE(SUM(m.saldo_pendiente) FILTER (WHERE m.saldo_pendiente > 0), 0) > 0`
      : '';

    const sql = `
      SELECT
        ma.id AS matricula_id,
        e.id AS estudiante_id,
        e.nombres || ' ' || e.apellidos AS nombre,
        e.apellidos,
        e.documento_identidad,
        COALESCE(g.nombre, 'Sin grado') AS grado,
        COALESCE(a.anio::text, 'Sin año') AS anio_lectivo,
        COALESCE(SUM(m.saldo_pendiente) FILTER (WHERE m.saldo_pendiente > 0), 0)::text AS saldo_total,
        COUNT(m.id) FILTER (WHERE m.saldo_pendiente > 0)::int AS cuotas_pendientes,
        -- Tipo de deuda: el concepto de la TARIFA del plan (autoritativo), no el
        -- de cada cuota. "Mensualidad 1", "Mensualidad marzo 2026" y
        -- "Mensualidad 12" son la misma deuda: la ventanilla necesita ver
        -- "Mensualidad", "Uniforme" o "Matricula".
        COALESCE(MAX(tf.concepto), '') AS conceptos,
        to_char(MIN(m.fecha_vencimiento) FILTER (WHERE m.saldo_pendiente > 0), 'YYYY-MM-DD') AS proximo_vencimiento,
        MAX(pl.moneda) AS moneda
      FROM matriculas ma
      JOIN estudiantes e ON e.id = ma.estudiante_id
      LEFT JOIN grados g ON g.id = ma.grado_id
      LEFT JOIN anio_lectivo a ON a.id = ma.anio_lectivo_id
      LEFT JOIN planes_pago pl ON pl.matricula_id = ma.id
      LEFT JOIN tarifas tf ON tf.id = pl.tarifa_id
      LEFT JOIN mensualidades m ON m.plan_pago_id = pl.id
      ${where}
      GROUP BY ma.id, e.id, e.nombres, e.apellidos, e.documento_identidad, g.nombre, a.anio
      ${tenencia}
      ORDER BY e.apellidos, e.nombres, ma.id
      LIMIT ${limite}
    `;

    const [filas, grados] = await Promise.all([
      this.executor().query<DeudorRow>(sql, params),
      // Lista corta para el filtro "Grado": la ventanilla no escribe el grado,
      // lo elige. Es una consulta aparte y pequena, no una segunda vuelta a
      // los mismos datos.
      this.executor().query<{ grado: string }>(
        `SELECT DISTINCT g.nombre AS grado
           FROM grados g
           JOIN matriculas ma ON ma.grado_id = g.id
          WHERE ma.estado = 'ACTIVA'
          ORDER BY g.nombre`
      ),
    ]);

    return { filas: filas.rows, grados: grados.rows.map((r) => r.grado) };
  }
}
