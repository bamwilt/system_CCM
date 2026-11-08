import { Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import HomePage from './pages/HomePage';
import HealthPage from './pages/HealthPage';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/health" element={<HealthPage />} />
      </Route>
    </Routes>
  );
}

export default App;
