import type { ReactNode } from 'react';

/**
 * ============================================================================
 * COMPONENTES DE AYUDA Y CALIDAD DE VIDA (FASE 9.B)
 * ============================================================================
 *
 * Tres piezas que pide el PM indirectamente ("facilidad de aprendizaje",
 * "prevencion de errores", "cantidad razonable de interacciones"):
 *
 *   Atajos        -> recuadro con los atallos de teclado, siempre visible.
 *   Ayuda         -> panel flotante con guia por pantalla.
 *   PaletaCommandos -> Ctrl/Cmd+K para saltar a cualquier modulo sin el raton.
 */

// ---------------------------------------------------------------------------
// RECUADRO DE ATAJOS
// ---------------------------------------------------------------------------

export function Atajos({ children }: { children: ReactNode }) {
  return <div className="atajos">{children}</div>;
}

export function Atajo({ teclas, texto }: { teclas: string; texto: string }) {
  return (
    <span className="atajos__grupo">
      <kbd>{teclas}</kbd>
      <span>{texto}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// PANEL DE AYUDA FLOTANTE
// ---------------------------------------------------------------------------

export function Ayuda({ children }: { children: ReactNode }) {
  return (
    <div className="ayuda ayuda__pelen">
      {children}
    </div>
  );
}

export function AyudaDisparador({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="ayuda__disparador"
      onClick={onClick}
      aria-expanded={abierto}
      aria-label={abierto ? 'Cerrar ayuda' : 'Abrir ayuda'}
    >
      <span className="icono">{abierto ? 'close' : 'help'}</span>
    </button>
  );
}

export function AyudaPanel({ children }: { children: ReactNode }) {
  return <div className="ayuda__panel">{children}</div>;
}

export function AyudaLista({ children }: { children: ReactNode }) {
  return <ul className="ayuda__lista">{children}</ul>;
}

// ---------------------------------------------------------------------------
// PALETA DE COMANDOS
// ---------------------------------------------------------------------------

export interface OpcionComando {
  etiqueta: string;
  icono: string;
  ejecutar: () => void;
}

export function PaletaComandos({
  consulta,
  onConsulta,
  opciones,
  activa,
  onSeleccion,
  onCerrar,
}: {
  consulta: string;
  onConsulta: (valor: string) => void;
  opciones: OpcionComando[];
  activa: number;
  onSeleccion: (indice: number) => void;
  onCerrar: () => void;
}) {
  const filtradas = opciones.filter((o) =>
    o.etiqueta.toLowerCase().includes(consulta.toLowerCase())
  );
  return (
    <div className="paleta" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <div className="paleta__caja">
        <input
          className="paleta__entrada"
          autoFocus
          value={consulta}
          placeholder="Buscar modulo o accion…"
          onChange={(e) => onConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              onSeleccion(Math.min(activa + 1, filtradas.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              onSeleccion(Math.max(activa - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const opcion = filtradas[activa];
              if (opcion) opcion.ejecutar();
            } else if (e.key === 'Escape') {
              onCerrar();
            }
          }}
        />
        <ul className="paleta__lista">
          {filtradas.map((o, i) => (
            <li key={o.etiqueta}>
              <button
                type="button"
                className={`paleta__opcion${i === activa ? ' paleta__opcion--activa' : ''}`}
                onClick={o.ejecutar}
              >
                <span className="icono">{o.icono}</span>
                {o.etiqueta}
              </button>
            </li>
          ))}
        </ul>
        <div className="paleta__pie">
          ↑↓ navegar · Enter abrir · Esc cerrar
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BARRA DE PROGRESO ANIMADA
// ---------------------------------------------------------------------------

export function Barra({
  porcentaje,
  tipo = 'acento',
}: {
  porcentaje: number;
  tipo?: 'acento' | 'exito' | 'peligro';
}) {
  const limitado = Math.max(0, Math.min(100, porcentaje));
  return (
    <div className="barra">
      <div className={`barra__relleno barra__relleno--${tipo}`} style={{ width: `${limitado}%` }} />
    </div>
  );
}
