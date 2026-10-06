import { describe, expect, it, vi } from 'vitest';
import { ErrorApi, ErrorRed, api, borrarToken, guardarToken, leerToken } from '../api/cliente';
import { auth, listar } from '../api/recursos';

/**
 * Pruebas del cliente HTTP.
 *
 * Lo que se verifica es el contrato con la API: el token viaja en la cabecera,
 * los errores se traducen a `ErrorApi` con su detalle, y un 401 cierra sesión.
 */

function respuestaMock(cuerpo: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('almacenamiento del token', () => {
  it('guarda, lee y borra el token', () => {
    expect(leerToken()).toBeNull();
    guardarToken('abc123');
    expect(leerToken()).toBe('abc123');
    expect(localStorage.getItem('ccm.token')).toBe('abc123');
    borrarToken();
    expect(leerToken()).toBeNull();
  });
});

describe('api.get', () => {
  it('envía el token guardado en la cabecera Authorization', async () => {
    guardarToken('mi-token');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(respuestaMock({ data: [] }));

    await api.get('/prueba');

    const [, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer mi-token');
  });

  it('no envía Authorization cuando no hay sesión', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(respuestaMock({ data: [] }));

    await api.get('/prueba');

    const [, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opciones.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('arma la query string omitiendo valores vacíos', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(respuestaMock({ data: [] }));

    await api.get('/estudiantes', { params: { q: '', page: 2, orderBy: undefined } });

    // La ruta precedese a la query, y los filtros vacíos no se envían: mandarlos
    // como `''` haría que la API los tomara como un filtro activo.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/estudiantes?page=2');
  });
});

describe('manejo de errores', () => {
  it('lanza ErrorApi con el mensaje y el detalle de la API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock(
        {
          error: {
            message: 'Datos inválidos en body',
            code: 'VALIDATION_ERROR',
            details: { nombre: 'Nombre debe tener al menos 3 caracteres' },
          },
        },
        422,
      ),
    );

    const error = await api
      .post('/clientes', {})
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    const apiError = error as ErrorApi;
    expect(apiError.status).toBe(422);
    expect(apiError.message).toBe('Datos inválidos en body');
    expect(apiError.codigo).toBe('VALIDATION_ERROR');
    expect(apiError.detalles?.nombre).toBe('Nombre debe tener al menos 3 caracteres');
  });

  it('expone los dependientes de un 409 para ofrecer la cascada', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock(
        {
          error: {
            message: 'No se puede eliminar: hay 15 registro(s) relacionados.',
            dependientes: { matrículas: 2, notas: 12 },
          },
        },
        409,
      ),
    );

    const error = (await api.delete('/estudiantes/1').catch((e: unknown) => e)) as ErrorApi;

    expect(error.status).toBe(409);
    expect(error.dependientes).toEqual({ matrículas: 2, notas: 12 });
  });

  it('devuelve ErrorRed cuando la API no responde', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.get('/salud')).rejects.toBeInstanceOf(ErrorRed);
  });

  it('propaga la cancelación sin convertirla en error de red', async () => {
    const abort = new DOMException('cancelado', 'AbortError');
    vi.mocked(fetch).mockRejectedValueOnce(abort);

    // Un AbortError debe llegar intacto: si se tradujera a ErrorRed, cambiar
    // de filtro rapidly mostraría un mensaje de "no hay conexión".
    await expect(api.get('/salud')).rejects.toBe(abort);
  });

  it('trata un 204 como éxito sin cuerpo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respuestaMock(null, 204));

    await expect(api.delete('/clientes/9')).resolves.toBeUndefined();
  });
});

describe('sesión expirada', () => {
  it('descarta el token cuando la API responde 401', async () => {
    guardarToken('token-caducado');
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock({ error: { message: 'Token inválido o vencido' } }, 401),
    );

    await expect(api.get('/dashboard')).rejects.toBeInstanceOf(ErrorApi);
    expect(leerToken()).toBeNull();
  });
});

describe('auth.entrar', () => {
  it('guarda el token devuelto por la API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock({
        data: {
          token: 'token-nuevo',
          usuario: { usuario_id: 1, nombre: 'Ana', email: 'a@b.do', rol: 'admin', activo: true },
        },
      }),
    );

    const r = await auth.entrar('a@b.do', 'Clave123!');

    expect(r.token).toBe('token-nuevo');
    expect(leerToken()).toBe('token-nuevo');
  });

  it('no guarda token si las credenciales son incorrectas', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock({ error: { message: 'Credenciales inválidas' } }, 401),
    );

    await expect(auth.entrar('a@b.do', 'mala')).rejects.toBeInstanceOf(ErrorApi);
    expect(leerToken()).toBeNull();
  });
});

describe('listar', () => {
  it('desenvuelve filas y metadatos de paginación', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respuestaMock({
        data: [{ estudiante_id: 1, primer_nombre: 'Ana' }],
        meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
      }),
    );

    const r = await listar('estudiantes', { page: 1 });

    expect(r.filas).toHaveLength(1);
    expect(r.meta.total).toBe(1);
    expect(r.meta.pageSize).toBe(15);
  });
});
