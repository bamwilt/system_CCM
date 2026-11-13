import { useEffect, useMemo, useState } from 'react';
import { conMoneda, fechaCorta, iniciales } from '../utils/formato';
import { Boton, Cargando, Etiqueta, Mensaje } from './Comunes';
import { listar, mensajeDeError } from '../services/api';

/**
 * ============================================================================
 * TABLA PARA ELEGIR A QUIEN COBRAR (FASE 9.B)
 * ============================================================================
 *
 * La ventanilla no trabaja con numeros de matricula: trabaja con personas y
 * con grados. Esta tabla se filtra MIENTRAS se escribe (texto parcial sobre
 * nombre, apellido, grado o documento) y tiene ademas filtros explicitos de
 * grado y de "solo quienes deben".
 *
 * Cada fila muestra lo que se necesita para no equivocarse de familia:
 * nombre completo, grado, matricula, deuda almacenada, cuotas pendientes y
 * proximo vencimiento. Un clic elige a la persona.
 *
 * Las cifras vienen del backend (`GET /pagos/buscar-deudor`) y son las
 * almacenadas: aqui no se suma ni se recalcula nada.
 */

export interface Deudor {
  matricula_id: number;
  estudiante_id: number;
  nombre: string;
  apellidos: string;
  documento_identidad: string;
  grado: string;
  anio_lectivo: string;
  saldo_total: string;
  cuotas_pendientes: number;
  /** Conceptos pendientes: "Mensualidad", "Uniforme", "Matricula". */
  conceptos?: string;
  proximo_vencimiento: string | null;
  moneda: string | null;
}

type Columna = 'nombre' | 'grado' | 'saldo_total' | 'cuotas_pendientes' | 'proximo_vencimiento';

const COLUMNAS: Array<{ id: Columna; titulo: string; numerico?: boolean }> = [
  { id: 'nombre', titulo: 'Estudiante' },
  { id: 'grado', titulo: 'Grado' },
  { id: 'proximo_vencimiento', titulo: 'Próximo vence' },
  { id: 'saldo_total', titulo: 'Deuda', numerico: true },
];

