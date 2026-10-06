import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { catalogos } from '../api/recursos';
import type { Catalogos } from '../api/tipos';
import { useAuth } from './AuthContext';

/**
 * Catálogos de referencia (niveles, grupos, programas, estudiantes...).
 *
 * Los formularios necesitan estas listas para sus desplegables y los datos
 * cambian muy poco, así que se piden una vez y se comparten en memoria. Un
 * fallo al cargarlos no debe impedir usar la aplicación: los desplegables se
 * muestran vacíos y el resto de la pantalla sigue funcionando.
 */

const CatalogosContext = createContext<Catalogos | null>(null);

export function ProveedorCatalogos({ children }: { children: ReactNode }): ReactNode {
  const { usuario } = useAuth();
  const [catalogo, setCatalogo] = useState<Catalogos | null>(null);

  // Los catálogos dependen del token: se piden solo con sesión activa y se
  // vuelven a pedir al iniciar sesión. Pedirlos antes devolvía 401 y los
  // desplegables quedaban vacíos para el resto de la visita.
  useEffect(() => {
    if (!usuario) return;

    const control = new AbortController();
    catalogos(control.signal)
      .then(setCatalogo)
      .catch(() => {
        /* sin catálogos la app sigue siendo utilizable */
      });

    return () => control.abort();
  }, [usuario]);

  // Sin sesión no hay nada que mostrar: derivarlo evita un `setState` en el
  // efecto y garantiza que un logout no deje listas visibles.
  const valor = usuario ? catalogo : null;

  return <CatalogosContext.Provider value={valor}>{children}</CatalogosContext.Provider>;
}

export function useCatalogos(): Catalogos | null {
  return useContext(CatalogosContext);
}

/**
 * Devuelve un catálogo por clave, o una lista vacía si todavía no llegó.
 * Evita `catalogos?.niveles ?? []` repetido en cada formulario.
 */
export function useCatalogo(clave: keyof Catalogos) {
  const catalogos = useCatalogos();
  return useMemo(() => catalogos?.[clave] ?? [], [catalogos, clave]);
}
