import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContext';
import { Alerta } from '../componentes/Alerta';
import { IconoUsuario } from '../componentes/Iconos';

/**
 * Pantalla de acceso.
 *
 * Los mensajes de error del backend se muestran tal cual: la API ya responde
 * en español y con un texto concreto ("usuario no existe" vs "contraseña
 * incorrecta"), que es más útil que un "no se pudo iniciar sesión".
 */

/** Cuentas de demostración del seed, para poder probar sin crear nada. */
const CUENTAS = [
  { rol: 'Administrador', email: 'admin@ccm.edu.do', password: 'Admin123!' },
  { rol: 'Secretaría', email: 'secretaria@ccm.edu.do', password: 'Secretaria123!' },
  { rol: 'Docente', email: 'docente@ccm.edu.do', password: 'Docente123!' },
  { rol: 'Consulta', email: 'consulta@ccm.edu.do', password: 'Consulta123!' },
];

export function PaginaLogin() {
  const { entrar } = useAuth();
  const navegar = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Completá tu email y tu contraseña.');
      return;
    }

    setEnviando(true);
    try {
      await entrar(email.trim(), password);
      void navegar('/panel', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setEnviando(false);
    }
  };

  const usarCuenta = (cuenta: (typeof CUENTAS)[number]) => {
    setEmail(cuenta.email);
    setPassword(cuenta.password);
    setError('');
  };

  return (
    <div className="ccm-login-fondo">
      <div className="ccm-login-tarjeta">
        <div className="ccm-login-marca">
          <span className="ccm-login-logo">
            <IconoUsuario tam={22} />
          </span>
          <div>
            <h1 className="ccm-login-titulo">CCM</h1>
            <p style={{ fontSize: 13, color: 'var(--ccm-espacial-500)' }}>Gestión Académica</p>
          </div>
        </div>

        <p className="ccm-login-subtitulo">Ingresá con tu cuenta para continuar</p>

        <form className="ccm-login-formulario" onSubmit={(e) => void enviar(e)} noValidate>
          {error && <Alerta tono="error">{error}</Alerta>}

          <div className="ccm-campo">
            <label className="ccm-campo-etiqueta" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="ccm-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="tucorreo@ccm.edu.do"
              disabled={enviando}
            />
          </div>

          <div className="ccm-campo">
            <label className="ccm-campo-etiqueta" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="ccm-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={enviando}
            />
          </div>

          <button
            type="submit"
            className="ccm-btn ccm-btn-primario"
            disabled={enviando}
            style={{ width: '100%', padding: '11px' }}
          >
            {enviando ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="ccm-login-pie">
          <p style={{ marginBottom: 7, fontWeight: 600 }}>Cuentas de demostración</p>
          <div className="ccm-demo">
            {CUENTAS.map((cuenta) => (
              <button
                key={cuenta.email}
                type="button"
                className="ccm-demo-fila"
                onClick={() => usarCuenta(cuenta)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <span>{cuenta.rol}</span>
                <code>
                  {cuenta.email} / {cuenta.password}
                </code>
              </button>
            ))}
          </div>
          <p style={{ marginTop: 9, fontSize: 12 }}>Tocá una cuenta para completar los campos.</p>
        </div>
      </div>
    </div>
  );
}
