import { useCallback, useEffect, useState } from 'react';
import { checkHealth, HealthResponse } from '../services/api';
import { Boton, Cabecera, Esqueleto, Etiqueta, Icono, Mensaje } from '../components/Comunes';
import { fechaHora, tiempoActivo } from '../utils/formato';

/**
 * ============================================================================
 * ESTADO DEL SISTEMA (FASE 9)
 * ============================================================================
 *
 * HISTORIAL DEL FALLO (por que esta pantalla se veia rota):
 *
 *  1. La primera version volcaba el JSON crudo de /api/health en un <pre>: no
 *     era interfaz, era la respuesta de la API sin presentar.
 *  2. La segunda paso a un <dl> con las clases `estado__resumen` y
 *     `estado__datos`... que NUNCA se escribieron en el CSS (verificado: cero
 *     definiciones en todo el repositorio). Resultado: el navegador aplicaba
 *     sus estilos por defecto al <dl>, sin tarjetas ni espaciado. No era falta
 *     de diseno: era una promesa de diseno que no existia.
 *
 * Esta version usa solo lo que ya existe en la biblioteca propia (Cabecera,
 * Boton, Etiqueta, panel + resumen), asi que no puede volver a quedar huerfana
 * de estilos, y ademas arregla tres defectos de fondo:
 *
 *  - La fecha se escribia "12/11/2026, 22:31:45" (toLocaleString('es') sin
 *    opciones): ahora "12 nov 2026, 22:31", en reloj de 24 horas.
 *  - El tiempo activo era Math.floor(uptime / 60) + " min": a los 75 minutos
 *    segua diciendo "75 min". Ahora "1 h 15 min".
 *  - Los valores se mostraban crudos y en ingles ("ok", "connected"). Ahora se
 *    leen en el idioma del colegio, con color; si el backend devuelve un valor
 *    desconocido se muestra ESE valor en rojo, no se esconde.
 *
 *  Y se puede volver a comprobar: la version anterior consultaba una sola vez
 *  al montar la pantalla y la cifra se quedaba vieja para siempre.
 */

/** Los modos de ejecucion que el backend puede reportar. */
const ENTORNOS: Record<string, string> = {
  development: 'Desarrollo',
  production: 'Producción',
  test: 'Pruebas',
};

export default function HealthPage() {
  const [datos, setDatos] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const verificar = useCallback(() => {
    setCargando(true);
    setError(null);
    checkHealth()
      .then((respuesta) => setDatos(respuesta))
      .catch((fallo: unknown) =>
        setError(
          fallo instanceof Error && fallo.message
            ? fallo.message
            : 'No se pudo consultar el estado del sistema.'
        )
      )
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    verificar();
  }, [verificar]);

  // Operativo = servidor responde Y base de datos conectada. Cualquier otra
  // combinacion se presenta como fallo, con el valor real del backend.
  const sano = datos !== null && datos.status === 'ok' && datos.database === 'connected';

  return (
    <>
      <Cabecera
        titulo="Estado del sistema"
        descripcion="Comprobación en vivo del servidor y de su conexión con la base de datos."
        accion={
          <Boton tipo="secundario" icono="refresh" onClick={verificar} cargando={cargando}>
            {datos ? 'Verificar de nuevo' : 'Verificar'}
          </Boton>
        }
      />

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      <section className="tarjeta panel">
        <h2 className="panel__titulo">
          <Icono nombre="monitoring" />
          Comprobación
        </h2>

        {datos ? (
          <dl className="resumen">
            <div className="resumen__fila">
              <dt>Estado</dt>
              <dd>
                {sano ? (
                  <Etiqueta tipo="exito" icono="check_circle">
                    Operativo
                  </Etiqueta>
                ) : (
                  <Etiqueta tipo="peligro" icono="error">
                    {datos.status === 'ok' ? 'Base de datos caída' : datos.status}
                  </Etiqueta>
                )}
              </dd>
            </div>

            <div className="resumen__fila">
              <dt>Base de datos</dt>
              <dd>
                {datos.database === 'connected' ? (
                  <Etiqueta tipo="exito">Conectada</Etiqueta>
                ) : (
                  <Etiqueta tipo="peligro" icono="error">
                    {datos.database}
                  </Etiqueta>
                )}
              </dd>
            </div>

            <div className="resumen__fila">
              <dt>Entorno</dt>
              <dd>
                <Etiqueta tipo="info">{ENTORNOS[datos.environment] ?? datos.environment}</Etiqueta>
              </dd>
            </div>

            <div className="resumen__fila">
              <dt>Tiempo activo</dt>
              <dd>{tiempoActivo(datos.uptime)}</dd>
            </div>

            <div className="resumen__fila">
              <dt>Última verificación</dt>
              <dd>{fechaHora(datos.timestamp)}</dd>
            </div>
          </dl>
        ) : cargando ? (
          /* Mientras carga, el panel conserva su forma: el layout no salta. */
          <Esqueleto lineas={5} />
        ) : null}
      </section>
    </>
  );
}