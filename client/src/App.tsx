import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { Layout } from './componentes/Layout';
import { MODULOS } from './config/modulos';
import { ProveedorAuth, useAuth } from './contexto/AuthContext';
import { ProveedorCatalogos } from './contexto/CatalogosContext';
import { PaginaLogin } from './paginas/Login';
import { PaginaPanel } from './paginas/Panel';
import { PaginaModulo } from './paginas/Modulo';
import { PaginaNoEncontrada } from './paginas/NoEncontrada';

/**
 * Rutas de la aplicación.
 *
 * `RutaProtegida` es la única barrera de acceso real en el cliente: la API
 * igual valida el token en cada petición, así que esto es conveniencia de
 * navegación y no un límite de seguridad.
 */
function RutaProtegida({ children }: { children: ReactElement }): ReactElement {
  const { usuario, cargando } = useAuth();

  // Mientras se revalida el token guardado se muestra el cargador, para no
  // expulsar al usuario a la pantalla de login en cada recarga.
  if (cargando) {
    return (
      <div className="ccm-estado" style={{ minHeight: '100vh' }}>
        <div className="ccm-cargador" role="status" aria-label="Verificando sesión" />
      </div>
    );
  }

  if (!usuario) return <Navigate to="/ingresar" replace />;
  return children;
}

export function App() {
  return (
    <ProveedorAuth>
      <ProveedorCatalogos>
        <Routes>
          <Route path="/ingresar" element={<PaginaLogin />} />

          <Route
            element={
              <RutaProtegida>
                <Layout />
              </RutaProtegida>
            }
          >
            <Route index element={<Navigate to="/panel" replace />} />
            <Route path="/panel" element={<PaginaPanel />} />
            {MODULOS.map((mod) => (
              <Route
                key={mod.modulo}
                path={`/${mod.modulo}`}
                element={<PaginaModulo modulo={mod.modulo} />}
              />
            ))}
            <Route path="*" element={<PaginaNoEncontrada />} />
          </Route>
        </Routes>
      </ProveedorCatalogos>
    </ProveedorAuth>
  );
}
