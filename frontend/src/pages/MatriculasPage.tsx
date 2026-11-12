import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Mensaje } from '../components/Comunes';
import { listar, mensajeDeError } from '../services/api';

/** MATRICULAS (FASE 9): listado con filtros por ano, grado y estado. */

interface Matricula {
  id: number;
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  estado: string;
  fecha_matricula: string;
}

export default function MatriculasPage() {
  const { puede } = useSesion();
  const [filas, setFilas] = useState<Matricula[]>([]);
  const [anio, setAnio] = useState('');
  const [estado, setEstado] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!puede('matriculas:read')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para consultar matriculas.</Mensaje>;
  }

  async function buscar() {
    setError(null);
    try {
      const parametros: Record<string, unknown> = {};
      if (anio.trim() !== '') {
        parametros.anio_lectivo_id = Number(anio.trim());
      }
      if (estado.trim() !== '') {
        parametros.estado = estado.trim();
      }
      const r = await listar<Matricula>('/matriculas', parametros);
      setFilas(r.filas);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  useEffect(() => {
    void buscar();
  }, []);

  return (
    <div className="listado">
      <h2>Matriculas</h2>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      <form
        className="filtros"
        onSubmit={(evento) => {
          evento.preventDefault();
          void buscar();
        }}
      >
        <label htmlFor="anio">Anio lectivo</label>
        <input id="anio" value={anio} onChange={(e) => setAnio(e.target.value)} inputMode="numeric" />
        <label htmlFor="estado-mat">Estado</label>
        <input id="estado-mat" value={estado} onChange={(e) => setEstado(e.target.value)} />
        <button type="submit">Buscar</button>
      </form>

      {filas.length === 0 ? (
        <p className="tabla__vacio">No se encontraron matriculas con esos filtros.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Estudiante</th>
              <th scope="col">Anio</th>
              <th scope="col">Grado</th>
              <th scope="col">Estado</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.id}</td>
                <td>{f.estudiante_id}</td>
                <td>{f.anio_lectivo_id}</td>
                <td>{f.grado_id}</td>
                <td>{f.estado}</td>
                <td>{f.fecha_matricula?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
