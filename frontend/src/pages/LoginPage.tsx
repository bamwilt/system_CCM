import { useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Boton, Campo, Cargando, Mensaje } from '../components/Comunes';

/**
 * INICIO DE SESIÓN (FASE 9.B)
 *
 * Dos paneles: a la izquierda, qué es el sistema (orientación para quien entra
 * por primera vez, requisito de facilidad de aprendizaje del PM); a la derecha,
 * el formulario. En pantallas chicas solo se muestra el formulario.
 */
export default function LoginPage() {
  const { iniciarSesion, error, limpiarError } = useSesion();
  const [enviando, setEnviando] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <div className="login__panel">
        <h1>SGPM</h1>
        <p>
          Sistema de Gestión de Pagos y Matrículas. Centraliza matrículas, planes de pago, cobros en
          ventanilla y reportes del colegio.
        </p>
        <ul className="login__lista">
          <li>Registre cobros con confirmación antes de afectar saldos</li>
          <li>Las operaciones no se duplican si la conexión se corta</li>
          <li>Los reportes calculan sobre los registros oficiales</li>
        </ul>
      </div>

      <div className="login__form">
        <h2>Iniciar sesión</h2>
        <p className="login__intro">Ingrese con las credenciales que le asignó la administración.</p>

        {error ? (
          <Mensaje tipo="error" onCerrar={limpiarError}>
            {error}
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

          <Campo etiqueta="Contraseña" identificador="password">
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

          <Boton tipo="primario" bloque grande cargando={enviando} disabled={!email || !password}>
            Ingresar
          </Boton>
        </form>

        {enviando ? <Cargando texto="Verificando credenciales…" /> : null}
      </div>
    </div>
  );
}
