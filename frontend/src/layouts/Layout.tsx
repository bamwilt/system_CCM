import { Outlet, Link } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="layout">
      <header>
        <h1>SGPM</h1>
        <nav>
          <Link to="/">Inicio</Link>
          <Link to="/health">Estado</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
