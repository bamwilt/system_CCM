import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { MODULOS } from '../config/modulos';
import { useAuth } from '../contexto/AuthContext';
import { ETIQUETA_ROL } from '../api/tipos';
import {
  ICONOS,
  iniciales,
  IconoPanel,
  IconoSalir,
  IconoUsuario,
  IconoMenu,
} from '../componentes/Iconos';

/**
 * Estructura de la aplicación una vez iniciada sesión: lateral de navegación,
 * encabezado con el usuario actual y el contenido de la ruta activa.
 */

export function Layout() {
  const { usuario, salir } = useAuth();
  const ubicacion = useLocation();
  // En móvil el lateral se cierra al navegar (ver `cerrarAlNavegar`), para no
  // tapar la pantalla con el menú desplegado.
  const [lateralAbierto, setLateralAbierto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el menú del usuario al hacer clic fuera de él.
  useEffect(() => {
    if (!menuUsuario) return;
    const alClicar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuUsuario(false);
    };
    const alEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuUsuario(false);
    };
    document.addEventListener('mousedown', alClicar);
    document.addEventListener('keydown', alEsc);
    return () => {
      document.removeEventListener('mousedown', alClicar);
      document.removeEventListener('keydown', alEsc);
    };
  }, [menuUsuario]);

  const cerrarAlNavegar = () => {
    setLateralAbierto(false);
    setMenuUsuario(false);
  };

  const moduloActual = MODULOS.find((m) => ubicacion.pathname.includes(`/${m.modulo}`));
  const tituloActual =
    ubicacion.pathname === '/panel' ? 'Panel general' : (moduloActual?.titulo ?? 'CCM');

  return (
    <div className="ccm-app">
      {lateralAbierto && (
        <div className="ccm-lateral-cortina" onClick={() => setLateralAbierto(false)} />
      )}

      <aside className={`ccm-lateral ${lateralAbierto ? 'ccm-abierto' : ''}`}>
        <div className="ccm-lateral-marca">
          <span className="ccm-lateral-logo">
            <IconoUsuario tam={18} />
          </span>
          <div>
            <p className="ccm-lateral-titulo">CCM</p>
            <p className="ccm-lateral-subtitulo">Gestión Académica</p>
          </div>
        </div>

        <nav className="ccm-lateral-nav" aria-label="Navegación principal">
          <p className="ccm-lateral-grupo">General</p>
          <NavLink
            to="/panel"
            className={({ isActive }) => `ccm-lateral-enlace ${isActive ? 'ccm-activo' : ''}`}
            onClick={cerrarAlNavegar}
          >
            <IconoPanel tam={17} />
            Panel
          </NavLink>

          <p className="ccm-lateral-grupo">Módulos</p>
          {MODULOS.map((mod) => {
            const Icono = ICONOS[mod.icono];
            return (
              <NavLink
                key={mod.modulo}
                to={`/${mod.modulo}`}
                className={({ isActive }) => `ccm-lateral-enlace ${isActive ? 'ccm-activo' : ''}`}
                onClick={cerrarAlNavegar}
              >
                {Icono ? <Icono tam={17} /> : null}
                {mod.titulo}
              </NavLink>
            );
          })}
        </nav>

        <div className="ccm-lateral-pie">
          Sistema de Gestión Académica
          <br />
          Proyecto académico · v1.0
        </div>
      </aside>

      <div className="ccm-contenido">
        <header className="ccm-encabezado">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="ccm-btn-icono ccm-boton-menu"
              onClick={() => setLateralAbierto((v) => !v)}
              aria-label="Abrir navegación"
            >
              <IconoMenu tam={19} />
            </button>
            <div>
              <p className="ccm-encabezado-titulo">{tituloActual}</p>
              <p className="ccm-encabezado-ruta">CCM · Gestión Académica</p>
            </div>
          </div>

          <div className="ccm-encabezado-derecha">
            <div className="ccm-menu-envoltorio" ref={menuRef}>
              <button
                type="button"
                className="ccm-menu-usuario"
                onClick={() => setMenuUsuario((v) => !v)}
                aria-expanded={menuUsuario}
                aria-haspopup="menu"
              >
                <span className="ccm-usuario-avatar">
                  {usuario ? iniciales(usuario.nombre) : '—'}
                </span>
                <span className="ccm-usuario-info">
                  <span className="ccm-usuario-nombre">{usuario?.nombre}</span>
                  <span className="ccm-usuario-rol">
                    {usuario ? ETIQUETA_ROL[usuario.rol] : ''}
                  </span>
                </span>
              </button>

              {menuUsuario && usuario && (
                <div className="ccm-menu-desplegable" role="menu">
                  <div className="ccm-menu-dato">
                    <p className="ccm-menu-dato-email">{usuario.email}</p>
                    <p className="ccm-menu-dato-rol">
                      <span className="ccm-insignia ccm-insignia-info">
                        {ETIQUETA_ROL[usuario.rol]}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ccm-menu-item ccm-peligro"
                    role="menuitem"
                    onClick={() => void salir()}
                  >
                    <IconoSalir tam={16} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
