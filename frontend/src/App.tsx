import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import { useSesion } from './context/SesionContexto';
import HomePage from './pages/HomePage';
import HealthPage from './pages/HealthPage';
import LoginPage from './pages/LoginPage';
import PanelPage from './pages/PanelPage';
import CobroPage from './pages/CobroPage';
import EstudiantesPage from './pages/EstudiantesPage';
import TutoresPage from './pages/TutoresPage';
import NuevaMatriculaPage from './pages/NuevaMatriculaPage';
import MatriculasPage from './pages/MatriculasPage';
import ReportesPage from './pages/ReportesPage';

/**
 * RUTAS (FASE 9)
 *
 * "Respetar los permisos: cada usuario debe ver las operaciones y la
 * informacion que le corresponden". La comprobacion visual no sustituye la
 * autorizacion del backend: evita ofrecer lo que sera rechazado.
 */
function App() {
  const { sesion } = useSesion();

  // Sin sesion se muestra el login EN LA RUTA ACTUAL, sin cambiar la URL: si se
  // redirigiera a /login y de ahi a '/', la persona perderia la pantalla que
  // pidio (p. ej. /cobro) y acabaria en el panel.
  if (!sesion) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<PanelPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/cobro" element={<CobroPage />} />
        <Route path="/estudiantes" element={<EstudiantesPage />} />
        <Route path="/matriculas" element={<MatriculasPage />} />
        <Route path="/matriculas/nueva" element={<NuevaMatriculaPage />} />
        <Route path="/tutores" element={<TutoresPage />} />
        <Route path="/reportes" element={<ReportesPage />} />
        <Route path="/login" element={<PanelPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

export default App;
