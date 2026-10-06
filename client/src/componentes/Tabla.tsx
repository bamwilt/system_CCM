import type { ConfiguracionModulo } from '../config/modulos';
import type { Fila } from '../api/tipos';
import type { MetaPaginacion } from '../api/tipos';
import { formatearCelda, formatearNumero, VACIO } from './formato';
import { IconoEditar, IconoBasura, IconoVacio } from './Iconos';

/**
 * Tabla de datos reutilizable.
 *
 * No conoce la API ni el módulo: recibe filas ya cargadas y una configuración
 * de columnas. El ordenamiento y la paginación se informan hacia arriba, que
 * es quien decide cómo pedir los datos.
 */

export type DireccionOrden = 'asc' | 'desc';

interface PropsTabla {
  mod: ConfiguracionModulo;
  filas: Fila[];
  meta: MetaPaginacion;
  cargando: boolean;
  /** Columna por la que se ordena, clave de la configuración de la API. */
  ordenPor: string;
  direccion: DireccionOrden;
  /** Recibe la clave que espera la API, no la clave de la columna. */
  alOrdenar: (claveApi: string) => void;
  alPaginar: (pagina: number) => void;
  alEditar?: (fila: Fila) => void;
  alBorrar?: (fila: Fila) => void;
  /** Texto de búsqueda aplicado, para mostrar "sin resultados". */
  busqueda?: string;
}

export function Tabla({
  mod,
  filas,
  meta,
  cargando,
  ordenPor,
  direccion,
  alOrdenar,
  alPaginar,
  alEditar,
  alBorrar,
  busqueda = '',
}: PropsTabla) {
  // Columnas visibles: todo menos lo marcado `soloFormulario`.
  const columnas = mod.columnas.filter((c) => !c.soloFormulario);
  const conAcciones = Boolean(alEditar || alBorrar);

  const desde = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const hasta = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <>
      <div className="ccm-tabla-envoltura">
        <table className="ccm-tabla">
          <thead>
            <tr>
              {columnas.map((columna) => {
                // Solo las columnas con `ordenApi` son ordenables: el resto
                // (cálculos, nombres derivados) no existen en la lista blanca
                // del servidor y devolverían un 400 si se solicitaran.
                const claveOrden = columna.ordenApi;
                const activa = Boolean(claveOrden) && ordenPor === claveOrden;
                const numerico = columna.tipo === 'numero' || columna.tipo === 'decimal';
                return (
                  <th
                    key={columna.clave}
                    scope="col"
                    className={[claveOrden ? 'ccm-ordenable' : '', numerico ? 'ccm-numerico' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={claveOrden ? () => alOrdenar(claveOrden) : undefined}
                    aria-sort={activa ? (direccion === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="ccm-th-contenido">
                      {columna.etiqueta}
                      {activa && (
                        <span className="ccm-flecha" aria-hidden="true">
                          {direccion === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
              {conAcciones && (
                <th scope="col" style={{ width: 92 }}>
                  <span className="ccm-sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {filas.map((fila) => (
              <tr key={String(fila[mod.pk])}>
                {columnas.map((columna) => {
                  const valor = fila[columna.clave];
                  const numerico = columna.tipo === 'numero' || columna.tipo === 'decimal';

                  // El booleano va como insignia: un "Sí/No" pelado se confunde
                  // con datos de otra columna.
                  if (columna.tipo === 'booleano') {
                    return (
                      <td key={columna.clave}>
                        {valor === true || valor === false ? (
                          <span
                            className={`ccm-insignia ${valor ? 'ccm-insignia-exito' : 'ccm-insignia-neutra'}`}
                          >
                            {valor ? 'Sí' : 'No'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ccm-espacial-500)' }}>{VACIO}</span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={columna.clave} className={numerico ? 'ccm-numerico' : undefined}>
                      {formatearCelda(valor, columna)}
                    </td>
                  );
                })}

                {conAcciones && (
                  <td>
                    <div className="ccm-acciones">
                      {alEditar && (
                        <button
                          type="button"
                          className="ccm-btn-icono"
                          onClick={() => alEditar(fila)}
                          aria-label={`Editar ${mod.singular}`}
                          title="Editar"
                        >
                          <IconoEditar tam={16} />
                        </button>
                      )}
                      {alBorrar && (
                        <button
                          type="button"
                          className="ccm-btn-icono ccm-peligro"
                          onClick={() => alBorrar(fila)}
                          aria-label={`Eliminar ${mod.singular}`}
                          title="Eliminar"
                        >
                          <IconoBasura tam={16} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {cargando && (
          <div className="ccm-estado">
            <div className="ccm-cargador" role="status" aria-label="Cargando" />
          </div>
        )}

        {!cargando && filas.length === 0 && (
          <div className="ccm-estado">
            <span className="ccm-estado-icono">
              <IconoVacio tam={38} />
            </span>
            <p className="ccm-estado-titulo">
              {busqueda.trim() ? 'Sin resultados' : `No hay ${mod.titulo.toLowerCase()} todavía`}
            </p>
            <p className="ccm-estado-texto">
              {busqueda.trim()
                ? `Ningún registro coincide con «${busqueda.trim()}». Probá con otro término o limpiá los filtros.`
                : `Cuando crees el primer ${mod.singular} va a aparecer acá.`}
            </p>
          </div>
        )}
      </div>

      <div className="ccm-paginacion">
        <p className="ccm-paginacion-info">
          {meta.total === 0 ? (
            'Sin registros'
          ) : (
            <>
              Mostrando <strong>{formatearNumero(desde)}</strong>–
              <strong>{formatearNumero(hasta)}</strong> de{' '}
              <strong>{formatearNumero(meta.total)}</strong>
            </>
          )}
        </p>

        <Paginacion meta={meta} alPaginar={alPaginar} />
      </div>
    </>
  );
}

/**
 * Paginación con ventana de páginas.
 *
 * Con muchos registros (o una búsqueda amplia) mostrar un botón por página
 * genera una barra ilegible, así que se muestra un rango alrededor de la
 * página actual más la primera y la última.
 */
function Paginacion({ meta, alPaginar }: { meta: MetaPaginacion; alPaginar: (p: number) => void }) {
  const { page, totalPages } = meta;
  if (totalPages <= 1) return null;

  const paginas: (number | '…')[] = [];
  const DESDE = 1;
  const HASTA = 2;

  for (let i = 1; i <= totalPages; i++) {
    const cerca = Math.abs(i - page) <= HASTA;
    if (i === DESDE || i === totalPages || cerca) {
      paginas.push(i);
    } else if (paginas[paginas.length - 1] !== '…') {
      paginas.push('…');
    }
  }

  return (
    <nav className="ccm-paginacion-controles" aria-label="Paginación">
      <button
        type="button"
        className="ccm-pagina"
        onClick={() => alPaginar(page - 1)}
        disabled={page <= 1}
      >
        ‹
      </button>

      {paginas.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="ccm-paginacion-info" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`ccm-pagina ${p === page ? 'ccm-activa' : ''}`}
            onClick={() => alPaginar(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Página ${p}`}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        className="ccm-pagina"
        onClick={() => alPaginar(page + 1)}
        disabled={page >= totalPages}
      >
        ›
      </button>
    </nav>
  );
}
