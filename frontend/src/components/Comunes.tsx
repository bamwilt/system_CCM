import type { ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';

/**
 * ============================================================================
 * COMPONENTES COMPARTIDOS (FASE 9.B)
 * ============================================================================
 *
 * Biblioteca propia sobre la que se construye toda la interfaz. Cada componente
 * cubre un requisito explicito del PM:
 *
 *   Navegacion, panel  -> Layout / Cabecera / Indicador
 *   Formularios         -> Campo
 *   Tablas              -> Tabla
 *   Busqueda y filtros  -> Filtros
 *   Confirmaciones      -> Confirmacion
 *   Mensajes de error   -> Mensaje
 *   Indicadores de carga-> Cargando / Esqueleto
 *   Notificaciones      -> Notificacion
 *
 * Calidad de vida que se agrega en esta entrega:
 *   - Iconos de Google Symbols (no caracteres de adorno).
 *   - Estados vacios que explican POR QUE no hay datos y que hacer.
 *   - Esqueleto de carga: el layout no salta cuando llegan los datos.
 *   - Transiciones cortas, todas anulables con prefers-reduced-motion.
 */

/** Icono de Google Symbols. El nombre es el identificador del glifo. */
export function Icono({
  nombre,
  tamano = 'md',
  relleno = false,
}: {
  nombre: string;
  tamano?: 'sm' | 'md' | 'lg';
  relleno?: boolean;
}) {
  const clases = ['icono', tamano === 'sm' ? 'icono--sm' : '', tamano === 'lg' ? 'icono--lg' : '', relleno ? 'icono--relleno' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={clases} aria-hidden="true">
      {nombre}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CABECERA DE PÁGINA
// ---------------------------------------------------------------------------

export function Cabecera({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="contenido__cabecera">
      <div>
        <h1 className="contenido__titulo">{titulo}</h1>
        {descripcion ? <p className="contenido__desc">{descripcion}</p> : null}
      </div>
      {accion ? <div className="barra__acciones">{accion}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CARGA
// ---------------------------------------------------------------------------

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="cargando__spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

/** Mientras cargan los datos, el layout no salta. */
export function Esqueleto({
  lineas = 5,
  tipo = 'linea',
}: {
  lineas?: number;
  tipo?: 'linea' | 'tabla' | 'indicador';
}) {
  const clase = tipo === 'tabla' ? 'esqueleto--tabla' : tipo === 'indicador' ? 'esqueleto--indicador' : 'esqueleto--linea';
  return (
    <div role="status" aria-live="polite" aria-label="Cargando contenido">
      {Array.from({ length: lineas }).map((_, i) => (
        <div key={i} className={`esqueleto ${clase}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MENSAJES
// ---------------------------------------------------------------------------

export function Mensaje({
  tipo,
  children,
  onCerrar,
}: {
  tipo: 'error' | 'exito' | 'info';
  children: ReactNode;
  onCerrar?: () => void;
}) {
  const icono = tipo === 'error' ? 'error' : tipo === 'exito' ? 'check_circle' : 'info';
  return (
    <div
      className={`mensaje mensaje--${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
      aria-live={tipo === 'error' ? 'assertive' : 'polite'}
    >
      <Icono nombre={icono} tamano="sm" />
      <span className="mensaje__texto">{children}</span>
      {onCerrar ? (
        <button type="button" className="mensaje__cerrar" onClick={onCerrar} aria-label="Cerrar mensaje">
          <Icono nombre="close" tamano="sm" />
        </button>
      ) : null}
    </div>
  );
}

export function Notificacion({
  tipo,
  texto,
  onCerrar,
}: {
  tipo: 'exito' | 'error' | 'info';
  texto: string;
  onCerrar: () => void;
}) {
  const icono = tipo === 'error' ? 'error' : tipo === 'exito' ? 'check_circle' : 'info';
  return (
    <div className={`notificacion notificacion--${tipo}`} role="status" aria-live="polite">
      <Icono nombre={icono} />
      <span className="notificacion__texto">{texto}</span>
      <button type="button" onClick={onCerrar} aria-label="Cerrar notificación">
        <Icono nombre="close" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VACÍO
// ---------------------------------------------------------------------------

export function Vacio({
  titulo,
  descripcion,
  accion,
  icono = 'inventory_2',
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  icono?: string;
}) {
  return (
    <div className="vacio">
      <div className="vacio__icono">
        <Icono nombre={icono} tamano="lg" />
      </div>
      <p className="vacio__titulo">{titulo}</p>
      {descripcion ? <p className="vacio__desc">{descripcion}</p> : null}
      {accion ? <div style={{ marginTop: 'var(--esp-5)' }}>{accion}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAMPO DE FORMULARIO
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
      <label className="campo__etiqueta" htmlFor={identificador}>
        {etiqueta}
      </label>
      {ayuda ? (
        <p id={`${identificador}-ayuda`} className="campo__ayuda">
          {ayuda}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${identificador}-error`} className="campo__error" role="alert">
          <Icono nombre="error" tamano="sm" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOTÓN
// ---------------------------------------------------------------------------

export function Boton({
  tipo = 'primario',
  cargando = false,
  grande = false,
  bloque = false,
  icono,
  children,
  ...resto
}: {
  tipo?: 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'exito' | 'dorado';
  cargando?: boolean;
  grande?: boolean;
  bloque?: boolean;
  icono?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const clases = [
    'boton',
    `boton--${tipo}`,
    grande ? 'boton--grande' : '',
    bloque ? 'boton--bloque' : '',
    !children ? 'boton--icono' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...resto} className={clases} disabled={resto.disabled || cargando} aria-busy={cargando}>
      {cargando ? (
        <>
          <span className="cargando__spinner" aria-hidden="true" />
          Procesando…
        </>
      ) : (
        <>
          {icono ? <Icono nombre={icono} /> : null}
          {children}
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// TABLA
// ---------------------------------------------------------------------------

export function Tabla<T>({
  columnas,
  filas,
  clave,
  cargando = false,
  vacio,
}: {
  columnas: Array<{ encabezado: string; celda: (fila: T) => ReactNode; numerico?: boolean; acciones?: boolean }>;
  filas: T[];
  clave: (fila: T) => string | number;
  cargando?: boolean;
  vacio?: { titulo: string; descripcion?: string; accion?: ReactNode; icono?: string };
}) {
  if (cargando) {
    return (
      <div className="tabla-envolvente" style={{ padding: 'var(--esp-4)' }}>
        <Esqueleto lineas={5} tipo="tabla" />
      </div>
    );
  }

  if (filas.length === 0) {
    return vacio ? (
      <div className="tarjeta">
        <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} accion={vacio.accion} icono={vacio.icono} />
      </div>
    ) : null;
  }

  return (
    <div className="tabla-envolvente">
      <table className="tabla">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.encabezado}
                scope="col"
                className={[c.numerico ? 'tabla__numerico' : '', c.acciones ? 'tabla__acciones' : ''].filter(Boolean).join(' ')}
              >
                {c.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={clave(fila)}>
              {columnas.map((c) => (
                <td
                  key={c.encabezado}
                  className={[c.numerico ? 'tabla__numerico' : '', c.acciones ? 'tabla__acciones' : ''].filter(Boolean).join(' ')}
                >
                  {c.celda(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ETIQUETA DE ESTADO
// ---------------------------------------------------------------------------

export function Etiqueta({
  tipo = 'neutro',
  icono,
  children,
}: {
  tipo?: 'neutro' | 'exito' | 'peligro' | 'aviso' | 'info' | 'destacado' | 'dorado';
  icono?: string;
  children: ReactNode;
}) {
  return (
    <span className={`etiqueta etiqueta--${tipo}`}>
      {icono ? <Icono nombre={icono} tamano="sm" /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// INDICADOR NUMÉRICO
// ---------------------------------------------------------------------------

export function Indicador({
  etiqueta,
  valor,
  nota,
  icono = 'insights',
  tono = 'acento',
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: string;
  icono?: string;
  tono?: 'acento' | 'exito' | 'peligro' | 'aviso' | 'destacado';
}) {
  return (
    <div className="tarjeta">
      <div className="indicador">
        <div className={`indicador__icono indicador__icono--${tono}`}>
          <Icono nombre={icono} />
        </div>
        <div>
          <div className="indicador__etiqueta">{etiqueta}</div>
          <div className="indicador__valor">{valor}</div>
          {nota ? <div className="indicador__nota">{nota}</div> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONFIRMACIÓN
// ---------------------------------------------------------------------------

export function Confirmacion({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  onConfirmar,
  onCancelar,
  cargando = false,
  icono = 'warning',
}: {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  cargando?: boolean;
  icono?: string;
}) {
  return (
    <div className="confirmacion" role="dialog" aria-modal="true" aria-labelledby="confirmacion-titulo">
      <div className="confirmacion__caja">
        <div className="confirmacion__icono">
          <Icono nombre={icono} />
        </div>
        <h3 id="confirmacion-titulo">{titulo}</h3>
        <p>{mensaje}</p>
        <div className="confirmacion__acciones">
          <Boton tipo="secundario" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton tipo="peligro" onClick={onConfirmar} cargando={cargando} icono="check_circle">
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FILTROS
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
        evento.preventDefault();
      }}
    >
      <fieldset>
        <legend>
          <Icono nombre="filter_alt" tamano="sm" />
          Filtros
        </legend>
      </fieldset>
      {children}
      {onLimpiar ? (
        <div className="filtros__acciones">
          <Boton tipo="secundario" icono="refresh" onClick={onLimpiar}>
            Limpiar
          </Boton>
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// IMPORTE (texto exacto: nunca se convierte a número en la interfaz)
// ---------------------------------------------------------------------------

export function Importe({ valor, moneda }: { valor: string; moneda?: string | null }) {
  return (
    <span className="importe">
      {valor}
      {moneda ? <span className="importe__moneda">{moneda}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PAGINACIÓN
// ---------------------------------------------------------------------------

export function Paginacion({
  compensar,
  limite,
  total,
  onCambiar,
}: {
  compensar: number;
  limite: number;
  total: number;
  onCambiar: (compensar: number) => void;
}) {
  if (total <= limite) {
    return null;
  }
  return (
    <div className="paginacion">
      <Boton
        tipo="secundario"
        icono="chevron_left"
        disabled={compensar === 0}
        onClick={() => onCambiar(Math.max(0, compensar - limite))}
      >
        Anterior
      </Boton>
      <Boton
        tipo="secundario"
        icono="chevron_right"
        disabled={compensar + limite >= total}
        onClick={() => onCambiar(compensar + limite)}
      >
        Siguiente
      </Boton>
    </div>
  );
}
