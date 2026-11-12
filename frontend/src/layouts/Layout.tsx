import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';

/**
 * ============================================================================
 * ESTRUCTURA DE LA APLICACION (FASE 9.B)
 * ==========================================================================
 *
 * Barra lateral fija + area de contenido. El PM pide "navegacion principal" y
 * "panel administrativo": aqui estan ambos.
 *
 * Los modulos se agrupan por lo que el personal hace en el dia: COBRAR primero,
 * consultar despues. Solo aparecen los modulos para los que el usuario activo
 * tiene permiso, de modo que la interfaz no ofrezca operaciones que el backend
 * rechazaria.
 */

interface Modulo {
  ruta: string;
  etiqueta: string;
  icono: string;
  permiso: string;
  exacto?: boolean;
}

const MODULOS: Modulo[] = [
  { ruta: '/cobro', etiqueta: 'Registrar cobro', icono: '▣', permiso: 'pagos:manage' },
  { ruta: '/matriculas/nueva', etiqueta: 'Nueva matrícula', icono: '✚', permiso: 'matriculas:manage' },
  { ruta: '/estudiantes', etiqueta: 'Estudiantes', icono: '◉', permiso: 'estudiantes:read' },
  { ruta: '/matriculas', etiqueta: 'Matrículas', icono: '⊞', permiso: 'matriculas:read' },
  { ruta: '/tutores', etiqueta: 'Tutores', icono: '◈', permiso: 'tutores:manage' },
  { ruta: '/reportes', etiqueta: 'Reportes', icono: '◫', permiso: 'reportes:read' },
  { ruta: '/health', etiqueta: 'Estado', icono: '◉', permiso: '' },
  { ruta: '/resumen', etiqueta: 'Resumen', icono: '▤', permiso: '' },
];

export default function Layout() {
  const { sesion, puede, cerrarSesion } = useSesion();
  const navegar = useNavigate();

  const visibles = MODULOS.filter((m) => m.permiso === '' || puede(m.permiso));

  return (
    <div className="app">
      <a href="#contenido" className="salto">
        Saltar al contenido
      </a>

      <aside className="sidebar">
        <div className="sidebar__marca">
          <span className="sidebar__logo" aria-hidden="true">
            SG
          </span>
          <div>
            <div className="sidebar__nombre">SGPM</div>
            <div className="sidebar__sub">Pagos y Matrículas</div>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          <div className="sidebar__grupo">Operación</div>
          {visibles.slice(0, 2).map((m) => (
            <NavLink
              key={m.ruta}
              to={m.ruta}
              end={m.exacto}
              className={({ isActive }) =>
                `sidebar__enlace${isActive ? ' sidebar__enlace--activo' : ''}`
              }
            >
              <span className="sidebar__icono" aria-hidden="true">
                {m.icono}
              </span>
              {m.etiqueta}
            </NavLink>
          ))}

          <div className="sidebar__grupo">Consultas</div>
          {visibles.slice(2).map((m) => (
            <NavLink
              key={m.ruta}
              to={m.ruta}
              end={m.exacto}
              className={({ isActive }) =>
                `sidebar__enlace${isActive ? ' sidebar__enlace--activo' : ''}`
              }
            >
              <span className="sidebar__icono" aria-hidden="true">
                {m.icono}
              </span>
              {m.etiqueta}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__pie">
          {sesion ? (
            <div className="sidebar__usuario">
              <strong>{sesion.nombre || sesion.email}</strong>
              {sesion.email}
            </div>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              await cerrarSesion();
              navegar('/login', { replace: true });
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main id="contenido" className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
