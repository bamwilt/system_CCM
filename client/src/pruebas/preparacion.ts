import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Configuracion comun de las pruebas.
 *
 * El cliente habla con la API mediante `fetch`, que se reemplaza por un mock:
 * sin esto, cada prueba intentaria pegarle a un servidor real. `localStorage`
 * lo provee jsdom y se limpia entre pruebas para que una sesion no se filtre a
 * la siguiente.
 */

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Respuesta vacía por defecto: cada prueba sustituye la que necesite. */
function respuestaVacia(): Response {
  return new Response(
    JSON.stringify({ data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

vi.stubGlobal('fetch', vi.fn(respuestaVacia));
