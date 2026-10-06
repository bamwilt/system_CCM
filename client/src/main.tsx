import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './estilos/base.css';
import './estilos/layout.css';

/**
 * Punto de entrada.
 *
 * `StrictMode` queda activo en desarrollo: monta los componentes dos veces para
 * detectar efectos con dependencias incorrectas y memory leaks.
 */
const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
