import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tabla } from '../componentes/Tabla';
import { Formulario } from '../componentes/Formulario';
import { ProveedorAuth } from '../contexto/AuthContext';
import type { ConfiguracionModulo } from '../config/modulos';
import { MODULOS } from '../config/modulos';

/**
 * Pruebas de los dos componentes que concentran la lógica de pantalla.
 *
 * Los tres casos cubren defectos reales encontrados al integrar con la API:
 * el ordenamiento enviaba la clave de la columna en vez de la de la API, y el
 * formulario descartaba las claves primarias que la API exige en el alta.
 */

const meta = { page: 1, pageSize: 15, total: 2, totalPages: 1 };

/**
 * Monta con una sesión de administración activa.
 *
 * `Formulario` consulta `useAuth` y con `puedeEditar === false` se dibuja en
 * solo lectura (sin botón de guardar), así que las pruebas de envío necesitan
 * que el proveedor revalide un token contra `/auth/yo`.
 */
function ConAuth({ children }: { children: ReactNode }) {
  return <ProveedorAuth>{children}</ProveedorAuth>;
}

/** Botón de envío: en alta dice «Crear <singular>», en edición «Guardar cambios». */
function botonEnviar(nombre: RegExp) {
  return screen.findByRole('button', { name: nombre });
}

const USUARIO_ADMIN = {
  usuario_id: 1,
  nombre: 'Administrador',
  email: 'admin@ccm.do',
  rol: 'admin' as const,
  activo: true,
};

beforeEach(() => {
  localStorage.setItem('ccm.token', 'token-de-prueba');
  vi.mocked(fetch).mockImplementation((entrada: RequestInfo | URL) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (url.includes('/auth/yo')) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: USUARIO_ADMIN }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  });
});

function mod(modulo: string): ConfiguracionModulo {
  const encontrado = MODULOS.find((m) => m.modulo === modulo);
  if (!encontrado) throw new Error(`módulo inexistente: ${modulo}`);
  return encontrado;
}

function montarTabla(over: Partial<Parameters<typeof Tabla>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Tabla
        mod={mod('estudiantes')}
        filas={[
          { estudiante_id: 1, primer_nombre: 'Ana', primer_apellido: 'Reyes' },
          { estudiante_id: 2, primer_nombre: 'Luis', primer_apellido: 'Cruz' },
        ]}
        meta={meta}
        cargando={false}
        ordenPor="apellido"
        direccion="asc"
        alOrdenar={vi.fn()}
        alPaginar={vi.fn()}
        {...over}
      />
    </MemoryRouter>,
  );
}

