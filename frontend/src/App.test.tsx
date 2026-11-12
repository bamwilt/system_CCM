import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { SesionProvider } from './context/SesionContexto';
import App from './App';

/**
 * ============================================================================
 * PRUEBAS DE INTERFAZ (FASE 9)
 * ============================================================================
 *
 * El PM pide: "Realizar pruebas de navegacion, formularios, mensajes y tareas
 * administrativas. Documentar problemas encontrados y las correcciones
 * realizadas."
 *
 * Aqui se prueban exactamente esos cuatro aspectos, contra los componentes
 * reales (sin mockear la logica de presentacion). La capa HTTP si se mockea:
 * son pruebas de interfaz, no de integracion con el backend.
 */

vi.mock('axios', () => {
  const instancia = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: {} },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  return {
    default: {
      create: () => instancia,
      isAxiosError: () => false,
      __instancia: instancia,
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const axiosMock = (await import('axios')).default as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const http = axiosMock.__instancia as any;

function renderConRutas(rutaInicial: string, ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <SesionProvider>{ui}</SesionProvider>
    </MemoryRouter>
  );
}

/**
 * Mock por URL. Al montar, la aplicacion consulta `/auth/me` para restaurar la
 * sesion: este helper responde 401 por defecto a esa ruta (no hay sesion) y
 * delega el resto en `respuestaReporte`. Sin el, el efecto de restauracion
 * consumiria el primer mock pensado para los reportes.
 */
// OJO: no resetea `post`. Las pruebas fijan su mock de login ANTES de llamar
// esta funcion, y un reset aqui lo borraria. `beforeEach` ya limpia `post`.
function mockearHttp(respuestaReporte: unknown) {
  http.get.mockReset();
  http.get.mockImplementation((url: unknown) => {
    const ruta = String(url);
    if (ruta.includes('/auth/me')) {
      return Promise.reject({ response: { status: 401, data: {} } });
    }
    return Promise.resolve({ data: respuestaReporte });
  });
  window.sessionStorage.clear();
}

beforeEach(() => {
  mockearHttp({});
});

// ---------------------------------------------------------------------------
// NAVEGACION
// ---------------------------------------------------------------------------

describe('navegacion', () => {
  it('sin sesion redirige a /login', async () => {
    renderConRutas('/', <App />);
    expect(await screen.findByRole('heading', { name: /inicio de sesion/i })).toBeTruthy();
  });

  it('la navegacion principal solo muestra los modulos con permiso', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-1', userId: 1, email: 'admin@x.com', nombre: 'Admin', grants: ['estudiantes:read'] },
    });
    renderConRutas('/', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'admin@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /navegacion principal/i })).toBeTruthy();
    });
    // Tiene estudiantes:read -> ve Estudiantes en la navegacion principal.
    const nav = screen.getByRole('navigation', { name: /navegacion principal/i });
    expect(nav.querySelector('a[href="/estudiantes"]')).toBeTruthy();
    // NO tiene pagos:manage ni reportes:read -> no se ofrecen en la nav.
    expect(nav.querySelector('a[href="/cobro"]')).toBeNull();
    expect(nav.querySelector('a[href="/reportes"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FORMULARIOS
// ---------------------------------------------------------------------------

describe('formularios', () => {
  it('el boton de ingreso permanece deshabilitado hasta completar los campos', async () => {
    renderConRutas('/login', <App />);
    const boton = screen.getByRole('button', { name: /ingresar/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'admin@x.com' } });
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    expect(boton.disabled).toBe(false);
  });

  it('no envia el cobro si el monto no es un importe valido', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-2', userId: 1, email: 'caj@x.com', nombre: 'Caj', grants: ['pagos:manage'] },
    });
    renderConRutas('/cobro', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'caj@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    const confirmar = await screen.findByRole('button', { name: /confirmar cobro/i });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/matricula/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^monto$/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText(/fecha efectiva/i), { target: { value: '2026-03-10' } });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
  });

  it('pide confirmacion explicita antes de afectar saldos', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-3', userId: 1, email: 'caj@x.com', nombre: 'Caj', grants: ['pagos:manage'] },
    });
    renderConRutas('/cobro', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'caj@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    fireEvent.change(await screen.findByLabelText(/matricula/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^monto$/i), { target: { value: '1500.00' } });
    fireEvent.change(screen.getByLabelText(/fecha efectiva/i), { target: { value: '2026-03-10' } });

    fireEvent.click(screen.getByRole('button', { name: /confirmar cobro/i }));

    // El dialogo aparece y AUN no se envio nada.
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toBeTruthy();
    expect(screen.getByText(/afecta los saldos/i)).toBeTruthy();
    expect(http.post).not.toHaveBeenCalledWith('/pagos', expect.anything(), expect.anything());

    // Cancelar no envia.
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(http.post).not.toHaveBeenCalledWith('/pagos', expect.anything(), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// MENSAJES
// ---------------------------------------------------------------------------

describe('mensajes', () => {
  it('un login fallido muestra el error del backend de forma accesible', async () => {
    http.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { error: { message: 'Credenciales invalidas' } } },
    });
    renderConRutas('/login', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'mal@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Credenciales invalidas');
  });

  it('la recaudacion se muestra con importes como texto exacto, sin recalcular', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-4', userId: 1, email: 'dir@x.com', nombre: 'Dir', grants: ['reportes:read'] },
    });
    mockearHttp({
      filas: [{ dia: '2026-03-05', operaciones: 2, total: '1234.50', anuladas: 1, total_anulado: '100.00' }],
      total: 1,
    });
    renderConRutas('/', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'dir@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    // El importe aparece EXACTO, no redondeado ni reformateado por la interfaz.
    expect(await screen.findByText('1234.50')).toBeTruthy();
    expect(screen.getByText('2026-03-05')).toBeTruthy();
  });

  it('un reporte sin filas muestra un estado vacio explicito', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-5', userId: 1, email: 'dir@x.com', nombre: 'Dir', grants: ['reportes:read'] },
    });
    mockearHttp({ filas: [], total: 0 });
    renderConRutas('/reportes', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'dir@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText(/no devolvio filas/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PERMISOS Y TAREAS ADMINISTRATIVAS
// ---------------------------------------------------------------------------

describe('permisos', () => {
  it('sin pagos:manage la pantalla de cobro no muestra el formulario', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-6', userId: 1, email: 'lec@x.com', nombre: 'Lec', grants: ['estudiantes:read'] },
    });
    renderConRutas('/cobro', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'lec@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText(/no tiene permiso para registrar cobros/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirmar cobro/i })).toBeNull();
  });

  it('sin reportes:read el panel lo indica y no intenta cargar el reporte', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-7', userId: 1, email: 'caj@x.com', nombre: 'Caj', grants: ['pagos:manage'] },
    });
    renderConRutas('/', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'caj@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText(/no tiene permiso para ver reportes/i)).toBeTruthy();
    // La unica consulta es la de restauracion de sesion; ningun reporte.
    const rutas = http.get.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(rutas.every((r: string) => r.includes("/auth/me"))).toBe(true);
  });

  it('todas las tablas exponen encabezados con scope="col"', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-8', userId: 1, email: 'dir@x.com', nombre: 'Dir', grants: ['reportes:read'] },
    });
    mockearHttp({
      filas: [{ dia: '2026-03-05', operaciones: 1, total: '10.00', anuladas: 0, total_anulado: '0.00' }],
      total: 1,
    });
    renderConRutas('/', <App />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'dir@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    const encabezados = await screen.findAllByRole('columnheader');
    expect(encabezados.length).toBeGreaterThan(0);
    for (const encabezado of encabezados) {
      expect(encabezado.getAttribute('scope')).toBe('col');
    }
  });
});

