import type { ReactNode } from 'react';
import { IconoAlerta, IconoInfo, IconoComprobante } from './Iconos';
import { IconoCerrar } from './Iconos';

/**
 * Avisos en línea.
 *
 * `Alerta` muestra un mensaje de error o éxito que la pantalla necesita
 * comunicar sin sacar al usuario de lo que está haciendo.
 */

export type TonoAlerta = 'error' | 'exito' | 'info';

const CLASES: Record<TonoAlerta, string> = {
  error: 'ccm-alerta-error',
  exito: 'ccm-alerta-exito',
  info: 'ccm-alerta-info',
};

interface PropsAlerta {
  tono?: TonoAlerta;
  titulo?: string;
  children: ReactNode;
  /** Lista de dependents que bloquean un borrado (409 de la API). */
  detalles?: Record<string, number>;
  alCerrar?: () => void;
}

export function Alerta({ tono = 'info', titulo, children, detalles, alCerrar }: PropsAlerta) {
  const Icono = tono === 'error' ? IconoAlerta : tono === 'exito' ? IconoComprobante : IconoInfo;

  return (
    <div className={`ccm-alerta ${CLASES[tono]}`} role={tono === 'error' ? 'alert' : 'status'}>
      <Icono tam={17} />
      <div className="ccm-alerta-cuerpo">
        {titulo && <strong>{titulo}</strong>}
        {titulo && ' '}
        {children}
        {detalles && Object.keys(detalles).length > 0 && (
          <ul className="ccm-alerta-lista">
            {Object.entries(detalles).map(([nombre, n]) => (
              <li key={nombre}>
                {n} en {nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
      {alCerrar && (
        <button
          type="button"
          className="ccm-btn-icono"
          onClick={alCerrar}
          aria-label="Cerrar aviso"
        >
          <IconoCerrar tam={15} />
        </button>
      )}
    </div>
  );
}

/** Bloque de error a pantalla completa, usado cuando no hay datos ni acción posible. */
export function ErrorFatal({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="ccm-estado">
      <span className="ccm-estado-icono">
        <IconoAlerta tam={40} />
      </span>
      <p className="ccm-estado-titulo">{titulo}</p>
      {detalle && <p className="ccm-estado-texto">{detalle}</p>}
    </div>
  );
}
