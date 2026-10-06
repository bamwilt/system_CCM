/**
 * Iconos SVG en línea.
 *
 * Se usan trazos (stroke) de 24x24 con `currentColor`, así que heredan el
 * color del texto y no hace falta una librería de iconos.
 */

interface PropsIcono {
  tam?: number;
  className?: string;
}

function svg(caminos: React.ReactNode, tam = 18, className?: string) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {caminos}
    </svg>
  );
}

export const IconoPanel = ({ tam }: PropsIcono) =>
  svg(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>,
    tam,
  );

export const IconoEstudiantes = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
    tam,
  );

export const IconoClientes = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </>,
    tam,
  );

export const IconoDocentes = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
    </>,
    tam,
  );

export const IconoAsignaturas = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>,
    tam,
  );

export const IconoGrupos = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M15.5 14.5H18a4 4 0 0 1 3 3.5v2" />
    </>,
    tam,
  );

export const IconoMatriculas = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <path d="m9 8 2 2 4-4" />
      <path d="M13 11h8" />
      <path d="M17 15h-4" />
    </>,
    tam,
  );

export const IconoNotas = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </>,
    tam,
  );

export const IconoPagos = ({ tam }: PropsIcono) =>
  svg(
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>,
    tam,
  );

export const IconoBuscar = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
    tam,
  );

export const IconoMas = ({ tam }: PropsIcono) => svg(<path d="M12 5v14M5 12h14" />, tam);

export const IconoEditar = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </>,
    tam,
  );

export const IconoBasura = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>,
    tam,
  );

export const IconoCerrar = ({ tam }: PropsIcono) => svg(<path d="M18 6 6 18M6 6l12 12" />, tam);

export const IconoAlerta = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>,
    tam,
  );

export const IconoInfo = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>,
    tam,
  );

export const IconoComprobante = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="m5 13 4 4L19 7" />
    </>,
    tam,
  );

export const IconoSalir = ({ tam }: PropsIcono) =>
  svg(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>,
    tam,
  );

export const IconoUsuario = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1" />
    </>,
    tam,
  );

export const IconoMenu = ({ tam }: PropsIcono) => svg(<path d="M3 6h18M3 12h18M3 18h18" />, tam);

export const IconoReloj = ({ tam }: PropsIcono) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
    tam,
  );

export const IconoVacio = ({ tam }: PropsIcono) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 14 2 2 4-4" />
    </>,
    tam,
  );

/** Mapa por clave, usado por la configuración de módulos. */
export const ICONOS: Record<string, (p: PropsIcono) => React.ReactElement> = {
  panel: IconoPanel,
  estudiantes: IconoEstudiantes,
  clientes: IconoClientes,
  docentes: IconoDocentes,
  asignaturas: IconoAsignaturas,
  grupos: IconoGrupos,
  matriculas: IconoMatriculas,
  notas: IconoNotas,
  pagos: IconoPagos,
};

/** Iniciales para el avatar del encabezado. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p.charAt(0).toUpperCase()).join('');
}
