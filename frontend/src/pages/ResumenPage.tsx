import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import { useApariencia } from '../context/AparienciaContexto';
import {
  Boton,
  Cabecera,
  Esqueleto,
  Etiqueta,
  Importe,
  Indicador,
  Mensaje,
} from '../components/Comunes';
import {
  Atajo,
  Atajos,
  Ayuda,
  AyudaDisparador,
  AyudaLista,
  AyudaPanel,
  Barra,
  PaletaComandos,
} from '../components/Ayuda';
import { listar, mensajeDeError } from '../services/api';
import { conMoneda, formatearImporte, hoyLocal, simboloMoneda } from '../utils/formato';

/**
 * ============================================================================
 * PORTADA — RESUMEN DEL DÍA (FASE 9.B)
 * ============================================================================
 *
 * Es lo primero que se ve al entrar: una portada con la cifra del día, luego
 * los indicadores, luego las cuotas vencidas y los cobros de hoy.
 *
 * Todas las cifras salen de los reportes de la Fase 8: la interfaz NO
 * recalcula (PM: "No duplicar calculos monetarios de manera inconsistente").
 */

interface FilaRecaudacion {
  dia: string;
  operaciones: number;
  total: string;
  anuladas: number;
  total_anulado: string;
  moneda: string | null;
}

interface FilaMoroso {
  mensualidad_id: number;
  estudiante_nombre: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  saldo_pendiente: string;
  moneda: string | null;
  dias_vencida: number;
}

interface FilaPago {
  id: number;
  moneda: string | null;
  matricula_id: number | null;
  monto_total: string;
  estado: string;
}

function hoy(): string {
  // Fecha local, no UTC: con UTC la portada mostraba el dia siguiente a
  // partir de las 18:00 en zonas detras de UTC (ver hoyLocal en formato.ts).
  return hoyLocal();
}

/** Contra el total de cuotas del plan, para la barra de avance. */
function usoDeIndicador(valor: number, tope: number): number {
  if (!(tope > 0)) {
    return 0;
  }
  return Math.min(100, Math.round((valor / tope) * 100));
}

