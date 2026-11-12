import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import { useApariencia } from '../context/AparienciaContexto';
import { IconoSalir, IconoTema, LogoSvg } from '../components/IconosSvg';

/**
 * ============================================================================
 * ESTRUCTURA DE LA APLICACION (FASE 9.B)
 * ============================================================================
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
  grupo: 'operacion' | 'consulta';
  exacto?: boolean;
}

const MODULOS: Modulo[] = [
  { ruta: '/cobro', etiqueta: 'Registrar cobro', icono: 'payments', permiso: 'pagos:manage', grupo: 'operacion' },
  { ruta: '/matriculas/nueva', etiqueta: 'Nueva matrícula', icono: 'add_circle', permiso: 'matriculas:manage', grupo: 'operacion' },
  { ruta: '/estudiantes', etiqueta: 'Estudiantes', icono: 'school', permiso: 'estudiantes:read', grupo: 'consulta' },
  { ruta: '/matriculas', etiqueta: 'Matrículas', icono: 'badge', permiso: 'matriculas:read', grupo: 'consulta' },
  { ruta: '/tutores', etiqueta: 'Tutores', icono: 'groups', permiso: 'tutores:manage', grupo: 'consulta' },
  { ruta: '/reportes', etiqueta: 'Reportes', icono: 'insights', permiso: 'reportes:read', grupo: 'consulta' },
  { ruta: '/health', etiqueta: 'Estado del sistema', icono: 'monitoring', permiso: '', grupo: 'consulta' },
];

const GRUPOS: Array<{ id: Modulo['grupo']; titulo: string }> = [
  { id: 'operacion', titulo: 'Operación' },
  { id: 'consulta', titulo: 'Consulta' },
];

export default function Layout() {
  const { sesion, puede, cerrarSesion } = useSesion();
  const { tema, alternarTema } = useApariencia();
  const navegar = useNavigate();

  const visibles = MODULOS.filter((m) => m.permiso === '' || puede(m.permiso));

  return (
    <div className="app">
      <a href="#contenido" className="salto">
        Saltar al contenido
      </a>

      <aside className="sidebar">
        <div className="sidebar__marca">
          <LogoSvg tamano={38} titulo="SGPM" />
          <div>
            <div className="sidebar__nombre">SGPM</div>
            <div className="sidebar__sub">Pagos y Matrículas</div>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          {GRUPOS.map((grupo) => {
            const delGrupo = visibles.filter((m) => m.grupo === grupo.id);
            if (delGrupo.length === 0) {
              return null;
            }
            return (
              <div key={grupo.id}>
                <div className="sidebar__grupo">{grupo.titulo}</div>
                {delGrupo.map((m) => (
                  <NavLink
                    key={m.ruta}
                    to={m.ruta}
                    end={m.exacto}
                    className={({ isActive }) =>
                      `sidebar__enlace${isActive ? ' sidebar__enlace--activo' : ''}`
                    }
                  >
                    <span className="icono" aria-hidden="true">
                      {m.icono}
                    </span>
                    {m.etiqueta}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__pie">
          {sesion ? (
            <div className="sidebar__usuario">
              <strong>{sesion.nombre || sesion.email}</strong>
              {sesion.email}
            </div>
          ) : null}
          <button type="button" className="sidebar__accion" onClick={() => navegar('/configuracion')}>
            <span className="icono" aria-hidden="true">
              settings
            </span>
            Configuración
          </button>
          <button
            type="button"
            className="sidebar__accion"
            onClick={alternarTema}
            aria-pressed={tema === 'oscuro'}
          >
            <IconoTema oscuro={tema === 'oscuro'} />
            {tema === 'oscuro' ? 'Tema oscuro activo' : 'Tema claro activo'}
          </button>
          <button
            type="button"
            className="sidebar__accion sidebar__accion--salir"
            onClick={async () => {
              await cerrarSesion();
              navegar('/login', { replace: true });
            }}
          >
            <IconoSalir />
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
