import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * ============================================================================
 * APARIENCIA DE LA INTERFAZ (FASE 9.B)
 * ============================================================================
 *
 * Configuracion personalizable y persistente (localStorage) para que cada
 * usuario deje la interfaz como la quiere. Hay tres ajustes, todos de
 * presentacion: ninguno cambia una cifra ni una regla de negocio.
 *
 *   tema       -> oscuro (por defecto) | claro
 *   densidad   -> comoda | compacta (cuanta informacion cabe por pantalla)
 *   movimiento -> completo | reducido (para quien prefiere sin animaciones)
 *
 * Los valores se aplican al elemento raiz mediante atributos data-*, y toda la
 * hoja de estilos consume tokens, asi que anadir un tema nuevo solo requiere
 * declarar su bloque de tokens.
 */

export type Tema = 'oscuro' | 'claro';
export type Densidad = 'comoda' | 'compacta';
export type Movimiento = 'completo' | 'reducido';

interface EstadoApariencia {
  tema: Tema;
  cambiarTema: (tema: Tema) => void;
  alternarTema: () => void;
  densidad: Densidad;
  cambiarDensidad: (densidad: Densidad) => void;
  movimiento: Movimiento;
  cambiarMovimiento: (movimiento: Movimiento) => void;
}

const AparienciaContexto = createContext<EstadoApariencia | null>(null);

const CLAVE_TEMA = 'sgpm.tema';
const CLAVE_DENSIDAD = 'sgpm.densidad';
const CLAVE_MOVIMIENTO = 'sgpm.movimiento';

function leer<T extends string>(clave: string, validos: readonly T[], porDefecto: T): T {
  try {
    const guardado = window.localStorage.getItem(clave);
    if (guardado && (validos as readonly string[]).includes(guardado)) {
      return guardado as T;
    }
  } catch {
    // localStorage puede no estar disponible (modo privado): se usa el default.
  }
  return porDefecto;
}

function guardar(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin persistencia la sesion sigue funcionando con el ajuste en memoria.
  }
}

export function AparienciaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => leer(CLAVE_TEMA, ['claro', 'oscuro'], 'oscuro'));
  const [densidad, setDensidad] = useState<Densidad>(() =>
    leer(CLAVE_DENSIDAD, ['compacta', 'comoda'], 'comoda')
  );
  const [movimiento, setMovimiento] = useState<Movimiento>(() =>
    leer(CLAVE_MOVIMIENTO, ['reducido', 'completo'], 'completo')
  );

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-tema', tema);
    raiz.setAttribute('data-densidad', densidad);
    raiz.setAttribute('data-movimiento', movimiento);
    guardar(CLAVE_TEMA, tema);
    guardar(CLAVE_DENSIDAD, densidad);
    guardar(CLAVE_MOVIMIENTO, movimiento);
  }, [tema, densidad, movimiento]);

  const cambiarTema = useCallback((nuevo: Tema) => setTema(nuevo), []);
  const alternarTema = useCallback(
    () => setTema((actual) => (actual === 'oscuro' ? 'claro' : 'oscuro')),
    []
  );
  const cambiarDensidad = useCallback((nueva: Densidad) => setDensidad(nueva), []);
  const cambiarMovimiento = useCallback((nuevo: Movimiento) => setMovimiento(nuevo), []);

  return (
    <AparienciaContexto.Provider
      value={{
        tema,
        cambiarTema,
        alternarTema,
        densidad,
        cambiarDensidad,
        movimiento,
        cambiarMovimiento,
      }}
    >
      {children}
    </AparienciaContexto.Provider>
  );
}

export function useApariencia(): EstadoApariencia {
  const contexto = useContext(AparienciaContexto);
  if (!contexto) {
    throw new Error('useApariencia debe usarse dentro de AparienciaProvider');
  }
  return contexto;
}
