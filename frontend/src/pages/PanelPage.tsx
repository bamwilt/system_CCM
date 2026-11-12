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
      .catch((e) => setError(typeof e?.message === 'string' ? e.message : 'No se pudo cargar la recaudacion.'));
  }, [puede]);

  return (
    <div className="panel">
      <h2>Panel administrativo</h2>

      {sesion ? (
        <p className="panel__usuario">
          Sesion iniciada como <strong>{sesion.email}</strong>.
        </p>
      ) : null}

      <nav className="panel__accesos" aria-label="Accesos rapidos">
        {puede('estudiantes:read') ? <a href="/estudiantes">Estudiantes</a> : null}
        {puede('tutores:manage') ? <a href="/tutores">Tutores</a> : null}
        {puede('matriculas:manage') ? <a href="/matriculas">Matriculas</a> : null}
        {puede('pagos:manage') ? <a href="/cobro">Registrar cobro</a> : null}
        {puede('reportes:read') ? <a href="/reportes">Reportes</a> : null}
      </nav>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      {puede('reportes:read') ? (
        <section className="panel__seccion">
          <h3>Recaudacion reciente</h3>
          <Tabla<FilaRecaudacion>
            filas={recaudacion}
            clave={(f) => f.dia}
            columnas={[
              { encabezado: 'Dia', celda: (f) => f.dia },
              { encabezado: 'Operaciones', celda: (f) => f.operaciones },
              { encabezado: 'Total', celda: (f) => <Importe valor={f.total} /> },
              {
                encabezado: 'Anuladas',
                celda: (f) => `${f.anuladas} (${f.total_anulado})`,
              },
            ]}
            vacio="Sin movimientos registrados."
          />
        </section>
      ) : (
        <Mensaje tipo="info">Su usuario no tiene permiso para ver reportes.</Mensaje>
      )}
    </div>
  );
}
