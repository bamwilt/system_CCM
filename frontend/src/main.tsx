import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SesionProvider } from './context/SesionContexto';
import { AparienciaProvider } from './context/AparienciaContexto';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AparienciaProvider>
        <SesionProvider>
          <App />
        </SesionProvider>
      </AparienciaProvider>
    </BrowserRouter>
  </React.StrictMode>
);
