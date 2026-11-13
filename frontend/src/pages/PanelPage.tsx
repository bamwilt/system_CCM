import { Link } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import { Importe, Mensaje, Tabla } from '../components/Comunes';
import { useEffect, useState } from 'react';
import { listar } from '../services/api';

/**
 * PANEL ADMINISTRATIVO (FASE 9)
 *
 * Muestra solo lo que el usuario activo puede consultar: cada tarjeta aparece
 * si tiene el permiso correspondiente. No es control de acceso (el backend
 * valida), es prevencion de errores: no ofrecer lo que se va a rechazar.
 */

interface FilaRecaudacion {
  dia: string;
  operaciones: number;
  total: string;
  anuladas: number;
  total_anulado: string;
}

export default function PanelPage() {
  const { sesion, puede } = useSesion();
  const [recaudacion, setRecaudacion] = useState<FilaRecaudacion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puede('reportes:read')) {
      return;
    }
    listar<FilaRecaudacion>('/reportes/recaudacion?limite=7')
      .then((r) => setRecaudacion(r.filas))
      .catch((e) => setError(typeof e?.message === 'string' ? e.message : 'No se pudo cargar la recaudación.'));
  }, [puede]);

  return (
    <div className="panel">
      <h2>Panel administrativo</h2>

      {sesion ? (
        <p className="panel__usuario">
          Sesión iniciada como <strong>{sesion.email}</strong>.
        </p>
      ) : null}

      <nav className="panel__accesos" aria-label="Accesos rapidos">
        {puede('estudiantes:read') ? <Link to="/estudiantes">Estudiantes</Link> : null}
        {puede('tutores:manage') ? <Link to="/tutores">Tutores</Link> : null}
        {puede('matriculas:manage') ? <Link to="/matriculas">Matrículas</Link> : null}
        {puede('pagos:manage') ? <Link to="/cobro">Registrar cobro</Link> : null}
        {puede('reportes:read') ? <Link to="/reportes">Reportes</Link> : null}
      </nav>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      {puede('reportes:read') ? (
        <section className="panel__seccion">
          <h3>Recaudación reciente</h3>
          <Tabla<FilaRecaudacion>
            filas={recaudacion}
            clave={(f) => f.dia}
            columnas={[
              { encabezado: 'Día', celda: (f) => f.dia },
              { encabezado: 'Operaciones', celda: (f) => f.operaciones },
              { encabezado: 'Total', celda: (f) => <Importe valor={f.total} /> },
              {
                encabezado: 'Anuladas',
                celda: (f) => `${f.anuladas} (${f.total_anulado})`,
              },
            ]}
            vacio={{ titulo: 'Sin movimientos registrados.' }}
          />
        </section>
      ) : (
        <Mensaje tipo="info">Su usuario no tiene permiso para ver reportes.</Mensaje>
      )}
    </div>
  );
}
