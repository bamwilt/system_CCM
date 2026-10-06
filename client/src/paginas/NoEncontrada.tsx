import { Link } from 'react-router-dom';
import { IconoVacio } from '../componentes/Iconos';

/** Ruta que no existe dentro de la aplicación. */
export function PaginaNoEncontrada() {
  return (
    <div className="ccm-pagina">
      <div className="ccm-estado">
        <span className="ccm-estado-icono">
          <IconoVacio tam={44} />
        </span>
        <p className="ccm-estado-titulo">Página no encontrada</p>
        <p className="ccm-estado-texto">
          La dirección que abriste no corresponde a ninguna sección del sistema.
        </p>
        <Link to="/panel" className="ccm-btn ccm-btn-primario" style={{ marginTop: 6 }}>
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
