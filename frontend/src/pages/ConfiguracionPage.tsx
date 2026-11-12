import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import { useApariencia } from '../context/AparienciaContexto';
import { Boton, Cabecera, Etiqueta } from '../components/Comunes';

/**
 * ============================================================================
 * CONFIGURACION DE APARIENCIA (FASE 9.B)
 * ============================================================================
 *
 * Lo que el usuario puede personalizar sin pedir nada al administrador:
 * tema, densidad y movimiento. Todo se guarda en el navegador y se aplica al
 * instante; ningun ajuste toca una cifra ni una regla de cobro.
 *
 * El PM pide "facilidad de aprendizaje" y "prevencion de errores": tener el
 * tema a un clic de la barra lateral y una pantalla que explica cada opcion
 * evita que la persona tenga que descubrirlo.
 */

interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
  descripcion: string;
  icono: string;
}

const TEMAS: Array<Opcion<'oscuro' | 'claro'>> = [
  {
    valor: 'oscuro',
    etiqueta: 'Oscuro',
    descripcion: 'Fondo azul profundo con acentos dorados y celestes. Ideal para turnos largos.',
    icono: 'dark_mode',
  },
  {
    valor: 'claro',
    etiqueta: 'Claro',
    descripcion: 'Fondo blanco con la misma estructura. Mejor en oficinas muy iluminadas.',
    icono: 'light_mode',
  },
];

const DENSIDADES: Array<Opcion<'comoda' | 'compacta'>> = [
  {
    valor: 'comoda',
    etiqueta: 'Cómoda',
    descripcion: 'Más aire entre tarjetas y filas. Menos información por pantalla.',
    icono: 'aspect_ratio',
  },
  {
    valor: 'compacta',
    etiqueta: 'Compacta',
    descripcion: 'Todo más junto: caben más estudiantes y más cuotas sin desplazar.',
    icono: 'density_small',
  },
];

const MOVIMIENTOS: Array<Opcion<'completo' | 'reducido'>> = [
  {
    valor: 'completo',
    etiqueta: 'Con animaciones',
    descripcion: 'Transiciones suaves al cambiar de pantalla y barras de avance animadas.',
    icono: 'animation',
  },
  {
    valor: 'reducido',
    etiqueta: 'Sin animaciones',
    descripcion: 'Nada se mueve: cambios instantáneos. Útil si el movimiento molesta o distrae.',
    icono: 'motion_photos_off',
  },
];

