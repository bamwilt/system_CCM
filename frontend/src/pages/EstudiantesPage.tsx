import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Boton, Cabecera, Campo, Filtros, Mensaje, Paginacion, Tabla } from '../components/Comunes';
import { listar, mensajeDeError } from '../services/api';

/**
 * ESTUDIANTES (FASE 9) — listado con busqueda, filtros y paginacion.
 *
 * Patron que reutilizan el resto de los listados: filtros arriba, tabla con
 * estado vacio explicito, paginacion, y mensajes de error accesibles.
 */

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  email: string | null;
  activo: boolean;
}

export default function EstudiantesPage() {
  const { puede } = useSesion();
  const [filas, setFilas] = useState<Estudiante[]>([]);
  const [total, setTotal] = useState(0);
  const [documento, setDocumento] = useState('');
  const [activo, setActivo] = useState<'todos' | 'true' | 'false'>('todos');
  const [limite, setLimite] = useState('25');
  const [compensar, setCompensar] = useState('0');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!puede('estudiantes:read')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para consultar estudiantes.</Mensaje>;
  }

  async function buscar() {
    setCargando(true);
    setError(null);
    try {
      const parametros: Record<string, unknown> = { limite, compensar };
      if (documento.trim() !== '') {
        parametros.documento_identidad = documento.trim();
      }
      if (activo !== 'todos') {
        parametros.activo = activo;
      }
      const r = await listar<Estudiante>('/estudiantes', parametros);
      setFilas(r.filas);
      setTotal(r.total);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void buscar();
    // La busqueda inicial no depende de los filtros: se ejecuta al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="listado">
      <Cabecera titulo="Estudiantes" descripcion="Busque por documento o filtre por estado." />

      <Filtros onLimpiar={() => { setDocumento(''); setActivo('todos'); setLimite('25'); setCompensar('0'); }}>
        <Campo etiqueta="Documento" identificador="documento">
          <input
            id="documento"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Estado" identificador="activo">
          <select
            id="activo"
            value={activo}
            onChange={(e) => setActivo(e.target.value as 'todos' | 'true' | 'false')}
          >
            <option value="todos">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </Campo>
        <Boton icono="search" onClick={() => void buscar()}>Buscar</Boton>
      </Filtros>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}
      {cargando ? <p role="status">Buscando...</p> : null}


      <Tabla<Estudiante>
        filas={filas}
        clave={(f) => f.id}
        columnas={[
          { encabezado: 'Documento', celda: (f) => f.documento_identidad },
          { encabezado: 'Nombre', celda: (f) => `${f.nombres} ${f.apellidos}` },
          { encabezado: 'Correo', celda: (f) => f.email ?? '—' },
          { encabezado: 'Estado', celda: (f) => (f.activo ? 'Activo' : 'Inactivo') },
        ]}
        vacio={{ titulo: 'No se encontraron estudiantes con esos filtros.' }}
      />

      <div className="listado__pie">
        <span>Total: {total}</span>
        <Paginacion
          compensar={Number(compensar)}
          limite={Number(limite)}
          total={total}
          onCambiar={(nuevo) => {
            setCompensar(String(nuevo));
            void buscar();
          }}
        />
      </div>
    </div>
  );
}
