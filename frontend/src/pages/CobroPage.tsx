import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import {
  Boton,
  Cabecera,
  Campo,
  Cargando,
  Confirmacion,
  Esqueleto,
  Etiqueta,
  Mensaje,
  Notificacion,
} from '../components/Comunes';
import { listar, mensajeDeError, mutationHeaders } from '../services/api';
import api from '../services/api';
import { conMoneda, fechaCorta, fechaHora, formatearImporte, hoyLocal, iniciales, simboloMoneda } from '../utils/formato';
import TablaDeudores, { type Deudor } from '../components/TablaDeudores';

/**
 * ============================================================================
 * REGISTRAR COBRO — PANTALLA PRINCIPAL (FASE 9.B)
 * ============================================================================
 *
 * Es la tarea frecuente del personal de ventanilla (PM: "El personal
 * administrativo debe poder realizar las tareas frecuentes con una cantidad
 * razonable de interacciones"), por eso es la pantalla de inicio.
 *
 * CAMBIO DE FONDO (queja real de uso): antes habia que saberse el NUMERO de
 * matricula de cada familia. Nadie habla asi en un colegio. Ahora se busca a
 * la persona por nombre, apellido, grado o documento (`GET /pagos/buscar-deudor`),
 * se la elige de la lista y el sistema ya sabe su matricula y su deuda.
 *
 * Prevencion de errores (PM): antes de confirmar se ve a quien se le cobra,
 * cuanto debe y a que cuotas se aplicaria el monto.
 *
 * Los importes viajan como TEXTO exacto desde el backend y se muestran con
 * separador de miles: el formateo es de presentacion, jamas un calculo.
 */

interface CuotaPendiente {
  mensualidad_id: number;
  numero_cuota: number;
  fecha_vencimiento: string;
  saldo_pendiente: string;
  monto_original: string;
  estado: string;
}

interface ResultadoCobro {
  pago: { id: number; monto_total: string; estado: string };
  comprobante: { numero_comprobante: string | null; emitido: boolean };
  aplicaciones: Array<{ numero_cuota: number; monto_aplicado: string; saldo_pendiente: string }>;
}

interface UltimoCobro {
  id: number;
  estudiante: string;
  matricula_id: number | null;
  fecha: string;
  medio: string;
  monto: string;
  estado: string;
}

