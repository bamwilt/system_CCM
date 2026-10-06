import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconoCerrar } from './Iconos';

/**
 * Diálogo modal.
 *
 * Se implementa a mano en vez de usar `<dialog>` porque necesitamos que el foco
 * quede atrapado dentro del modal mientras está abierto: si el usuario tabula
 * hasta detrás, la página de fondo seguiría recibiendo teclado.
 */

interface PropsModal {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'normal' | 'angosto';
}

const SELECTOR_FOCO =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ abierto, titulo, alCerrar, children, pie, ancho = 'normal' }: PropsModal) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);

  // Esc cierra y el foco vuelve al elemento que abrió el modal.
  useEffect(() => {
    if (!abierto) return;

    focoPrevio.current = document.activeElement as HTMLElement | null;

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        alCerrar();
        return;
      }
      if (e.key !== 'Tab') return;

      const focos = cajaRef.current?.querySelectorAll<HTMLElement>(SELECTOR_FOCO);
      if (!focos || focos.length === 0) return;

      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      const activo = document.activeElement;

      // Cicla dentro del modal en lugar de dejar salir el foco.
      if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alTeclear);

    // Bloquea el scroll del fondo mientras el modal está abierto.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // El foco entra al modal, al primer campo.
    const primer = cajaRef.current?.querySelector<HTMLElement>(SELECTOR_FOCO);
    primer?.focus();

    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflowPrevio;
      focoPrevio.current?.focus();
    };
  }, [abierto, alCerrar]);

  if (!abierto) return null;

  return createPortal(
    <div
      className="ccm-modal-fondo"
      onMouseDown={(e) => {
        // Solo cierra si el clic empieza en el fondo, no dentro del modal.
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div
        className="ccm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={cajaRef}
        style={ancho === 'angosto' ? { maxWidth: 470 } : undefined}
      >
        <div className="ccm-modal-encabezado">
          <h2 className="ccm-modal-titulo">{titulo}</h2>
          <button type="button" className="ccm-btn-icono" onClick={alCerrar} aria-label="Cerrar">
            <IconoCerrar tam={17} />
          </button>
        </div>
        <div className="ccm-modal-cuerpo">{children}</div>
        {pie && <div className="ccm-modal-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
