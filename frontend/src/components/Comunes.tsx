import type { ReactNode } from 'react';

/**
 * ============================================================================
 * COMPONENTES COMPARTIDOS DE INTERFAZ (FASE 9)
 * ============================================================================
 *
 * El PM pide explicitamente: navegacion, panel, formularios, tablas,
 * busquedas, filtros, confirmaciones, mensajes de error, indicadores de carga y
 * notificaciones. Aqui viven las piezas reutilizables, con foco en
 * accesibilidad (etiquetas asociadas, roles ARIA, foco visible) y en prevenir
 * errores (confirmacion antes de acciones destructivas, deshabilitar envio
 * mientras carga).
 *
 * Regla del PM: "No utilizar animaciones innecesarias que retrasen el registro
 * de pagos". No hay transiciones decorativas: solo un indicador de carga.
 */

// ---------------------------------------------------------------------------
// INDICADOR DE CARGA
// ---------------------------------------------------------------------------

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="cargando__spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MENSAJE DE ERROR / EXITO
// ---------------------------------------------------------------------------

export function Mensaje({
  tipo,
  children,
}: {
  tipo: 'error' | 'exito' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      className={`mensaje mensaje--${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
      aria-live={tipo === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAMPO DE FORMULARIO (etiqueta asociada + error accesible)
// ---------------------------------------------------------------------------

export function Campo({
  etiqueta,
  identificador,
  error,
  children,
  ayuda,
}: {
  etiqueta: string;
  identificador: string;
  error?: string | null;
  children: ReactNode;
  ayuda?: string;
}) {
  return (
    <div className="campo">
      <label htmlFor={identificador}>{etiqueta}</label>
      {ayuda ? (
        <p id={`${identificador}-ayuda`} className="campo__ayuda">
          {ayuda}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${identificador}-error`} className="campo__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOTON (deshabilitado mientras carga: previene el doble envio)
// ---------------------------------------------------------------------------

export function Boton({
  tipo = 'primario',
  cargando = false,
  children,
  ...resto
}: {
  tipo?: 'primario' | 'secundario' | 'peligro';
  cargando?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...resto}
      className={`boton boton--${tipo}`}
      disabled={resto.disabled || cargando}
      aria-busy={cargando}
    >
      {cargando ? 'Procesando...' : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// TABLA con estado vacio explicito
// ---------------------------------------------------------------------------

export function Tabla<T>({
  columnas,
  filas,
  clave,
  vacio = 'No hay registros para mostrar.',
}: {
  columnas: Array<{ encabezado: string; celda: (fila: T) => ReactNode }>;
  filas: T[];
  clave: (fila: T) => string | number;
  vacio?: string;
}) {
  if (filas.length === 0) {
    return <p className="tabla__vacio">{vacio}</p>;
  }
  return (
    <table className="tabla">
      <thead>
        <tr>
          {columnas.map((columna) => (
            <th key={columna.encabezado} scope="col">
              {columna.encabezado}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => (
          <tr key={clave(fila)}>
            {columnas.map((columna) => (
              <td key={columna.encabezado}>{columna.celda(fila)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// CONFIRMACION antes de una accion destructiva
// ---------------------------------------------------------------------------

export function Confirmacion({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  onConfirmar,
  onCancelar,
  cargando = false,
}: {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  cargando?: boolean;
}) {
  return (
    <div className="confirmacion" role="dialog" aria-modal="true" aria-labelledby="confirmacion-titulo">
      <div className="confirmacion__caja">
        <h2 id="confirmacion-titulo">{titulo}</h2>
        <p>{mensaje}</p>
        <div className="confirmacion__acciones">
          <Boton tipo="secundario" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton tipo="peligro" onClick={onConfirmar} cargando={cargando}>
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NOTIFICACION (mensaje temporal, no bloquea la tarea)
// ---------------------------------------------------------------------------

export function Notificacion({
  tipo,
  texto,
  onCerrar,
}: {
  tipo: 'exito' | 'error' | 'info';
  texto: string;
  onCerrar: () => void;
}) {
  return (
    <div className={`notificacion notificacion--${tipo}`} role="status" aria-live="polite">
      <span>{texto}</span>
      <button type="button" onClick={onCerrar} aria-label="Cerrar notificacion">
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FILTROS (patron comun a los listados)
// ---------------------------------------------------------------------------

export function Filtros({
  children,
  onLimpiar,
}: {
  children: ReactNode;
  onLimpiar?: () => void;
}) {
  return (
    <form
      className="filtros"
      onSubmit={(evento) => {
        // Los filtros se aplican con el boton, no recargando la pagina.
        evento.preventDefault();
      }}
    >
      <fieldset>
        <legend>Filtros</legend>
        {children}
      </fieldset>
      {onLimpiar ? (
        <Boton tipo="secundario" onClick={onLimpiar}>
          Limpiar filtros
        </Boton>
      ) : null}
    </form>
  );
}

/** Importe como TEXTO EXACTO: nunca se convierte a Number en la interfaz. */
export function Importe({ valor, moneda }: { valor: string; moneda?: string | null }) {
  return (
    <span className="importe">
      {valor}
      {moneda ? <span className="importe__moneda"> {moneda}</span> : null}
    </span>
  );
}