// ---------------------------------------------------------------------------
// COMPLETADO DE FASE 9: sesion persistente, tutores y nueva matricula
// ---------------------------------------------------------------------------

describe('sesion persistente tras recarga', () => {
  it('restaura la sesion y los permisos consultando /auth/me al montar', async () => {
    http.get.mockImplementation((url: unknown) => {
      if (String(url).includes('/auth/me')) {
        return Promise.resolve({
          data: {
            userId: 7,
            email: 'dir@x.com',
            nombre: 'Dir',
            grants: ['matriculas:manage', 'matriculas:read', 'estudiantes:read'],
            csrfToken: 'csrf-restaurada',
          },
        });
      }
      return Promise.resolve({ data: { filas: [], total: 0 } });
    });

    renderConRutas('/', <App />);

    // Con sesion restaurada NO se muestra el login: se va directo al panel.
    const nav = await screen.findByRole('navigation', { name: /navegacion principal/i });
    expect(nav.querySelector('a[href="/matriculas/nueva"]')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /inicio de sesion/i })).toBeNull();
  });

  it('si /auth/me responde 401, se muestra el inicio de sesion', async () => {
    mockearHttp({});
    renderConRutas('/', <App />);
    expect(await screen.findByRole('heading', { name: /inicio de sesion/i })).toBeTruthy();
  });

  it('el token CSRF devuelto por /auth/me queda disponible para mutaciones', async () => {
    http.get.mockImplementation((url: unknown) => {
      if (String(url).includes('/auth/me')) {
        return Promise.resolve({
          data: { userId: 1, email: 'a@x.com', nombre: 'A', grants: [], csrfToken: 'csrf-restaurada' },
        });
      }
      return Promise.resolve({ data: { filas: [], total: 0 } });
    });
    renderConRutas('/', <App />);
    await screen.findByRole('navigation', { name: /navegacion principal/i });
    expect(window.sessionStorage.getItem('sgpm.csrfToken')).toBe('csrf-restaurada');
  });
});

