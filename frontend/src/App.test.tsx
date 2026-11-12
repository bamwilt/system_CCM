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

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  window.sessionStorage.clear();
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
    http.get.mockResolvedValueOnce({
      data: { filas: [{ dia: '2026-03-05', operaciones: 2, total: '1234.50', anuladas: 1, total_anulado: '100.00' }], total: 1 },
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
    http.get.mockResolvedValue({ data: { filas: [], total: 0 } });
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
    expect(http.get).not.toHaveBeenCalled();
  });

  it('todas las tablas exponen encabezados con scope="col"', async () => {
    http.post.mockResolvedValueOnce({
      data: { csrfToken: 'csrf-8', userId: 1, email: 'dir@x.com', nombre: 'Dir', grants: ['reportes:read'] },
    });
    http.get.mockResolvedValueOnce({
      data: { filas: [{ dia: '2026-03-05', operaciones: 1, total: '10.00', anuladas: 0, total_anulado: '0.00' }], total: 1 },
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
