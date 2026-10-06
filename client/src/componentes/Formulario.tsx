import { useMemo, useState } from 'react';
import type { ConfiguracionModulo, Columna } from '../config/modulos';
import { useCatalogo } from '../contexto/CatalogosContext';
import { useAuth } from '../contexto/AuthContext';
import { aInputFecha, valorDesdeFila, valorParaApi } from './formato';
import { ErrorApi } from '../api/cliente';
import type { Fila, ItemCatalogo } from '../api/tipos';

/**
 * Formulario dinámico construido a partir de la configuración del módulo.
 *
 * Las reglas de validación del cliente replican los `varchar` del esquema y el
 * formato de fecha, para avisar sin ida y vuelta a la API. La API sigue siendo
 * la autoridad: lo que llega en `error.detalles` se muestra por campo.
 */

interface PropsFormulario {
  mod: ConfiguracionModulo;
  /** Fila en edición, o `null` para crear uno nuevo. */
  fila: Fila | null;
  alGuardar: (valores: Record<string, unknown>, id: number | null) => Promise<void>;
  alCancelar: () => void;
}

type Valores = Record<string, string | boolean>;

function valoresIniciales(mod: ConfiguracionModulo, fila: Fila | null): Valores {
  const valores: Valores = {};
  for (const columna of mod.columnas) {
    if (columna.autogenerada) continue;
    const deFila = fila ? valorDesdeFila(fila[columna.clave], columna) : '';
    const defecto = columna.porDefecto ?? (columna.tipo === 'booleano' ? false : '');
    // El estado del formulario es string | boolean; un `porDefaccion` numérico
    // se guarda como texto y se convierte al enviar.
    valores[columna.clave] =
      deFila !== '' ? deFila : typeof defecto === 'number' ? String(defecto) : defecto;
  }
  return valores;
}

type Errores = Record<string, string>;

function validar(mod: ConfiguracionModulo, valores: Valores): Errores {
  const errores: Errores = {};

  for (const columna of mod.columnas) {
    if (columna.autogenerada || columna.soloLectura) continue;
    const valor = valores[columna.clave];
    const texto = typeof valor === 'string' ? valor.trim() : '';

    if (columna.requerido && texto === '' && valor !== true) {
      errores[columna.clave] = `${columna.etiqueta} es obligatorio`;
      continue;
    }
    if (texto === '') continue;

    if (columna.tipo === 'numero') {
      const n = Number(texto);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        errores[columna.clave] = `${columna.etiqueta} debe ser un número entero`;
      } else if (n <= 0) {
        errores[columna.clave] = `${columna.etiqueta} debe ser mayor que 0`;
      }
    }

    if (columna.tipo === 'decimal') {
      const n = Number(texto);
      if (!Number.isFinite(n)) {
        errores[columna.clave] = `${columna.etiqueta} debe ser un número`;
      }
    }

    if (columna.max && texto.length > columna.max) {
      errores[columna.clave] = `${columna.etiqueta} no puede superar ${columna.max} caracteres`;
    }

    if (columna.tipo === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      errores[columna.clave] = `${columna.etiqueta} debe tener el formato AAAA-MM-DD`;
    }

    if (columna.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto)) {
      errores[columna.clave] = `${columna.etiqueta} no es un email válido`;
    }
  }

  return errores;
}