describe('nueva matricula', () => {
  it('el numero de cuotas lo decide la cantidad de fechas: no hay valor por defecto', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'c', userId: 1, email: 'a@x.com', nombre: 'A', grants: ['matriculas:manage'] },
    });
    mockearHttp({ anios: [], grados: [], tarifas: [] });
    renderConRutas('/matriculas/nueva', <App />);

    fireEvent.change(await screen.findByLabelText(/correo/i), { target: { value: 'a@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    const crear = await screen.findByRole('button', { name: /crear matricula/i });
    // Sin fechas no se puede crear.
    expect((crear as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/estudiante/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/anio lectivo/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^grado$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/tarifa/i), { target: { value: '1' } });
    expect((crear as HTMLButtonElement).disabled).toBe(true);

    // Dos fechas = dos cuotas. El boton se habilita.
    fireEvent.change(screen.getByLabelText(/fechas de vencimiento/i), {
      target: { value: '2026-03-10, 2026-04-10' },
    });
    expect((crear as HTMLButtonElement).disabled).toBe(false);
  });

  it('rechaza fechas irreales, desordenadas o repetidas en el navegador', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'c', userId: 1, email: 'a@x.com', nombre: 'A', grants: ['matriculas:manage'] },
    });
    mockearHttp({ anios: [], grados: [], tarifas: [] });
    renderConRutas('/matriculas/nueva', <App />);

    fireEvent.change(await screen.findByLabelText(/correo/i), { target: { value: 'a@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    fireEvent.change(await screen.findByLabelText(/estudiante/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/anio lectivo/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^grado$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/tarifa/i), { target: { value: '1' } });
    const crear = screen.getByRole('button', { name: /crear matricula/i });

    for (const valor of ['2026-02-31', '2026-04-10, 2026-03-10', '2026-03-10, 2026-03-10', 'no-es-fecha']) {
      fireEvent.change(screen.getByLabelText(/fechas de vencimiento/i), { target: { value: valor } });
      expect((crear as HTMLButtonElement).disabled, `debia rechazar ${valor}`).toBe(true);
    }
  });

  it('un descuento sin autorizador impide crear la matricula', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'c', userId: 1, email: 'a@x.com', nombre: 'A', grants: ['matriculas:manage'] },
    });
    mockearHttp({ anios: [], grados: [], tarifas: [] });
    renderConRutas('/matriculas/nueva', <App />);

    fireEvent.change(await screen.findByLabelText(/correo/i), { target: { value: 'a@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    fireEvent.change(await screen.findByLabelText(/estudiante/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/anio lectivo/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^grado$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/tarifa/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/fechas de vencimiento/i), {
      target: { value: '2026-03-10' },
    });
    fireEvent.change(screen.getByLabelText(/descuento autorizado/i), { target: { value: '10' } });

    // Con descuento y sin autorizador el boton NO se habilita: se previene el
    // error en el origen en lugar de fallar despues de confirmar.
    const crear = screen.getByRole('button', { name: /crear matricula/i });
    expect((crear as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('autoriza');

    // Al indicar el autorizador se habilita.
    fireEvent.change(screen.getByLabelText(/autorizado por/i), { target: { value: 'Direccion' } });
    expect((crear as HTMLButtonElement).disabled).toBe(false);
    expect(http.post).not.toHaveBeenCalledWith('/matriculas', expect.anything(), expect.anything());
  });
});

describe('tutores', () => {
  it('sin tutores:manage la pantalla lo indica y no muestra la tabla', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'c', userId: 1, email: 'l@x.com', nombre: 'L', grants: ['estudiantes:read'] },
    });
    mockearHttp({ tutores: [] });
    renderConRutas('/tutores', <App />);

    fireEvent.change(await screen.findByLabelText(/correo/i), { target: { value: 'l@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText(/no tiene permiso para consultar tutores/i)).toBeTruthy();
  });

  it('con tutores:manage lista los tutores con encabezados accesibles', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'c', userId: 1, email: 't@x.com', nombre: 'T', grants: ['tutores:manage'] },
    });
    mockearHttp({
      tutores: [
        { id: 1, nombres: 'Maria', apellidos: 'Perez', documento_identidad: '001', telefono: '8888', email: null, parentesco: 'Madre', activo: true },
      ],
      total: 1,
    });
    renderConRutas('/tutores', <App />);

    fireEvent.change(await screen.findByLabelText(/correo/i), { target: { value: 't@x.com' } });
    fireEvent.change(screen.getByLabelText(/contrasena/i), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText('001')).toBeTruthy();
    const encabezados = screen.getAllByRole('columnheader');
    expect(encabezados.length).toBeGreaterThan(0);
    for (const h of encabezados) {
      expect(h.getAttribute('scope')).toBe('col');
    }
  });
});
