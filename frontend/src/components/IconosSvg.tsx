import type { SVGProps } from 'react';

/**
 * ============================================================================
 * ICONOS SVG PROPIOS (FASE 9.B)
 * ============================================================================
 *
 * La marca y la accion de salir se dibujan como SVG en lugar de depender de
 * la fuente de iconos: si una fuente no carga o un glifo no existe, un texto
 * roto dentro de la barra lateral es lo primero que se ve al entrar. Estas dos
 * piezas no pueden fallar asi.
 *
 * `currentColor` en los trazos: heredan el color del boton, igual que los
 * iconos de la fuente.
 */

/** Marca de SGPM: escudo con degradado celeste -> dorado. */
export function LogoSvg({ tamano = 36, titulo }: { tamano?: number; titulo?: string }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 64 64"
      role={titulo ? 'img' : 'presentation'}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id="sgpm-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#56b8ee" />
          <stop offset="1" stopColor="#d9b45b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0a1020" />
      <path
        d="M32 8 52 15v18c0 13-9 20-20 23-11-3-20-10-20-23V15L32 8z"
        fill="url(#sgpm-logo)"
      />
      <path
        d="M32 20v24M26 26h12M26 34h12"
        stroke="#0a1020"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Puerta con flecha: salir de la sesion. */
export function IconoSalir(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/** Interruptor de tema: sol cuando esta claro, luna cuando esta oscuro. */
export function IconoTema({ oscuro }: { oscuro: boolean }) {
  return oscuro ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
