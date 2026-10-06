import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { auth } from '../api/recursos';
import { leerToken, registrarManejoDeSesion } from '../api/cliente';
import { puedeEscribir, type Usuario } from '../api/tipos';

/**
 * Estado de sesión de la aplicación.
 *
 * Al montar, si hay un token guardado se valida contra `/auth/yo`. Eso
 * distingue "guardé un token" de "el token sigue siendo válido", que no es lo
 * mismo: un token puede haber caducado si el servidor reinició con otro
 * `JWT_SECRET` sin que el navegador se entere.
 */

interface ContextoAuth {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  /** `true` si el rol puede crear, editar y borrar. */
  puedeEditar: boolean;
}

const AuthContext = createContext<ContextoAuth | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }): ReactNode {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  // `validado` distingue "todavía no revisé el token" de "ya lo revisé". Se
  // deriva `cargando` de ahí en el render en vez de escribirlo desde el
  // efecto, que provoke un render extra en cascada.
  const [validado, setValidado] = useState(() => !leerToken());

  const salir = useCallback(async () => {
    await auth.salir();
    setUsuario(null);
  }, []);

  // El cliente HTTP avisa cuando un 401 invalida la sesión en curso.
  useEffect(() => {
    registrarManejoDeSesion(() => setUsuario(null));
  }, []);

  // Revalidación inicial del token guardado.
  useEffect(() => {
    if (!leerToken()) return;

    let vigente = true;

    auth
      .yo()
      .then((u) => {
        if (vigente) setUsuario(u);
      })
      .catch(() => {
        // Token vencido o inválido: el cliente HTTP ya lo descartó.
        if (vigente) setUsuario(null);
      })
      .finally(() => {
        if (vigente) setValidado(true);
      });

    return () => {
      vigente = false;
    };
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    const r = await auth.entrar(email, password);
    setUsuario(r.usuario);
  }, []);

  const valor = useMemo<ContextoAuth>(
    () => ({
      usuario,
      cargando: !validado,
      entrar,
      salir,
      puedeEditar: puedeEscribir(usuario?.rol),
    }),
    [usuario, validado, entrar, salir],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>');
  return ctx;
}