describe('Tabla · ordenamiento', () => {
  it('envía la clave que espera la API, no el nombre de la columna', async () => {
    const alOrdenar = vi.fn();
    const usuario = userEvent.setup();
    montarTabla({ alOrdenar });

    // La columna visible se llama `primer_apellido`, pero la API ordena por
    // `apellido`: mandar la primera devolvía 400.
    await usuario.click(screen.getByRole('columnheader', { name: /apellidos/i }));

    expect(alOrdenar).toHaveBeenCalledWith('apellido');
  });

  it('marca como activa la columna equivalente a la clave de la API', () => {
    montarTabla({ ordenPor: 'apellido' });

    expect(screen.getByRole('columnheader', { name: /apellidos/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('no hace ordenables las columnas sin equivalente en la API', async () => {
    const alOrdenar = vi.fn();
    const usuario = userEvent.setup();
    montarTabla({ alOrdenar });

    // `tutor_nombre` viene de un JOIN y no está en `ordenables`: la API lo
    // rechaza, así que la columna no debe presentarse como ordenable.
    const th = screen.getByRole('columnheader', { name: /^tutor$/i });
    expect(th).not.toHaveClass('ccm-ordenable');

    await usuario.click(th);
    expect(alOrdenar).not.toHaveBeenCalled();
  });

  it('muestra el rango de la paginación', () => {
    montarTabla({ meta: { page: 2, pageSize: 15, total: 40, totalPages: 3 } });

    expect(screen.getByText(/mostrando/i)).toHaveTextContent('16');
  });

  it('avisa cuando no hay resultados de una búsqueda', () => {
    montarTabla({ filas: [], meta: { ...meta, total: 0 }, busqueda: 'zzz' });

    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument();
  });
});

describe('Formulario · campos clave', () => {
  it('envía `empleado_id`, que la API exige y la base no genera', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined);
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('docentes')} fila={null} alGuardar={alGuardar} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.type(screen.getByLabelText(/id de empleado/i), '9001');
    await usuario.type(screen.getByLabelText(/^código/i), '77');
    await usuario.type(screen.getByLabelText(/nombres/i), 'Marta');
    await usuario.type(screen.getByLabelText(/apellidos/i), 'Solís');
    // `empleados.cedula` es NOT NULL: sin ella el POST falla con un 400.
    await usuario.type(screen.getByLabelText(/cédula/i), '001-00-0000-1');
    await usuario.click(await botonEnviar(/crear docente/i));

    await waitFor(() => expect(alGuardar).toHaveBeenCalled());

    const [cuerpo, id] = alGuardar.mock.calls[0] as [Record<string, unknown>, number | null];
    expect(cuerpo.empleado_id).toBe(9001);
    expect(cuerpo.docente_codigo).toBe(77);
    expect(cuerpo.primer_nombre).toBe('Marta');
    expect(cuerpo.cedula).toBe('001-00-0000-1');
    expect(id).toBeNull();
  });

  it('exige el identificador antes de enviar', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined);
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('docentes')} fila={null} alGuardar={alGuardar} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.type(screen.getByLabelText(/^código/i), '77');
    await usuario.click(await botonEnviar(/crear docente/i));

    expect(await screen.findByText(/id de empleado es obligatorio/i)).toBeInTheDocument();
    expect(alGuardar).not.toHaveBeenCalled();
  });

  it('omite la clave primaria autogenerada de los demás módulos', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined);
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('clientes')} fila={null} alGuardar={alGuardar} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.type(screen.getByLabelText(/^nombre/i), 'Cliente Prueba');
    await usuario.click(await botonEnviar(/crear cliente/i));

    await waitFor(() => expect(alGuardar).toHaveBeenCalled());

    const [cuerpo] = alGuardar.mock.calls[0] as [Record<string, unknown>];
    // `clientes.cliente_id` tiene DEFAULT nextval: mandarlo haría fallar el POST.
    expect(cuerpo).not.toHaveProperty('cliente_id');
    expect(cuerpo.nombre).toBe('Cliente Prueba');
  });

  it('carga los valores de la fila al editar', () => {
    render(
      <ConAuth>
        <Formulario
          mod={mod('clientes')}
          fila={{ cliente_id: 5, nombre: 'Ana Reyes', email: 'ana@correo.do' }}
          alGuardar={vi.fn()}
          alCancelar={vi.fn()}
        />
      </ConAuth>,
    );

    expect(screen.getByLabelText(/^nombre/i)).toHaveValue('Ana Reyes');
    expect(screen.getByLabelText(/email/i)).toHaveValue('ana@correo.do');
  });

  it('no manda la clave primaria al editar', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined);
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario
          mod={mod('clientes')}
          fila={{ cliente_id: 5, nombre: 'Ana Reyes' }}
          alGuardar={alGuardar}
          alCancelar={vi.fn()}
        />
      </ConAuth>,
    );

    await usuario.click(await botonEnviar(/guardar cambios/i));

    await waitFor(() => expect(alGuardar).toHaveBeenCalled());
    const [cuerpo, id] = alGuardar.mock.calls[0] as [Record<string, unknown>, number | null];
    expect(cuerpo).not.toHaveProperty('cliente_id');
    expect(id).toBe(5);
  });

  it('valida el formato de email antes de enviar', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined);
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('clientes')} fila={null} alGuardar={alGuardar} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.type(screen.getByLabelText(/^nombre/i), 'Cliente');
    await usuario.type(screen.getByLabelText(/email/i), 'no-es-email');
    await usuario.click(await botonEnviar(/crear cliente/i));

    expect(await screen.findByText(/email no es un email válido/i)).toBeInTheDocument();
    expect(alGuardar).not.toHaveBeenCalled();
  });

  it('asocia el mensaje de error a su campo para lectores de pantalla', async () => {
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('clientes')} fila={null} alGuardar={vi.fn()} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.click(await botonEnviar(/crear cliente/i));

    const campo = screen.getByLabelText(/^nombre/i);
    const mensaje = await screen.findByText(/nombre es obligatorio/i);

    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo.getAttribute('aria-describedby')).toContain(mensaje.id);
  });

  it('borra el error del campo en cuanto el usuario lo corrige', async () => {
    const usuario = userEvent.setup();

    render(
      <ConAuth>
        <Formulario mod={mod('clientes')} fila={null} alGuardar={vi.fn()} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    await usuario.click(await botonEnviar(/crear cliente/i));
    expect(await screen.findByText(/nombre es obligatorio/i)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText(/^nombre/i), 'Ana');

    await waitFor(() =>
      expect(screen.queryByText(/nombre es obligatorio/i)).not.toBeInTheDocument(),
    );
  });

  it('omite del formulario las columnas marcadas como solo tabla', () => {
    render(
      <ConAuth>
        <Formulario mod={mod('matriculas')} fila={null} alGuardar={vi.fn()} alCancelar={vi.fn()} />
      </ConAuth>,
    );

    // `estudiante_nombre` es un JOIN para mostrar en la tabla, no un dato a enviar.
    expect(screen.queryByLabelText(/estudiante \(nombre\)/i)).not.toBeInTheDocument();
  });
});

describe('Tabla · estados', () => {
  it('oculta la columna de acciones cuando no hay manejadores', () => {
    montarTabla();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('muestra editar y eliminar cuando se pueden usar', () => {
    montarTabla({ alEditar: vi.fn(), alBorrar: vi.fn() });
    // Un botón por fila.
    expect(screen.getAllByRole('button', { name: /editar/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /eliminar/i })).toHaveLength(2);
  });

  it('numera las filas por su clave primaria', () => {
    const { container } = montarTabla();
    const filas = within(container).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
  });
});
