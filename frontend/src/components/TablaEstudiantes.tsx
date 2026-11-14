import { useEffect, useMemo, useState } from 'react';
import { iniciales } from '../utils/formato';
import { Boton, Cargando, Etiqueta, Mensaje } from './Comunes';
import { listar, mensajeDeError } from '../services/api';
import api from '../services/api';

/**
 * ============================================================================
 * TABLA PARA ELEGIR A QUIEN MATRICULAR (FASE 9.B)
 * ============================================================================
 *
 * Mismo patron que TablaDeudores (la pantalla de Registrar cobro): tres filtros
 * arriba —nombre, documento y grado— que se aplican MIENTRAS se escribe, y una
 * tabla ordenable con un boton "Elegir" por fila que autocompleta la persona.
 *
 * El grado y "ya tiene matricula" llegan del backend (`GET /estudiantes`), que
 * resuelve el grado de la matricula mas reciente del estudiante. Aqui no se
 * suma ni se recalcula nada.
 */

export interface EstudianteElegible {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  email?: string | null;
  telefono?: string | null;
  activo?: boolean;
  grado?: string | null;
  /** Año de su matrícula más reciente; null si nunca se ha matriculado. */
  ultimo_anio?: number | null;
  /** Años en los que ya tiene matrícula (puede ser más de uno). */
  anios_matriculados?: number[];
  tiene_matricula?: boolean;
}

type Columna = 'nombre' | 'documento_identidad' | 'grado' | 'tiene_matricula';

const COLUMNAS: Array<{ id: Columna; titulo: string }> = [
  { id: 'nombre', titulo: 'Estudiante' },
  { id: 'documento_identidad', titulo: 'Documento' },
  { id: 'grado', titulo: 'Grado' },
  { id: 'tiene_matricula', titulo: 'Matrícula' },
];