export function Formulario({ mod, fila, alGuardar, alCancelar }: PropsFormulario) {
  const [valores, setValores] = useState<Valores>(() => valoresIniciales(mod, fila));
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { puedeEditar } = useAuth();

  // Campos editables. Se descartan dos clases:
  //  - `soloLectura`: lo que calcula el servidor (promedio, nombres de JOIN...).
  //    No existe en la tabla, así que mandarlo haría fallar el INSERT.
  //  - `autogenerada`: la PK con DEFAULT nextval. Se puede mostrar en el
  //    listado, pero escribirla en el alta rompe la inserción.
  const campos = useMemo(
    () => mod.columnas.filter((c) => !c.soloLectura && !c.autogenerada),
    [mod],
  );

  const cambiar = (clave: string, valor: string | boolean) => {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    // El error del campo desaparece apenas el usuario lo corrige.
    setErrores((prev) => {
      if (!prev[clave]) return prev;
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorGeneral('');

    const encontrados = validar(mod, valores);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    // Solo se envían los campos declarados por la configuración, convertidos
    // al tipo que espera la API.
    const cuerpo: Record<string, unknown> = {};
    for (const columna of campos) {
      if (columna.clave in valores) {
        cuerpo[columna.clave] = valorParaApi(valores[columna.clave], columna.tipo);
      }
    }

    setEnviando(true);
    try {
      await alGuardar(cuerpo, fila ? Number(fila[mod.pk]) : null);
    } catch (err) {
      if (err instanceof ErrorApi && err.detalles) {
        setErrores(err.detalles);
      } else {
        setErrorGeneral(err instanceof Error ? err.message : 'Ocurrió un error inesperado');
      }
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate>
      {errorGeneral && (
        <p className="ccm-alerta ccm-alerta-error" role="alert" style={{ marginBottom: 15 }}>
          {errorGeneral}
        </p>
      )}

      <div className="ccm-rejilla">
        {campos.map((columna) => (
          <Campo
            key={columna.clave}
            columna={columna}
            valor={valores[columna.clave]}
            error={errores[columna.clave]}
            alCambiar={(v) => cambiar(columna.clave, v)}
          />
        ))}
      </div>

      <div
        className="ccm-modal-pie"
        style={{ padding: '19px 0 0', background: 'transparent', border: 'none' }}
      >
        <button type="button" className="ccm-btn ccm-btn-secundario" onClick={alCancelar}>
          Cancelar
        </button>
        <button
          type="submit"
          className="ccm-btn ccm-btn-primario"
          disabled={enviando || !puedeEditar}
        >
          {enviando ? 'Guardando…' : fila ? 'Guardar cambios' : `Crear ${mod.singular}`}
        </button>
      </div>
    </form>
  );
}

/** Un campo y su input, con etiqueta, ayuda y mensaje de error. */
function Campo({
  columna,
  valor,
  error,
  alCambiar,
}: {
  columna: Columna;
  valor: string | boolean | undefined;
  error: string | undefined;
  alCambiar: (v: string | boolean) => void;
}) {
  const id = `campo-${columna.clave}`;
  // Vincular el mensaje con `aria-describedby` es lo que hace que un lector de
  // pantalla anuncie el motivo del rechazo; sin esto el error es invisible para
  // quien no ve la pantalla.
  const idError = error ? `${id}-error` : undefined;
  const accesibilidad = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': idError,
  } as const;
  const anchoCompleto =
    columna.tipo === 'area' ||
    // Los pares de nombres se leen mejor si ocupan la fila entera.
    ['primer_nombre', 'primer_apellido', 'nombre_completo'].includes(columna.clave) ||
    columna.tipo === 'autoincremento';

  if (columna.tipo === 'autoincremento') {
    return (
      <div className="ccm-campo ccm-ancho-completo">
        <label className="ccm-campo-etiqueta" htmlFor={id}>
          {columna.etiqueta}
        </label>
        <input
          id={id}
          className={`ccm-input ${error ? 'ccm-error' : ''}`}
          type="number"
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => alCambiar(e.target.value)}
          placeholder="Se asigna automáticamente si se deja vacío"
          min={1}
          step={1}
          {...accesibilidad}
        />
        {error && (
          <span className="ccm-campo-error" id={idError}>
            {error}
          </span>
        )}
        {columna.ayuda && <span className="ccm-campo-ayuda">{columna.ayuda}</span>}
      </div>
    );
  }

  if (columna.tipo === 'booleano') {
    return (
      <div className="ccm-campo ccm-ancho-completo">
        <label className="ccm-checkbox" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={valor === true}
            onChange={(e) => alCambiar(e.target.checked)}
            {...accesibilidad}
          />
          <span className="ccm-campo-etiqueta" style={{ fontWeight: 500 }}>
            {columna.etiqueta}
          </span>
        </label>
        {error && (
          <span className="ccm-campo-error" id={idError}>
            {error}
          </span>
        )}
      </div>
    );
  }

  const texto = typeof valor === 'string' ? valor : '';

  if (columna.tipo === 'seleccion' && columna.catalogo) {
    return (
      <CampoSeleccion
        id={id}
        columna={columna}
        valor={texto}
        error={error}
        idError={idError}
        alCambiar={alCambiar}
      />
    );
  }

  if (columna.tipo === 'seleccion' && columna.opciones) {
    return (
      <div className={`ccm-campo ${anchoCompleto ? 'ccm-ancho-completo' : ''}`}>
        <label className="ccm-campo-etiqueta" htmlFor={id}>
          {columna.etiqueta}
          {columna.requerido && <span className="ccm-campo-requerido"> *</span>}
        </label>
        <select
          id={id}
          className={`ccm-select ${error ? 'ccm-error' : ''}`}
          value={texto}
          onChange={(e) => alCambiar(e.target.value)}
          {...accesibilidad}
        >
          <option value="">— Sin especificar —</option>
          {columna.opciones.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </select>
        {error ? (
          <span className="ccm-campo-error" id={idError}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const tipoInput =
    columna.tipo === 'fecha'
      ? 'date'
      : columna.tipo === 'email'
        ? 'email'
        : columna.tipo === 'numero' || columna.tipo === 'decimal'
          ? 'number'
          : 'text';

  const valorInput = columna.tipo === 'fecha' ? aInputFecha(texto) : texto;

  return (
    <div className={`ccm-campo ${anchoCompleto ? 'ccm-ancho-completo' : ''}`}>
      <label className="ccm-campo-etiqueta" htmlFor={id}>
        {columna.etiqueta}
        {columna.requerido && <span className="ccm-campo-requerido"> *</span>}
      </label>

      {columna.tipo === 'area' ? (
        <textarea
          id={id}
          className={`ccm-textarea ${error ? 'ccm-error' : ''}`}
          value={valorInput}
          maxLength={columna.max}
          onChange={(e) => alCambiar(e.target.value)}
          {...accesibilidad}
        />
      ) : (
        <input
          id={id}
          className={`ccm-input ${error ? 'ccm-error' : ''}`}
          type={tipoInput}
          value={valorInput}
          maxLength={columna.tipo === 'numero' ? undefined : columna.max}
          step={columna.tipo === 'decimal' ? '0.01' : undefined}
          onChange={(e) => alCambiar(e.target.value)}
          {...accesibilidad}
        />
      )}

      {error ? (
        <span className="ccm-campo-error" id={idError}>
          {error}
        </span>
      ) : (
        columna.ayuda && <span className="ccm-campo-ayuda">{columna.ayuda}</span>
      )}
    </div>
  );
}

/**
 * Desplegable poblado desde un catálogo.
 *
 * Cuando el catálogo no ha llegado todavía se muestra una opción de carga en
 * lugar de un select vacío, para que se vea que falta información en vez de
 * asumir que no hay datos.
 */
function CampoSeleccion({
  id,
  columna,
  valor,
  error,
  idError,
  alCambiar,
}: {
  id: string;
  columna: Columna;
  valor: string;
  error: string | undefined;
  idError: string | undefined;
  alCambiar: (v: string) => void;
}) {
  const items = useCatalogo(columna.catalogo!);

  // Las evaluaciones muestran la asignatura como contexto para distinguirlas.
  const esEvaluacion = columna.catalogo === 'evaluaciones';

  return (
    <div className="ccm-campo">
      <label className="ccm-campo-etiqueta" htmlFor={id}>
        {columna.etiqueta}
        {columna.requerido && <span className="ccm-campo-requerido"> *</span>}
      </label>
      <select
        id={id}
        className={`ccm-select ${error ? 'ccm-error' : ''}`}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={idError}
      >
        <option value="">— Sin especificar —</option>
        {items.map((item: ItemCatalogo) => (
          <option key={item.id} value={item.id}>
            {esEvaluacion ? `${item.etiqueta} · ${String(item.extra ?? '')}` : item.etiqueta}
          </option>
        ))}
      </select>
      {error ? (
        <span className="ccm-campo-error" id={idError}>
          {error}
        </span>
      ) : (
        items.length === 0 && <span className="ccm-campo-ayuda">Cargando opciones…</span>
      )}
    </div>
  );
}