export default function ResumenPage() {
  const { puede, sesion } = useSesion();
  const { tema, cambiarTema } = useApariencia();
  const navegar = useNavigate();

  const [recaudacion, setRecaudacion] = useState<FilaRecaudacion[]>([]);
  const [morosos, setMorosos] = useState<FilaMoroso[]>([]);
  const [pagos, setPagos] = useState<FilaPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ayuda, setAyuda] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      setError(null);
      try {
        if (puede('reportes:read')) {
          const [rRec, rMor, rPag] = await Promise.all([
            listar<FilaRecaudacion>(`/reportes/recaudacion?desde=${hoy()}&hasta=${hoy()}&limite=1`),
            listar<FilaMoroso>(`/reportes/morosidad?fecha_corte=${hoy()}&limite=6`),
            listar<FilaPago>(`/reportes/pagos-por-periodo?desde=${hoy()}&hasta=${hoy()}&limite=8`),
          ]);
          setRecaudacion(rRec.filas);
          setMorosos(rMor.filas);
          setPagos(rPag.filas);
        }
      } catch (e) {
        setError(mensajeDeError(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [puede]);

  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        setPaleta((abierto) => !abierto);
        setConsulta('');
        setActiva(0);
      }
      if (evento.key === 'Escape') {
        setPaleta(false);
        setAyuda(false);
      }
    }
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  const comandos = [
    { etiqueta: 'Registrar cobro', icono: 'payments', ejecutar: () => navegar('/cobro') },
    { etiqueta: 'Nueva matrícula', icono: 'add', ejecutar: () => navegar('/matriculas/nueva') },
    { etiqueta: 'Estudiantes', icono: 'school', ejecutar: () => navegar('/estudiantes') },
    { etiqueta: 'Matrículas', icono: 'badge', ejecutar: () => navegar('/matriculas') },
    { etiqueta: 'Tutores', icono: 'groups', ejecutar: () => navegar('/tutores') },
    { etiqueta: 'Reportes', icono: 'insights', ejecutar: () => navegar('/reportes') },
    {
      etiqueta: tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
      icono: 'settings',
      ejecutar: () => cambiarTema(tema === 'oscuro' ? 'claro' : 'oscuro'),
    },
  ];

  const recaudado = recaudacion.reduce((acc, f) => acc + Number(f.total), 0);
  // La moneda se lee del reporte (plan almacenado): si no viene, no se inventa.
  const monedaHoy = recaudacion[0]?.moneda ?? pagos[0]?.moneda ?? null;
  const operaciones = recaudacion.reduce((acc, f) => acc + f.operaciones, 0);
  const anuladas = recaudacion.reduce((acc, f) => acc + f.anuladas, 0);
  const deudaVencida = morosos.reduce((acc, m) => acc + Number(m.saldo_pendiente), 0);
  const cuotasVencidas = morosos.length;
  const nombre = sesion?.nombre || 'equipo';

  if (!puede('reportes:read')) {
    return (
      <>
        <Cabecera titulo="Resumen del día" />
        <Mensaje tipo="info">Su usuario no tiene permiso para ver reportes financieros.</Mensaje>
      </>
    );
  }

  return (
    <>
      <Cabecera
        titulo={`Buen turno, ${nombre}`}
        descripcion="Resumen operativo de hoy sobre los registros oficiales."
        accion={
          puede('pagos:manage') ? (
            <Boton tipo="dorado" icono="payments" onClick={() => navegar('/cobro')}>
              Registrar cobro
            </Boton>
          ) : undefined
        }
      />

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}

      <Atajos>
        <Atajo teclas="Ctrl K" texto="Buscar modulo" />
        <Atajo teclas="?" texto="Ayuda" />
        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>
          Cifras calculadas sobre los registros oficiales
        </span>
      </Atajos>

      {cargando ? (
        <Esqueleto lineas={1} tipo="indicador" />
      ) : (
        <>
          <section className="hero">
            <div className="hero__fila">
              <div>
                <p className="hero__saludo">Recaudado hoy</p>
                <div className="hero__cifra">
                  <span className="hero__monto">{formatearImporte(recaudado.toFixed(2))}</span>
                  <span className="hero__moneda">{simboloMoneda(monedaHoy)}</span>
                </div>
                <div className="hero__meta">
                  <span className="hero__dato">
                    <span className="icono" aria-hidden="true">
                      receipt_long
                    </span>
                    <strong>{operaciones}</strong> operaciones
                  </span>
                  <span className="hero__dato">
                    <span className="icono" aria-hidden="true">
                      close
                    </span>
                    <strong>{anuladas}</strong> anulaciones
                  </span>
                  <span className="hero__dato">
                    <span className="icono" aria-hidden="true">
                      schedule
                    </span>
                    <strong>{cuotasVencidas}</strong> cuotas vencidas
                  </span>
                </div>
              </div>
              <div className="hero__acciones">
                <Boton tipo="secundario" icono="insights" onClick={() => navegar('/reportes')}>
                  Reportes
                </Boton>
                <Boton tipo="dorado" icono="add" onClick={() => navegar('/matriculas/nueva')}>
                  Nueva matrícula
                </Boton>
              </div>
            </div>
          </section>

          <div className="rejilla rejilla--3" style={{ marginBottom: 'var(--esp-5)' }}>
            <Indicador
              etiqueta="Deuda vencida"
              valor={conMoneda(deudaVencida.toFixed(2), monedaHoy)}
              nota={`${cuotasVencidas} cuotas por cobrar`}
              icono="schedule"
              tono="aviso"
            />
            <Indicador
              etiqueta="Cobros anulados"
              valor={String(anuladas)}
              nota="Operaciones revertidas hoy"
              icono="close"
              tono="peligro"
            />
            <Indicador
              etiqueta="Operaciones activas"
              valor={String(operaciones - anuladas)}
              nota="Cobros del día"
              icono="trending_up"
              tono="exito"
            />
          </div>

          <div className="rejilla rejilla--2">
            <div>
              <div className="contenido__cabecera" style={{ marginBottom: 'var(--esp-3)' }}>
                <h2 style={{ fontSize: 'var(--texto-lg)' }}>Cuotas vencidas</h2>
                <Boton tipo="fantasma" icono="open_in_new" onClick={() => navegar('/reportes')}>
                  Ver todas
                </Boton>
              </div>
              {morosos.length === 0 ? (
                <div className="tarjeta">
                  <p style={{ color: 'var(--texto-suave)' }}>No hay cuotas vencidas. Todo al día.</p>
                </div>
              ) : (
                <div className="tabla-envolvente">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Estudiante</th>
                        <th scope="col" className="tabla__numerico">
                          Saldo
                        </th>
                        <th scope="col" className="tabla__numerico">
                          Días
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {morosos.map((m) => (
                        <tr key={m.mensualidad_id ?? `${m.estudiante_nombre}-${m.fecha_vencimiento}`}>
                          <td>{m.estudiante_nombre}</td>
                          <td className="tabla__numerico">
                            {conMoneda(m.saldo_pendiente, m.moneda)}
                          </td>
                          <td className="tabla__numerico">
                            <Etiqueta tipo={m.dias_vencida > 30 ? 'peligro' : 'aviso'} icono="schedule">
                              {m.dias_vencida}
                            </Etiqueta>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="contenido__cabecera" style={{ marginBottom: 'var(--esp-3)' }}>
                <h2 style={{ fontSize: 'var(--texto-lg)' }}>Cobros de hoy</h2>
                <Boton tipo="fantasma" icono="open_in_new" onClick={() => navegar('/cobro')}>
                  Cobrar
                </Boton>
              </div>
              {pagos.length === 0 ? (
                <div className="tarjeta">
                  <p style={{ color: 'var(--texto-suave)' }}>No se registraron cobros hoy.</p>
                </div>
              ) : (
                <div className="tabla-envolvente">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Pago</th>
                        <th scope="col" className="tabla__numerico">
                          Monto
                        </th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagos.map((f) => (
                        <tr key={f.id ?? `${f.matricula_id}-${f.monto_total}`}>
                          <td>#{f.id}</td>
                          <td className="tabla__numerico">
                            {formatearImporte(f.monto_total)}
                          </td>
                          <td>
                            <Etiqueta
                              tipo={f.estado === 'REVERTIDO' || f.estado === 'ANULADO' ? 'peligro' : 'exito'}
                              icono={f.estado === 'REVERTIDO' || f.estado === 'ANULADO' ? 'close' : 'check_circle'}
                            >
                              {f.estado}
                            </Etiqueta>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="tarjeta" style={{ marginTop: 'var(--esp-5)' }}>
            <div className="indicador">
              <div className="indicador__icono indicador__icono--dorado">
                <span className="icono">savings</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="indicador__etiqueta">Avance del día</div>
                <div className="indicador__valor">{operaciones} operaciones</div>
                <Barra porcentaje={usoDeIndicador(operaciones, Math.max(operaciones, 1))} tipo="exito" />
                <div className="indicador__nota">
                  Las cifras provienen del reporte de recaudación, no de cálculos locales.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <Ayuda>
        <AyudaDisparador abierto={ayuda} onClick={() => setAyuda((a) => !a)} />
        {ayuda ? (
          <AyudaPanel>
            <h3>Ayuda rápida</h3>
            <AyudaLista>
              <li>
                <span className="icono">search</span>
                <span>
                  Pulsá <kbd>Ctrl</kbd> + <kbd>K</kbd> para saltar a cualquier modulo sin usar el ratón.
                </span>
              </li>
              <li>
                <span className="icono">payments</span>
                <span>
                  En <strong>Registrar cobro</strong> la fecha efectiva determina si corresponde mora. El monto se
                  aplica a la cuota vencida más antigua primero.
                </span>
              </li>
              <li>
                <span className="icono">refresh</span>
                <span>
                  Si la operación se interrumpe, usá la misma clave de reintento: el cobro no se duplica.
                </span>
              </li>
              <li>
                <span className="icono">settings</span>
                <span>
                  El tema se recuerda en este navegador. Usá el botón del panel para cambiar entre oscuro y claro.
                </span>
              </li>
            </AyudaLista>
          </AyudaPanel>
        ) : null}
      </Ayuda>

      {paleta ? (
        <PaletaComandos
          consulta={consulta}
          onConsulta={setConsulta}
          opciones={comandos}
          activa={activa}
          onSeleccion={setActiva}
          onCerrar={() => setPaleta(false)}
        />
      ) : null}
    </>
  );
}
