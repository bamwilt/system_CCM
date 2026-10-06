import { useCallback, useEffect, useRef, useState } from 'react';
import { crear, editar, eliminar, listar } from '../api/recursos';
import type { OpcionesListado } from '../api/recursos';
import { ErrorApi } from '../api/cliente';
import { MODULOS, type Columna, type ConfiguracionModulo } from '../config/modulos';
import { useAuth } from '../contexto/AuthContext';
import { useCatalogo } from '../contexto/CatalogosContext';
import type { Fila, MetaPaginacion } from '../api/tipos';
import { Alerta } from '../componentes/Alerta';
import { Formulario } from '../componentes/Formulario';
import { IconoBuscar, IconoMas } from '../componentes/Iconos';
import { Modal } from '../componentes/Modal';
import { Tabla } from '../componentes/Tabla';
import type { DireccionOrden } from '../componentes/Tabla';

/**
 * Pantalla genérica de CRUD.
 *
 * Una sola implementación sirve para los ocho módulos: el catálogo de módulos
 * dice qué columnas mostrar y la API decide qué se puede hacer según el rol.
 */

const TAM_PAGINA = 15;

interface Props {
  modulo: string;
}

export function PaginaModulo({ modulo }: Props) {
  const mod = MODULOS.find((m) => m.modulo === modulo);
  const { puedeEditar } = useAuth();

  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);
  const [ordenPor, setOrdenPor] = useState(mod?.ordenInicial?.columna ?? '');
  const [direccion, setDireccion] = useState<DireccionOrden>(mod?.ordenInicial?.direccion ?? 'asc');

  // Se guarda la consulta pedida junto a su respuesta. Asi `cargando` se deriva
  // comparando ambas claves, en vez de escribir un booleano desde el efecto
  // (lo que genera un render adicional en cascada).
  const [resultado, setResultado] = useState<{
    clave: string;
    filas: Fila[];
    meta: MetaPaginacion;
  } | null>(null);
  const [clavePedida, setClavePedida] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [aBorrar, setABorrar] = useState<Fila | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState('');
  const [dependientes, setDependientes] = useState<Record<string, number> | undefined>();

  // Evita que una respuesta lenta de una búsqueda anterior pise la actual.
  const peticionActual = useRef<AbortController | null>(null);
  const temporizadorBusqueda = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(
    async (opciones: OpcionesListado) => {
      peticionActual.current?.abort();
      const control = new AbortController();
      peticionActual.current = control;

      const clave = serializar(opciones);
      setClavePedida(clave);

      try {
        const r = await listar(modulo, opciones, control.signal);
        setResultado({ clave, filas: r.filas, meta: r.meta });
        setError('');
      } catch (err) {
        // Una petición cancelada no es un error para el usuario.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos');
      }
    },
    [modulo],
  );

  // Recarga cuando cambia cualquier parámetro de la consulta.
  //
  // Este efecto escribe estado, y es intencional: es el patrón "datos en
  // respuesta a parámetros" (búsqueda, orden, filtros, página). La alternativa
  // sería pedir los datos desde cada manejador de evento, pero entonces no se
  // recargarían al volver atrás en el historial ni al cambiar el orden por URL.
  useEffect(() => {
    const opciones: OpcionesListado = {
      q: busquedaAplicada || undefined,
      page: pagina,
      pageSize: TAM_PAGINA,
    };
    if (ordenPor) {
      opciones.orderBy = ordenPor;
      opciones.sort = direccion;
    }
    // Los filtros sin valor no se envían.
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== '') opciones[clave] = valor;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(opciones);
    // `cargar` ya cambia cuando cambia `modulo`, y el resto son primitivas.
  }, [cargar, busquedaAplicada, pagina, ordenPor, direccion, filtros]);

  // Limpieza al salir de la pantalla.
  useEffect(
    () => () => {
      peticionActual.current?.abort();
      if (temporizadorBusqueda.current) clearTimeout(temporizadorBusqueda.current);
    },
    [],
  );

  const cargando = resultado?.clave !== clavePedida;
  const filas = resultado?.filas ?? [];
  const meta: MetaPaginacion = resultado?.meta ?? {
    page: 1,
    pageSize: TAM_PAGINA,
    total: 0,
    totalPages: 1,
  };

  if (!mod) {
    return (
      <div className="ccm-pagina">
        <p>No se encontró el módulo «{modulo}».</p>
      </div>
    );
  }

  // La búsqueda se aplica con retardo para no pedir en cada tecla.
  const alEscribirBusqueda = (valor: string) => {
    setBusqueda(valor);
    if (temporizadorBusqueda.current) clearTimeout(temporizadorBusqueda.current);
    temporizadorBusqueda.current = setTimeout(() => {
      setBusquedaAplicada(valor);
      setPagina(1);
    }, 350);
  };

  /** Alterna asc/desc si se ordena por la misma columna; si no, empieza asc. */
  const alOrdenar = (claveApi: string) => {
    setPagina(1);
    if (claveApi === ordenPor) {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenPor(claveApi);
      setDireccion('asc');
    }
  };

  const cambiarFiltro = (clave: string, valor: string) => {
    setFiltros((prev) => ({ ...prev, [clave]: valor }));
    setPagina(1);
  };

  const abrirCrear = () => {
    setEditando(null);
    setModalAbierto(true);
  };

  const abrirEditar = (fila: Fila) => {
    setEditando(fila);
    setModalAbierto(true);
  };

  const guardar = async (valores: Record<string, unknown>, id: number | null) => {
    if (id === null) {
      await crear(modulo, valores);
      setAviso(`${capitalizar(mod.singular)} creado correctamente.`);
    } else {
      await editar(modulo, id, valores);
      setAviso('Cambios guardados correctamente.');
    }
    setModalAbierto(false);
    setEditando(null);
    // Vuelve a la página 1: si se filtraba, el registro nuevo puede no estar
    // visible en la página actual.
    setPagina(1);
    await cargar({
      q: busquedaAplicada || undefined,
      page: 1,
      pageSize: TAM_PAGINA,
      orderBy: ordenPor || undefined,
      sort: ordenPor ? direccion : undefined,
      ...filtrosVacios(filtros),
    });
  };

  /** Ejecuta el borrado. Con `cascade`, fuerza la confirmación extendida. */
  const confirmarBorrado = async (cascade = false) => {
    if (!aBorrar) return;
    const id = Number(aBorrar[mod.pk]);

    setBorrando(true);
    setErrorBorrado('');
    setDependientes(undefined);

    try {
      await eliminar(modulo, id, cascade);
      setAviso(`${capitalizar(mod.singular)} eliminado.`);
      setABorrar(null);
      await cargar({
        q: busquedaAplicada || undefined,
        page: pagina,
        pageSize: TAM_PAGINA,
        orderBy: ordenPor || undefined,
        sort: ordenPor ? direccion : undefined,
        ...filtrosVacios(filtros),
      });
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409) {
        // La API bloquea el borrado si hay registros dependientes.
        setErrorBorrado(err.message);
        setDependientes(err.dependientes);
      } else {
        setErrorBorrado(err instanceof Error ? err.message : 'No se pudo eliminar');
      }
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="ccm-pagina">
      <header
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <h1 className="ccm-pagina-titulo">{mod.titulo}</h1>
          <p className="ccm-pagina-descripcion">{mod.descripcion}</p>
        </div>
        {puedeEditar && (
          <button type="button" className="ccm-btn ccm-btn-primario" onClick={abrirCrear}>
            <IconoMas tam={16} />
            Nuevo {mod.singular}
          </button>
        )}
      </header>

      {aviso && (
        <div style={{ marginTop: 16 }}>
          <Alerta tono="exito" alCerrar={() => setAviso('')}>
            {aviso}
          </Alerta>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16 }}>
          <Alerta tono="error" alCerrar={() => setError('')}>
            {error}
          </Alerta>
        </div>
      )}

      <div className="ccm-panel" style={{ marginTop: 16 }}>
        <div className="ccm-barra">
          <div className="ccm-barra-buscador">
            <IconoBuscar tam={16} />
            <input
              className="ccm-input"
              type="search"
              value={busqueda}
              onChange={(e) => alEscribirBusqueda(e.target.value)}
              placeholder={mod.placeholderBusqueda ?? 'Buscar…'}
              aria-label={`Buscar en ${mod.titulo}`}
            />
          </div>

          {mod.filtros?.map((filtro) => (
            <Filtro
              key={filtro.clave}
              filtro={filtro}
              valor={filtros[filtro.clave] ?? ''}
              alCambiar={(v) => cambiarFiltro(filtro.clave, v)}
            />
          ))}
        </div>

        <Tabla
          mod={mod}
          filas={filas}
          meta={meta}
          cargando={cargando}
          ordenPor={ordenPor}
          direccion={direccion}
          alOrdenar={alOrdenar}
          alPaginar={setPagina}
          {...(puedeEditar ? { alEditar: abrirEditar, alBorrar: setABorrar } : {})}
          busqueda={busquedaAplicada}
        />
      </div>

      <Modal
        abierto={modalAbierto}
        titulo={editando ? `Editar ${mod.singular}` : `Nuevo ${mod.singular}`}
        alCerrar={() => setModalAbierto(false)}
      >
        {modalAbierto && (
          <Formulario
            mod={mod}
            fila={editando}
            alGuardar={guardar}
            alCancelar={() => setModalAbierto(false)}
          />
        )}
      </Modal>

      <Modal
        abierto={Boolean(aBorrar)}
        titulo="Confirmar borrado"
        ancho="angosto"
        alCerrar={() => {
          setABorrar(null);
          setErrorBorrado('');
          setDependientes(undefined);
        }}
        pie={
          <>
            <button
              type="button"
              className="ccm-btn ccm-btn-secundario"
              onClick={() => setABorrar(null)}
              disabled={borrando}
            >
              Cancelar
            </button>
            {dependientes && (
              <button
                type="button"
                className="ccm-btn ccm-btn-peligro"
                onClick={() => void confirmarBorrado(true)}
                disabled={borrando}
              >
                {borrando ? 'Eliminando…' : 'Eliminar todo'}
              </button>
            )}
            <button
              type="button"
              className="ccm-btn ccm-btn-peligro"
              onClick={() => void confirmarBorrado(false)}
              disabled={borrando}
            >
              {borrando ? 'Eliminando…' : 'Eliminar'}
            </button>
          </>
        }
      >
        {aBorrar && (
          <>
            <p>
              ¿Seguro que querés eliminar <strong>{etiquetaFila(mod, aBorrar)}</strong>?
            </p>
            {errorBorrado && (
              <div style={{ marginTop: 14 }}>
                <Alerta tono="error" titulo="No se pudo eliminar:" detalles={dependientes}>
                  {errorBorrado}
                </Alerta>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/** Clave estable de una consulta, para comparar qué se está mostrando. */
function serializar(opciones: OpcionesListado): string {
  const partes = Object.entries(opciones)
    .filter(([, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`);
  return partes.join('&');
}

/** Descarta los filtros vacíos antes de mandarlos a la API. */
function filtrosVacios(filtros: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ''));
}

/** Controles de filtro según el tipo de columna. */
function Filtro({
  filtro,
  valor,
  alCambiar,
}: {
  filtro: Columna;
  valor: string;
  alCambiar: (v: string) => void;
}) {
  const id = `filtro-${filtro.clave}`;

  if (filtro.tipo === 'seleccion' && filtro.catalogo) {
    return <FiltroCatalogo id={id} filtro={filtro} valor={valor} alCambiar={alCambiar} />;
  }

  if (filtro.tipo === 'seleccion' && filtro.opciones) {
    return (
      <select
        id={id}
        className="ccm-select ccm-barra-filtro"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-label={`Filtrar por ${filtro.etiqueta}`}
      >
        <option value="">Todos</option>
        {filtro.opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    );
  }

  if (filtro.tipo === 'booleano') {
    return (
      <select
        id={id}
        className="ccm-select ccm-barra-filtro"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-label={`Filtrar por ${filtro.etiqueta}`}
      >
        <option value="">Todos</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <input
      id={id}
      className="ccm-input ccm-barra-filtro"
      type="text"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      placeholder={`Filtrar por ${filtro.etiqueta.toLowerCase()}`}
      aria-label={`Filtrar por ${filtro.etiqueta}`}
    />
  );
}

function FiltroCatalogo({
  id,
  filtro,
  valor,
  alCambiar,
}: {
  id: string;
  filtro: Columna;
  valor: string;
  alCambiar: (v: string) => void;
}) {
  const items = useCatalogo(filtro.catalogo!);

  return (
    <select
      id={id}
      className="ccm-select ccm-barra-filtro"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      aria-label={`Filtrar por ${filtro.etiqueta}`}
    >
      <option value="">Todos</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.etiqueta}
        </option>
      ))}
    </select>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Nombre legible de una fila para el diálogo de confirmación.
 *
 * Se busca la primera columna de texto visible (el nombre o el título) y, si no
 * hay ninguna, se cae al identificador, que siempre existe.
 */
function etiquetaFila(mod: ConfiguracionModulo, fila: Fila): string {
  const nombre = mod.columnas.find((c) => !c.soloFormulario && c.tipo === 'texto' && fila[c.clave]);
  if (nombre) return String(fila[nombre.clave]);
  return `#${String(fila[mod.pk])}`;
}
