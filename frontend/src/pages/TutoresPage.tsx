import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Mensaje } from '../components/Comunes';
import { listar, mensajeDeError } from '../services/api';

/** TUTORES (FASE 9): listado con busqueda por documento. */

interface Tutor {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono: string | null;
  email: string | null;
  parentesco: string | null;
  activo: boolean;
}

export default function TutoresPage() {
  const { puede } = useSesion();
  const [filas, setFilas] = useState<Tutor[]>([]);
  const [documento, setDocumento] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!puede('tutores:manage')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para consultar tutores.</Mensaje>;
  }

  async function buscar() {
    setError(null);
    try {
      const parametros: Record<string, unknown> = {};
      if (documento.trim() !== '') {
        parametros.documento_identidad = documento.trim();
      }
      const r = await listar<Tutor>('/tutores', parametros);
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
      <h2>Tutores y responsables</h2>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      <form
        className="filtros"
        onSubmit={(evento) => {
          evento.preventDefault();
          void buscar();
        }}
      >
        <label htmlFor="documento-tutor">Documento</label>
        <input
          id="documento-tutor"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>

      {filas.length === 0 ? (
        <p className="tabla__vacio">No se encontraron tutores con ese filtro.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Nombre</th>
              <th scope="col">Parentesco</th>
              <th scope="col">Telefono</th>
              <th scope="col">Correo</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.documento_identidad}</td>
                <td>{`${f.nombres} ${f.apellidos}`}</td>
                <td>{f.parentesco ?? '—'}</td>
                <td>{f.telefono ?? '—'}</td>
                <td>{f.email ?? '—'}</td>
                <td>{f.activo ? 'Activo' : 'Inactivo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