export default function TablaDeudores({
  onElegir,
  seleccionadoId,
}: {
  onElegir: (deudor: Deudor) => void;
  seleccionadoId: number | null;
}) {
  const [texto, setTexto] = useState('');
  const [grado, setGrado] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [filas, setFilas] = useState<Deudor[]>([]);
  const [grados, setGrados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: 'nombre', asc: true });

  useEffect(() => {
    // La consulta se dispara sola al escribir o al cambiar un filtro. El
    // retardo corto evita una peticion por tecla sin dejar de sentirse vivo.
    const espera = window.setTimeout(() => {
      void (async () => {
        setCargando(true);
        setError(null);
        try {
          const params = new URLSearchParams({ limite: '50' });
          if (texto.trim().length >= 2) {
            params.set('q', texto.trim());
          }
          if (grado !== '') {
            params.set('grado', grado);
          }
          if (soloDeuda) {
            params.set('deuda', 'pendiente');
          }
          const r = await listar<Deudor>(`/pagos/buscar-deudor?${params.toString()}`, 'filas');
          setFilas(r.filas);
          setGrados(Array.isArray(r.grados) ? (r.grados as string[]) : []);
        } catch (e) {
          setError(mensajeDeError(e));
        } finally {
          setCargando(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(espera);
  }, [texto, grado, soloDeuda]);

  const visibles = useMemo(() => {
    const copia = [...filas];
    const dir = orden.asc ? 1 : -1;
    copia.sort((a, b) => {
      if (orden.col === 'saldo_total' || orden.col === 'cuotas_pendientes') {
        return (Number(a[orden.col]) - Number(b[orden.col])) * dir;
      }
      return String(a[orden.col] ?? '').localeCompare(String(b[orden.col] ?? ''), 'es') * dir;
    });
    return copia;
  }, [filas, orden]);

  function cambiarOrden(col: Columna) {
    setOrden((actual) => ({ col, asc: actual.col === col ? !actual.asc : true }));
  }

  const conDeuda = filas.filter((f) => Number(f.saldo_total) > 0).length;

  return (
    <section className="tarjeta panel">
      <div className="contenido__cabecera" style={{ marginBottom: 'var(--esp-3)' }}>
        <div>
          <h2 className="panel__titulo">
            <span className="icono">groups</span>
            1. Elija a quien le cobramos
          </h2>
          <p className="contenido__desc" style={{ fontSize: 'var(--texto-sm)' }}>
            Filtre escribiendo: nombre, apellido, grado o documento. No hace falta saber ningún número.
          </p>
        </div>
        <span className="etiqueta etiqueta--info">
          {filas.length} matrícula(s) · {conDeuda} con deuda
        </span>
      </div>

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}

      <div className="filtros" style={{ marginBottom: 'var(--esp-3)' }}>
        <div className="campo" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
          <label className="campo__etiqueta" htmlFor="filtro-texto">
            Buscar
          </label>
          <input
            id="filtro-texto"
            type="search"
            autoComplete="off"
            value={texto}
            placeholder="Nombre, apellido, grado o documento"
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label className="campo__etiqueta" htmlFor="filtro-grado">
            Grado
          </label>
          <select id="filtro-grado" value={grado} onChange={(e) => setGrado(e.target.value)}>
            <option value="">Todos</option>
            {grados.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <span className="campo__etiqueta">Deuda</span>
          <button
            type="button"
            className={`boton ${soloDeuda ? 'boton--primario' : 'boton--secundario'}`}
            onClick={() => setSoloDeuda((v) => !v)}
            aria-pressed={soloDeuda}
          >
            {soloDeuda ? 'Solo con deuda' : 'Ver todas'}
          </button>
        </div>
      </div>

      {cargando ? (
        <Cargando texto="Cargando estudiantes…" />
      ) : visibles.length === 0 ? (
        <div className="panel__vacio">
          <span className="icono">search_off</span>
          <span>
            Ninguna matrícula coincide con los filtros. Pruebe con menos letras, otro grado o quite el filtro
            de deuda.
          </span>
        </div>
      ) : (
        <div className="tabla-envolvente tabla-scroll">
          <table className="tabla tabla--elegible">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={[c.numerico ? 'tabla__numerico' : ''].filter(Boolean).join(' ')}
                    aria-sort={orden.col === c.id ? (orden.asc ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className="tabla__orden" onClick={() => cambiarOrden(c.id)}>
                      {c.titulo}
                      <span className="icono" aria-hidden="true">
                        {orden.col === c.id ? (orden.asc ? 'arrow_upward' : 'arrow_downward') : 'swap_vert'}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="tabla__acciones">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const elegida = f.matricula_id === seleccionadoId;
                return (
                  <tr key={f.matricula_id} className={elegida ? 'tabla__fila--elegida' : undefined}>
                    <td className="tabla__col-estudiante">
                      <span className="tabla__persona">
                        <span className="buscador__avatar" aria-hidden="true">
                          {iniciales(f.nombre)}
                        </span>
                        <span>
                          <span className="buscador__nombre">{f.nombre}</span>
                          <span className="buscador__meta">
                            matrícula #{f.matricula_id} · {f.anio_lectivo}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>{f.grado}</td>
                    <td>{f.proximo_vencimiento ? fechaCorta(f.proximo_vencimiento) : '—'}</td>
                    <td className="tabla__numerico tabla__col-deuda">
                      {Number(f.saldo_total) > 0 ? (
                        <>
                          <strong>{conMoneda(f.saldo_total, f.moneda)}</strong>
                          <span className="tabla__sub">
                            {f.cuotas_pendientes} cuota{f.cuotas_pendientes === 1 ? '' : 's'} por cobrar
                          </span>
                          {/* Que se esta cobrando: mensualidades, matricula o
                              uniforme. Sin esto, dos filas de la misma familia
                              (una por ano) se ven iguales. */}
                          {f.conceptos ? (
                            <span className="tabla__sub tabla__sub--concepto">{f.conceptos}</span>
                          ) : null}
                        </>
                      ) : (
                        <Etiqueta tipo="exito" icono="check_circle">
                          Al día
                        </Etiqueta>
                      )}
                    </td>
                    <td className="tabla__acciones">
                      <Boton
                        tipo={elegida ? 'secundario' : 'primario'}
                        icono={elegida ? 'check_circle' : 'arrow_forward'}
                        onClick={() => onElegir(f)}
                      >
                        {elegida ? 'Elegida' : 'Elegir'}
                      </Boton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
