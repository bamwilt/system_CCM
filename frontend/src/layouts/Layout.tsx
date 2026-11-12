import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';

/**
 * NAVEGACION PRINCIPAL (FASE 9)
 *
 * El PM pide "navegacion principal". Solo aparecen los modulos para los que el
 * usuario activo tiene permiso, de modo que la interfaz no ofrezca operaciones
 * que el backend rechazaria (prevencion de errores).
 */
export default function Layout() {
  const { sesion, puede, cerrarSesion } = useSesion();
  const navegar = useNavigate();

  return (
    <div className="layout">
      <a href="#contenido" className="layout__salto">
        Saltar al contenido
      </a>
      <header>
        <h1>SGPM</h1>
        <nav aria-label="Navegacion principal">
          <Link to="/">Panel</Link>
          {puede('estudiantes:read') ? <Link to="/estudiantes">Estudiantes</Link> : null}
          {puede('tutores:manage') ? <Link to="/tutores">Tutores</Link> : null}
          {puede('matriculas:read') ? <Link to="/matriculas">Matriculas</Link> : null}
          {puede('matriculas:manage') ? <Link to="/matriculas/nueva">Nueva matricula</Link> : null}
          {puede('pagos:manage') ? <Link to="/cobro">Registrar cobro</Link> : null}
          {puede('reportes:read') ? <Link to="/reportes">Reportes</Link> : null}
          <Link to="/health">Estado</Link>
        </nav>
        {sesion ? (
          <div className="layout__sesion">
            <span>{sesion.email}</span>
            <button
              type="button"
              onClick={async () => {
                await cerrarSesion();
                navegar('/login', { replace: true });
              }}
            >
              Cerrar sesion
            </button>
          </div>
        ) : null}
      </header>
      <main id="contenido">
        <Outlet />
      </main>
    </div>
  );
}
