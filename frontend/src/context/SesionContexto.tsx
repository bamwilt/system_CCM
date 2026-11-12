import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  SesionInfo,
  cerrarSesion as apiCerrarSesion,
  obtenerSesionActiva,
  iniciarSesion as apiIniciarSesion,
  mensajeDeError,
  setCsrfToken,
} from '../services/api';

/**
 * ============================================================================
 * CONTEXTO DE SESION Y PERMISOS (FASE 9)
 * ============================================================================
 *
 * El PM exige: "Respetar los permisos: cada usuario debe ver las operaciones y
 * la informacion que le correspondan".
 *
 * La comprobacion visual NO es la autorizacion: el backend valida cada peticion
 * con `requirePermission`. Lo que aqui se hace es no mostrar al usuario
 * operaciones que el backend le va a rechazar, para prevenir el error
 * (requisito de usabilidad del PM), no para sustituir el control de acceso.
 */

export interface EstadoSesion {
  sesion: SesionInfo | null;
  cargando: boolean;
  error: string | null;
  iniciarSesion: (email: string, password: string) => Promise<boolean>;
  cerrarSesion: () => Promise<void>;
  /** ¿El usuario activo tiene este permiso tecnico? */
  puede: (permiso: string) => boolean;
  limpiarError: () => void;
}

const SesionContexto = createContext<EstadoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Al montar se consulta la sesion activa al backend. Asi un refresco de pagina
  // NO pierde la sesion ni los permisos: la cookie de sesion sigue siendo valida.
  // Nunca se asumen permisos desde el almacenamiento local.
  useEffect(() => {
    let vigente = true;
    obtenerSesionActiva()
      .then((info) => {
        if (vigente) {
          setSesion(info);
        }
      })
      .catch(() => {
        if (vigente) {
          setSesion(null);
        }
      })
      .finally(() => {
        if (vigente) {
          setCargando(false);
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  const iniciarSesion = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setCargando(true);
      setError(null);
      try {
        const info = await apiIniciarSesion(email, password);
        setSesion(info);
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        setSesion(null);
        setCsrfToken(null);
        return false;
      } finally {
        setCargando(false);
      }
    },
    []
  );

  const cerrarSesion = useCallback(async () => {
    setCargando(true);
    try {
      await apiCerrarSesion();
    } catch {
      // Aunque el backend falle, la sesion local se cierra: no es un error que
      // la persona deba resolver para salir.
    } finally {
      setSesion(null);
      setCsrfToken(null);
      setCargando(false);
    }
  }, []);

  const puede = useCallback(
    (permiso: string): boolean => {
      if (!sesion) {
        return false;
      }
      return sesion.grants.includes(permiso);
    },
    [sesion]
  );

  const limpiarError = useCallback(() => setError(null), []);

  return (
    <SesionContexto.Provider
      value={{ sesion, cargando, error, iniciarSesion, cerrarSesion, puede, limpiarError }}
    >
      {children}
    </SesionContexto.Provider>
  );
}

export function useSesion(): EstadoSesion {
  const contexto = useContext(SesionContexto);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de SesionProvider');
  }
  return contexto;
}
