import { useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Boton, Campo, Cargando, Mensaje } from '../components/Comunes';

/**
 * INICIO DE SESION (FASE 9)
 *
 * Prevencion de errores (requisito del PM): el formulario no se envia mientras
 * carga, y el error se muestra junto al campo, no como un aviso generico.
 */
export default function LoginPage() {
  const { iniciarSesion, cargando, error, limpiarError } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    // No se navega a ninguna ruta: al existir sesion, App renderiza la ruta
    // actual con el Layout. Navegar a '/' perderia la pantalla que la persona
    // pidio originalmente (p. ej. /cobro).
    await iniciarSesion(email.trim(), password);
  }

  return (
    <div className="login">
      <h1>SGPM — Inicio de sesion</h1>
      <p className="login__intro">
        Sistema de Gestion de Pagos y Matriculas.
      </p>

      {error ? (
        <Mensaje tipo="error">
          {error}
          <button type="button" onClick={limpiarError} aria-label="Cerrar error">
            ×
          </button>
        </Mensaje>
      ) : null}

      <form onSubmit={enviar} noValidate>
        <Campo etiqueta="Correo" identificador="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Contrasena" identificador="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>

        <Boton tipo="primario" cargando={cargando} disabled={email === '' || password === ''}>
          Ingresar
        </Boton>
      </form>

      {cargando ? <Cargando texto="Verificando credenciales..." /> : null}
    </div>
  );
}