export default function CobroPage() {
  const { puede } = useSesion();
  const navegar = useNavigate();

  // --- Persona elegida (desde la tabla de deudores) -----------------------
  const [deudor, setDeudor] = useState<Deudor | null>(null);

  // --- Formulario ---------------------------------------------------------
  const [monto, setMonto] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(hoyLocal());
  const [medio, setMedio] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [clave, setClave] = useState('');

  // --- Estado de la operacion --------------------------------------------
  const [cuotas, setCuotas] = useState<CuotaPendiente[]>([]);
  const [consultando, setConsultando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobro | null>(null);
  const cajaMonto = useRef<HTMLInputElement>(null);

  async function elegir(persona: Deudor) {
    setDeudor(persona);
    setMonto('');
    setReferencia('');
    setError(null);
    setResultado(null);
    setConsultando(true);
    try {
      // El detalle del plan trae las cuotas con su saldo almacenado.
      const r = await api.get<{
        mensualidades: Array<{
          id: number;
          numero_cuota: number;
          saldo_pendiente: string;
          monto_original: string;
          estado: string;
          fecha_vencimiento: string;
        }>;
      }>(`/matriculas/${persona.matricula_id}/plan-pago`);
      setCuotas(
        (r.data.mensualidades ?? []).map((m) => ({
          mensualidad_id: m.id,
          numero_cuota: m.numero_cuota,
          fecha_vencimiento: String(m.fecha_vencimiento).slice(0, 10),
          saldo_pendiente: m.saldo_pendiente,
          monto_original: m.monto_original,
          estado: m.estado,
        }))
      );
    } catch (e) {
      setCuotas([]);
      setError(mensajeDeError(e));
    } finally {
      setConsultando(false);
      cajaMonto.current?.focus();
    }
  }

  // --- Validacion en linea (prevencion de errores, no solo al enviar) ------
  const pendientes = useMemo(() => cuotas.filter((c) => Number(c.saldo_pendiente) > 0), [cuotas]);
  const deudaPendiente = deudor?.saldo_total ?? null;
  const moneda = deudor?.moneda ?? null;

  const montoValido = /^[0-9]+(\.[0-9]{1,2})?$/.test(monto.trim()) && Number(monto.trim()) > 0;
  const excedeDeuda = deudaPendiente !== null && montoValido && Number(monto) > Number(deudaPendiente);
  const sinDeuda = deudaPendiente !== null && Number(deudaPendiente) === 0;

  let errorMonto: string | null = null;
  if (monto.trim() !== '' && !montoValido) {
    errorMonto = 'Use el formato 1500.00 (solo números y punto decimal).';
  } else if (excedeDeuda) {
    errorMonto = `Supera la deuda pendiente (${conMoneda(deudaPendiente ?? '0', moneda)}).`;
  }

  const listo = deudor !== null && montoValido && !excedeDeuda && !sinDeuda && /^\d{4}-\d{2}-\d{2}$/.test(fechaEfectiva.trim());

  async function registrar() {
    if (!deudor) {
      return;
    }
    setEnviando(true);
    setError(null);
    setNota(null);
    try {
      const cuerpo: Record<string, unknown> = {
        matricula_id: deudor.matricula_id,
        fecha_efectiva: fechaEfectiva.trim(),
        medios: [
          {
            tipo: medio,
            monto: monto.trim(),
            ...(referencia.trim() !== '' ? { referencia: referencia.trim() } : {}),
          },
        ],
      };
      if (clave.trim() !== '') {
        cuerpo.idempotency_key = clave.trim();
      }
      const r = await api.post('/pagos', cuerpo, { headers: mutationHeaders() });
      setResultado(r.data as ResultadoCobro);
      setNota(`Cobro registrado. Comprobante ${(r.data as ResultadoCobro).comprobante.numero_comprobante ?? 'pendiente'}.`);
      setMonto('');
      setClave('');
      setReferencia('');
      // Se refrescan la persona y sus cuotas: el saldo bajo.
      await elegir({ ...deudor });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  // El aviso de exito se va solo: no estorba el siguiente cobro.
  useEffect(() => {
    if (!nota) {
      return;
    }
    const t = window.setTimeout(() => setNota(null), 8000);
    return () => window.clearTimeout(t);
  }, [nota]);

  if (!puede('pagos:manage')) {
    return (
      <>
        <Cabecera titulo="Registrar cobro" />
        <Mensaje tipo="info">Su usuario no tiene permiso para registrar cobros.</Mensaje>
      </>
    );
  }

  return (
    <>
      <Cabecera
        titulo="Registrar cobro"
        descripcion="Busque a la familia por nombre, apellido, grado o documento. El monto se aplica a la cuota vencida más antigua primero."
        accion={
          <Boton tipo="secundario" icono="insights" onClick={() => navegar('/reportes')}>
            Ver reportes
          </Boton>
        }
      />

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}
      {nota ? <Notificacion tipo="exito" texto={nota} onCerrar={() => setNota(null)} /> : null}

      <TablaDeudores onElegir={(persona) => void elegir(persona)} seleccionadoId={deudor?.matricula_id ?? null} />

      <div className="cobro">
        {/* ---------------- Columna izquierda: el cobro ----------------------- */}
        <div className="cobro__col">
          <section className="tarjeta panel">
            <h2 className="panel__titulo">
              <span className="icono">payments</span>
              2. Datos del cobro
            </h2>
            {!deudor ? (
              <div className="panel__vacio" style={{ marginBottom: 'var(--esp-3)' }}>
                <span className="icono">person_search</span>
                <span>
                  Elija arriba a la familia para cargar el cobro. Los campos se habilitan al elegir.
                </span>
              </div>
            ) : (
              <div className="elegido" style={{ marginBottom: 'var(--esp-4)' }}>
                <span className="buscador__avatar" aria-hidden="true">
                  {iniciales(deudor.nombre)}
                </span>
                <div className="elegido__texto">
                  <div className="elegido__nombre">{deudor.nombre}</div>
                  <div className="elegido__meta">
                    {deudor.grado} · matrícula #{deudor.matricula_id} · {deudor.anio_lectivo}
                  </div>
                </div>
              </div>
            )}
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                if (listo) {
                  setConfirmando(true);
                }
              }}
            >
              <div>
                <Campo
                  etiqueta="Monto a cobrar"
                  identificador="monto"
                  error={errorMonto}
                  ayuda="Punto decimal, por ejemplo 1500.00"
                >
                  <input
                    id="monto"
                    ref={cajaMonto}
                    inputMode="decimal"
                    value={monto}
                    disabled={!deudor}
                    onChange={(e) => setMonto(e.target.value)}
                    aria-invalid={Boolean(errorMonto)}
                    placeholder="0.00"
                  />
                  {pendientes.length > 0 ? (
                    <div className="cobro__rapidos">
                      <span className="buscador__pista">Cobro rápido:</span>
                      {pendientes.slice(0, 4).map((c) => (
                        <Boton
                          key={c.mensualidad_id}
                          tipo="secundario"
                          disabled={!deudor}
                          onClick={() => setMonto(c.saldo_pendiente)}
                        >
                          Cuota {c.numero_cuota} ({simboloMoneda(moneda)} {formatearImporte(c.saldo_pendiente)})
                        </Boton>
                      ))}
                      <Boton
                        tipo="dorado"
                        icono="all_inclusive"
                        disabled={!deudor}
                        onClick={() => setMonto(deudaPendiente ?? '')}
                      >
                        Todo el saldo ({formatearImporte(deudaPendiente ?? '0')})
                      </Boton>
                    </div>
                  ) : null}
                </Campo>

                <Campo etiqueta="Fecha efectiva" identificador="fecha" ayuda="Determina si corresponde mora.">
                  <input
                    id="fecha"
                    type="date"
                    value={fechaEfectiva}
                    disabled={!deudor}
                    onChange={(e) => setFechaEfectiva(e.target.value)}
                  />
                  {/* El control nativo muestra dd/mm/aaaa; se repite en texto
                      largo para que no quede duda de qué día es. */}
                  <p className="campo__pie">Se cobrará con fecha {fechaCorta(fechaEfectiva)}.</p>
                </Campo>

                <Campo etiqueta="Medio de pago" identificador="medio">
                  <select id="medio" value={medio} disabled={!deudor} onChange={(e) => setMedio(e.target.value)}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                </Campo>

                {medio !== 'EFECTIVO' || referencia.trim() !== '' ? (
                  <Campo etiqueta="Referencia" identificador="referencia" ayuda="Número de autorización o comprobante.">
                    <input
                      id="referencia"
                      value={referencia}
                      disabled={!deudor}
                      onChange={(e) => setReferencia(e.target.value)}
                      placeholder="AUTH-0000"
                    />
                  </Campo>
                ) : null}

                <Campo
                  etiqueta="Clave de reintento (opcional)"
                  identificador="idem"
                  ayuda="Si la operación se interrumpe, repítala con la misma clave: no se duplicará el cobro."
                >
                  <input
                    id="idem"
                    value={clave}
                    disabled={!deudor}
                    onChange={(e) => setClave(e.target.value)}
                    placeholder="cobro-0001"
                  />
                </Campo>

                <div className="cobro__acciones">
                  <p className="cobro__nota">
                    {deudor && listo
                      ? `Se aplicará a ${deudor.nombre}.`
                      : deudor
                        ? 'Indique el monto para poder confirmar.'
                        : 'Elija una familia para poder confirmar.'}
                  </p>
                  <Boton tipo="primario" icono="payments" disabled={!listo} onClick={() => setConfirmando(true)}>
                    Confirmar cobro
                  </Boton>
                </div>
              </div>
            </form>
          </section>
        </div>

        {/* ---------------- Columna derecha: resumen y contexto --------------- */}
        <div className="cobro__col">
          <section className="tarjeta panel">
            <h2 className="panel__titulo">
              <span className="icono">receipt_long</span>
              Resumen de la operación
            </h2>
            {deudor ? (
              <dl className="resumen">
                <div className="resumen__fila">
                  <dt>Persona</dt>
                  <dd>{deudor.nombre}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Matrícula</dt>
                  <dd>#{deudor.matricula_id}</dd>
                </div>
                <div className="resumen__fila resumen__fila--total">
                  <dt>Deuda pendiente</dt>
                  <dd>{conMoneda(deudaPendiente ?? '0', moneda)}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Monto a cobrar</dt>
                  <dd>{montoValido ? conMoneda(monto, moneda) : '—'}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Medio</dt>
                  <dd>{medio}</dd>
                </div>
              </dl>
            ) : (
              <div className="panel__vacio">
                <span className="icono">info</span>
                <span>
                  Todavía no hay nadie seleccionado. Busque a la familia por la izquierda y aquí verá su deuda y a qué
                  cuotas se aplicaría el cobro.
                </span>
              </div>
            )}
          </section>

          <section className="tarjeta panel">
            <h2 className="panel__titulo">
              <span className="icono">event_upcoming</span>
              Cuotas de la matrícula
            </h2>
            {consultando ? (
              <Cargando texto="Consultando cuotas…" />
            ) : !deudor ? (
              <div className="panel__vacio">
                <span className="icono">calendar_month</span>
                <span>Al elegir una familia aparecen sus cuotas con vencimiento y saldo.</span>
              </div>
            ) : cuotas.length === 0 ? (
              <div className="panel__vacio">
                <span className="icono">info</span>
                <span>Esta matrícula no tiene cuotas registradas.</span>
              </div>
            ) : (
              <div className="tabla-envolvente">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Vence</th>
                      <th scope="col" className="tabla__numerico">
                        Saldo
                      </th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotas.map((c) => {
                      const pagada = Number(c.saldo_pendiente) === 0;
                      return (
                        <tr key={c.mensualidad_id}>
                          <td>{c.numero_cuota}</td>
                          <td>{fechaCorta(c.fecha_vencimiento)}</td>
                          <td className="tabla__numerico">{formatearImporte(c.saldo_pendiente)}</td>
                          <td>
                            <Etiqueta tipo={pagada ? 'exito' : 'aviso'} icono={pagada ? 'check_circle' : 'schedule'}>
                              {pagada ? 'Pagada' : 'Pendiente'}
                            </Etiqueta>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tarjeta panel">
            <h2 className="panel__titulo">
              <span className="icono">history</span>
              Últimos cobros de hoy
            </h2>
            <UltimosCobros />
          </section>
        </div>
      </div>

      {confirmando && deudor ? (
        <Confirmacion
          titulo="Confirmar el cobro"
          mensaje={`Se registrará un cobro de ${conMoneda(monto, moneda)} para ${deudor.nombre} (matrícula #${deudor.matricula_id}) por ${medio}, con fecha efectiva ${fechaEfectiva}. Esta operación afecta los saldos.`}
          textoConfirmar="Sí, registrar"
          onConfirmar={registrar}
          onCancelar={() => setConfirmando(false)}
          cargando={enviando}
          icono="payments"
        />
      ) : null}

      {resultado ? (
        <section className="tarjeta tarjeta--destacada" style={{ marginTop: 'var(--esp-6)' }}>
          <h2 className="panel__titulo">
            <span className="icono">task_alt</span>
            Cobro registrado
          </h2>
          <p>
            Pago <strong>#{resultado.pago.id}</strong> por {conMoneda(resultado.pago.monto_total, moneda)}.
            {resultado.comprobante.numero_comprobante ? (
              <>
                {' '}
                Comprobante <strong>{resultado.comprobante.numero_comprobante}</strong>.
              </>
            ) : null}
          </p>
          <div className="tabla-envolvente" style={{ marginTop: 'var(--esp-4)' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Cuota</th>
                  <th scope="col" className="tabla__numerico">
                    Aplicado
                  </th>
                  <th scope="col" className="tabla__numerico">
                    Saldo restante
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultado.aplicaciones.map((a) => (
                  <tr key={a.numero_cuota}>
                    <td>{a.numero_cuota}</td>
                    <td className="tabla__numerico">{formatearImporte(a.monto_aplicado)}</td>
                    <td className="tabla__numerico">{formatearImporte(a.saldo_pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Nombre del estudiante, para no mostrar un número en "últimos cobros". */
async function nombreEstudiante(estudianteId: number | undefined): Promise<string> {
  if (!estudianteId) {
    return '—';
  }
  try {
    const r = await api.get<{ estudiante?: { nombres?: string; apellidos?: string } }>(
      `/estudiantes/${estudianteId}`
    );
    const e = r.data.estudiante;
    const nombre = [e?.nombres, e?.apellidos].filter(Boolean).join(' ');
    return nombre || '—';
  } catch {
    return '—';
  }
}

/**
 * Cobros del dia con lo que hace falta para identificar la operacion:
 * familia, matricula, fecha y medio. El medio se lee del detalle de cada pago
 * (el listado no lo trae), asi que se piden los detalles en paralelo.
 */
function UltimosCobros() {
  const [filas, setFilas] = useState<UltimoCobro[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const r = await listar<{
          id: number;
          matricula_id: number | null;
          monto_total: string;
          fecha_pago: string;
          estado: string;
        }>(`/reportes/pagos-por-periodo?desde=${hoy}&hasta=${hoy}&limite=8`);
        const detalles = await Promise.all(
          r.filas.map(async (f) => {
            try {
              // El listado no trae familia ni medio: se lee el detalle de cada
              // pago (endpoint de solo lectura `GET /pagos/:id`).
              const d = await api.get<{
                pago?: {
                  estudiante_id: number;
                  medios?: Array<{ tipo: string }>;
                };
              }>(`/pagos/${f.id}`);
              const medios = d.data.pago?.medios ?? [];
              return {
                id: f.id,
                estudiante: await nombreEstudiante(d.data.pago?.estudiante_id),
                matricula_id: f.matricula_id,
                fecha: f.fecha_pago,
                medio: medios[0]?.tipo ?? '—',
                monto: f.monto_total,
                estado: f.estado,
              } satisfies UltimoCobro;
            } catch {
              return {
                id: f.id,
                estudiante: '—',
                matricula_id: f.matricula_id,
                fecha: f.fecha_pago,
                medio: '—',
                monto: f.monto_total,
                estado: f.estado,
              } satisfies UltimoCobro;
            }
          })
        );
        setFilas(detalles);
      } catch {
        setFilas([]);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) {
    return <Esqueleto lineas={3} tipo="tabla" />;
  }
  if (filas.length === 0) {
    return (
      <div className="panel__vacio">
        <span className="icono">receipt_long</span>
        <span>Hoy no se registraron cobros. Cuando se registre el primero aparecerá aquí con su comprobante.</span>
      </div>
    );
  }
  return (
    <div className="tabla-envolvente tabla-scroll">
      {/* Al vivir en la columna derecha (angosta), la matricula y la hora van
          como texto secundario dentro de la celda: si se pusieran como columnas
          propias, la ultima quedaba cortada. */}
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">Familia</th>
            <th scope="col">Fecha y medio</th>
            <th scope="col" className="tabla__numerico">
              Monto
            </th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>
                {f.estudiante}
                <span className="tabla__sub">matrícula #{f.matricula_id ?? '—'}</span>
              </td>
              <td>
                {fechaHora(f.fecha)}
                <span className="tabla__sub">{f.medio}</span>
              </td>
              <td className="tabla__numerico">{formatearImporte(f.monto)}</td>
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
  );
}
