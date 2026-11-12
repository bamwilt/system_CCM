import { useEffect, useState } from 'react';
import { checkHealth, HealthResponse } from '../services/api';
import { Cargando, Mensaje } from '../components/Comunes';

/**
 * ESTADO DEL SISTEMA (FASE 9)
 *
 * Antes esto volcaba el JSON crudo en un <pre>: no era interfaz, era la
 * respuesta de la API sin presentar. Ahora se muestra como tarjetas legibles,
 * que es lo que el PM pide (claridad y legibilidad).
 */
export default function HealthPage() {
  const [datos, setDatos] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    checkHealth()
      .then((d) => setDatos(d))
      .catch((e: unknown) =>
        setError(
          e instanceof Error && e.message ? e.message : 'No se pudo consultar el estado.'
        )
      )
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="listado">
      <h2>Estado del sistema</h2>

      {cargando ? <Cargando texto="Consultando el estado..." /> : null}
      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      {datos ? (
        <>
          <p className={`estado__resumen estado__resumen--${datos.status}`}>
            {datos.status === 'ok' ? 'Sistema operativo' : 'Sistema con problemas'} — base de
            datos {datos.database === 'connected' ? 'conectada' : 'desconectada'}
          </p>

          <dl className="estado__datos">
            <div>
              <dt>Estado</dt>
              <dd>{datos.status}</dd>
            </div>
            <div>
              <dt>Base de datos</dt>
              <dd>{datos.database}</dd>
            </div>
            <div>
              <dt>Entorno</dt>
              <dd>{datos.environment}</dd>
            </div>
            <div>
              <dt>Tiempo activo</dt>
              <dd>{Math.floor(datos.uptime / 60)} min</dd>
            </div>
            <div>
              <dt>Ultima verificacion</dt>
              <dd>{new Date(datos.timestamp).toLocaleString('es')}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
}