export default function TablaEstudiantes({
  onElegir,
  seleccionadoId,
  anioActivo,
}: {
  onElegir: (estudiante: EstudianteElegible) => void;
  seleccionadoId: number | null;
  /**
   * Año lectivo seleccionado en el formulario de abajo. Si el estudiante ya
   * cursa ESE año (su matrícula más reciente es de ese año), no tiene sentido
   * ofrecerle "Elegir": no se le puede volver a matricular en el mismo año.
   * Si su matrícula es de OTRO año, sí se le puede matricular de nuevo.
   */
  anioActivo: number | null;
}) {
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [grado, setGrado] = useState('');
  const [soloSinMatricula, setSoloSinMatricula] = useState(false);
  const [filas, setFilas] = useState<EstudianteElegible[]>([]);
  const [grados, setGrados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: 'nombre', asc: true });

  // Catalogo de grados para el selector (una sola vez).
  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get<{ grados: Array<{ id: number; nombre: string }> }>('/estudiantes/grados');
        const nombres = (r.data.grados ?? []).map((g) => g.nombre);
        setGrados(Array.from(new Set(nombres)).sort((a, b) => a.localeCompare(b, 'es')));
      } catch {
        setGrados([]);
      }
    })();
  }, []);

  // La consulta se dispara sola al escribir o al cambiar un filtro.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      void (async () => {
        setCargando(true);
        setError(null);
        try {
          const params = new URLSearchParams({ limite: '100' });
          if (nombre.trim().length >= 2) {
            params.set('nombre', nombre.trim());
          }
          if (documento.trim().length >= 2) {
            params.set('documento', documento.trim());
          }
          if (grado !== '') {
            params.set('grado', grado);
          }
          if (soloSinMatricula) {
            params.set('sin_matricula', 'true');
          }
          const r = await listar<EstudianteElegible>(`/estudiantes?${params.toString()}`);
          setFilas(r.filas ?? []);
        } catch (e) {
          setError(mensajeDeError(e));
        } finally {
          setCargando(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(espera);
  }, [nombre, documento, grado, soloSinMatricula]);

  const visibles = useMemo(() => {
    const copia = [...filas];
    const dir = orden.asc ? 1 : -1;
    // "nombre" no es un campo: el estudiante tiene nombres y apellidos.
    const valorDe = (e: EstudianteElegible, col: Columna): string =>
      col === 'nombre' ? `${e.nombres} ${e.apellidos}` : String(e[col] ?? '');
    copia.sort((a, b) => {
      if (orden.col === 'tiene_matricula') {
        return (Number(a.tiene_matricula ?? false) - Number(b.tiene_matricula ?? false)) * dir;
      }
      return valorDe(a, orden.col).localeCompare(valorDe(b, orden.col), 'es') * dir;
    });
    return copia;
  }, [filas, orden]);

  function cambiarOrden(col: Columna) {
    setOrden((actual) => ({ col, asc: actual.col === col ? !actual.asc : true }));
  }

  const sinMatricula = filas.filter((f) => !f.tiene_matricula).length;

  return (
    <section className="tarjeta panel">
      <div className="contenido__cabecera" style={{ marginBottom: 'var(--esp-3)' }}>
        <div>
          <h2 className="panel__titulo">
            <span className="icono">groups</span>
            1. Elija al estudiante
          </h2>
          <p className="contenido__desc" style={{ fontSize: 'var(--texto-sm)' }}>
            Filtre por nombre, documento o grado. Un clic en "Elegir" completa los datos.
          </p>
        </div>
        <span className="etiqueta etiqueta--info">
          {filas.length} estudiante(s) · {sinMatricula} sin matrícula
        </span>
      </div>

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}

      <div className="filtros" style={{ marginBottom: 'var(--esp-3)' }}>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label className="campo__etiqueta" htmlFor="filtro-nombre">
            Nombre
          </label>
          <input
            id="filtro-nombre"
            type="search"
            autoComplete="off"
            value={nombre}
            placeholder="Nombre o apellido"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label className="campo__etiqueta" htmlFor="filtro-documento">
            Documento
          </label>
          <input
            id="filtro-documento"
            type="search"
            autoComplete="off"
            value={documento}
            placeholder="Número de documento"
            onChange={(e) => setDocumento(e.target.value)}
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
          <span className="campo__etiqueta">Matrícula</span>
          <button
            type="button"
            className={`boton ${soloSinMatricula ? 'boton--primario' : 'boton--secundario'}`}
            onClick={() => setSoloSinMatricula((v) => !v)}
            aria-pressed={soloSinMatricula}
          >
            {soloSinMatricula ? 'Solo sin matrícula' : 'Ver todas'}
          </button>
        </div>
      </div>

      {cargando ? (
        <Cargando texto="Cargando estudiantes…" />
      ) : visibles.length === 0 ? (
        <div className="panel__vacio">
          <span className="icono">search_off</span>
          <span>
            Ningún estudiante coincide con los filtros. Pruebe con menos letras, otro grado o quite el
            filtro de matrícula.
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
                const elegida = f.id === seleccionadoId;
                // Mismo año lectivo: ya tiene matrícula en ESE año, así que no se
                // le puede volver a matricular (el par estudiante+año es único).
                // Antes se comparaba solo con el año de la última matrícula, y un
                // estudiante con 2026 y 2027 parecía elegible para 2026: el
                // backend lo rechazaba con 409 después de llenar el formulario.
                const anios = f.anios_matriculados ?? [];
                const mismoAnio = anioActivo !== null && anios.includes(anioActivo);
                return (
                  <tr key={f.id} className={elegida ? 'tabla__fila--elegida' : undefined}>
                    <td className="tabla__col-estudiante">
                      <span className="tabla__persona">
                        <span className="buscador__avatar" aria-hidden="true">
                          {iniciales(`${f.nombres} ${f.apellidos}`)}
                        </span>
                        <span>
                          <span className="buscador__nombre">
                            {f.nombres} {f.apellidos}
                          </span>
                          <span className="buscador__meta">estudiante #{f.id}</span>
                        </span>
                      </span>
                    </td>
                    <td>{f.documento_identidad}</td>
                    <td>{f.grado ?? '—'}</td>
                    <td>
                      {mismoAnio ? (
                        <Etiqueta tipo="aviso" icono="warning">
                          Cursa {anioActivo}
                        </Etiqueta>
                      ) : anios.length > 0 ? (
                        <Etiqueta tipo="info" icono="badge">
                          Matriculado en {anios.join(', ')}
                        </Etiqueta>
                      ) : (
                        <Etiqueta tipo="exito" icono="add_circle">
                          Sin matrícula
                        </Etiqueta>
                      )}
                    </td>
                    <td className="tabla__acciones">
                      {mismoAnio ? (
                        <Etiqueta tipo="aviso" icono="warning">
                          Ya cursa este año
                        </Etiqueta>
                      ) : (
                        <Boton
                          tipo={elegida ? 'secundario' : 'primario'}
                          icono={elegida ? 'check_circle' : 'arrow_forward'}
                          onClick={() => onElegir(f)}
                        >
                          {elegida ? 'Elegida' : 'Elegir'}
                        </Boton>
                      )}
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