export default function ConfiguracionPage() {
  const { tema, cambiarTema, densidad, cambiarDensidad, movimiento, cambiarMovimiento } =
    useApariencia();
  const { sesion, puede } = useSesion();
  const navegar = useNavigate();

  return (
    <>
      <Cabecera
        titulo="Configuración"
        descripcion="Ajustes de presentación. No cambian ninguna cifra ni regla de cobro."
        accion={
          <Boton tipo="secundario" icono="arrow_back" onClick={() => navegar('/')}>
            Volver al resumen
          </Boton>
        }
      />

      <section className="tarjeta" style={{ marginBottom: 'var(--esp-5)' }}>
        <h2 style={{ fontSize: 'var(--texto-lg)', marginBottom: 'var(--esp-4)' }}>
          <span className="icono" aria-hidden="true" style={{ color: 'var(--dorado)', marginRight: 8 }}>
            palette
          </span>
          Tema
        </h2>
        <div className="rejilla rejilla--2" style={{ gap: 'var(--esp-4)' }}>
          {TEMAS.map((opcion) => {
            const activa = tema === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => cambiarTema(opcion.valor)}
                aria-pressed={activa}
                className="tarjeta tarjeta--interactiva"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  borderColor: activa ? 'var(--dorado)' : undefined,
                  boxShadow: activa ? 'var(--brillo-dorado)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-3)' }}>
                  <span
                    className="indicador__icono indicador__icono--dorado"
                    style={{ width: 34, height: 34 }}
                  >
                    <span className="icono">{opcion.icono}</span>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{opcion.etiqueta}</div>
                    <div style={{ fontSize: 'var(--texto-sm)', color: 'var(--texto-suave)' }}>
                      {opcion.descripcion}
                    </div>
                  </div>
                  <Etiqueta tipo={activa ? 'dorado' : 'neutro'} icono={activa ? 'check_circle' : 'radio_button_unchecked'}>
                    {activa ? 'Activo' : 'Elegir'}
                  </Etiqueta>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tarjeta" style={{ marginBottom: 'var(--esp-5)' }}>
        <h2 style={{ fontSize: 'var(--texto-lg)', marginBottom: 'var(--esp-4)' }}>
          <span className="icono" aria-hidden="true" style={{ color: 'var(--celeste)', marginRight: 8 }}>
            density_small
          </span>
          Densidad
        </h2>
        <div className="rejilla rejilla--2" style={{ gap: 'var(--esp-4)' }}>
          {DENSIDADES.map((opcion) => {
            const activa = densidad === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => cambiarDensidad(opcion.valor)}
                aria-pressed={activa}
                className="tarjeta tarjeta--interactiva"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  borderColor: activa ? 'var(--celeste)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-3)' }}>
                  <span
                    className="indicador__icono"
                    style={{ width: 34, height: 34 }}
                  >
                    <span className="icono">{opcion.icono}</span>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{opcion.etiqueta}</div>
                    <div style={{ fontSize: 'var(--texto-sm)', color: 'var(--texto-suave)' }}>
                      {opcion.descripcion}
                    </div>
                  </div>
                  <Etiqueta tipo={activa ? 'info' : 'neutro'} icono={activa ? 'check_circle' : 'radio_button_unchecked'}>
                    {activa ? 'Activo' : 'Elegir'}
                  </Etiqueta>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tarjeta" style={{ marginBottom: 'var(--esp-5)' }}>
        <h2 style={{ fontSize: 'var(--texto-lg)', marginBottom: 'var(--esp-4)' }}>
          <span className="icono" aria-hidden="true" style={{ color: 'var(--exito)', marginRight: 8 }}>
            animation
          </span>
          Movimiento
        </h2>
        <div className="rejilla rejilla--2" style={{ gap: 'var(--esp-4)' }}>
          {MOVIMIENTOS.map((opcion) => {
            const activa = movimiento === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => cambiarMovimiento(opcion.valor)}
                aria-pressed={activa}
                className="tarjeta tarjeta--interactiva"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  borderColor: activa ? 'var(--exito)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-3)' }}>
                  <span
                    className="indicador__icono indicador__icono--exito"
                    style={{ width: 34, height: 34 }}
                  >
                    <span className="icono">{opcion.icono}</span>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{opcion.etiqueta}</div>
                    <div style={{ fontSize: 'var(--texto-sm)', color: 'var(--texto-suave)' }}>
                      {opcion.descripcion}
                    </div>
                  </div>
                  <Etiqueta tipo={activa ? 'exito' : 'neutro'} icono={activa ? 'check_circle' : 'radio_button_unchecked'}>
                    {activa ? 'Activo' : 'Elegir'}
                  </Etiqueta>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tarjeta">
        <h2 style={{ fontSize: 'var(--texto-lg)', marginBottom: 'var(--esp-3)' }}>
          <span className="icono" aria-hidden="true" style={{ color: 'var(--celeste)', marginRight: 8 }}>
            badge
          </span>
          Tu sesión
        </h2>
        <div className="config__fila">
          <div className="config__info">
            <strong>{sesion?.nombre || 'Sin nombre'}</strong>
            <span>{sesion?.email}</span>
          </div>
          <Etiqueta tipo="info" icono="person">
            Usuario #{sesion?.userId ?? 0}
          </Etiqueta>
        </div>
        <div className="config__fila">
          <div className="config__info">
            <strong>Permisos concedidos a este usuario</strong>
            <span>
              El backend valida cada operación; aquí solo se listan los permisos con los que
              trabajás, para que sepas por qué ciertos módulos no aparecen en la barra lateral.
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-2)', marginTop: 'var(--esp-4)' }}>
          {(sesion?.grants ?? []).length === 0 ? (
            <span style={{ color: 'var(--texto-suave)', fontSize: 'var(--texto-sm)' }}>
              Este usuario no tiene ningún permiso concedido.
            </span>
          ) : (
            (sesion?.grants ?? []).map((permiso) => (
              <Etiqueta key={permiso} tipo={puede(permiso) ? 'exito' : 'neutro'}>
                {permiso}
              </Etiqueta>
            ))
          )}
        </div>
      </section>
    </>
  );
}
