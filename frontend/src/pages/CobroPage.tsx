import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import { Boton, Cabecera, Campo, Cargando, Confirmacion, Etiqueta, Importe, Mensaje, Notificacion } from '../components/Comunes';
import { listar, mutationHeaders, mensajeDeError } from '../services/api';
import api from '../services/api';

/**
 * ============================================================================
 * REGISTRAR COBRO — PANTALLA PRINCIPAL (FASE 9.B)
 * ============================================================================
 *
 * Es la tarea frecuente del personal de ventanilla (PM: "El personal
 * administrativo debe poder realizar las tareas frecuentes con una cantidad
 * razonable de interacciones"), por eso es la pantalla de inicio de la
 * aplicacion.
 *
 * Distribucion en dos columnas: el formulario a la izquierda, el resumen de la
 * operacion a la derecha. La persona ve cuanto va a cobrar ANTES de confirmar,
 * que es prevencion de errores.
 *
 * El panel derecho muestra las cuotas pendientes de la matricula consultada,
 * para no cobrar a ciegas.
 */

interface CuotaPendiente {
  mensualidad_id: number;
  numero_cuota: number;
  fecha_vencimiento: string;
  saldo_pendiente: string;
  monto_original: string;
  estado: string;
}

interface FilaPendientes {
  mensualidad_id: number;
  matricula_id: number;
  estudiante_nombre: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  saldo_pendiente: string;
  saldo_total: string;
  moneda: string | null;
}

interface ResultadoCobro {
  pago: { id: number; monto_total: string; estado: string };
  comprobante: { numero_comprobante: string | null; emitido: boolean };
  aplicaciones: Array<{ numero_cuota: number; monto_aplicado: string; saldo_pendiente: string }>;
}

export default function CobroPage() {
  const { puede } = useSesion();
  const navegar = useNavigate();

  const [matriculaId, setMatriculaId] = useState('');
  const [monto, setMonto] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(new Date().toISOString().slice(0, 10));
  const [medio, setMedio] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [clave, setClave] = useState('');

  const [cuotas, setCuotas] = useState<CuotaPendiente[]>([]);
  const [consultando, setConsultando] = useState(false);
  const [totalPendiente, setTotalPendiente] = useState<string | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobro | null>(null);

  if (!puede('pagos:manage')) {
    return (
      <>
        <Cabecera titulo="Registrar cobro" />
        <Mensaje tipo="info">Su usuario no tiene permiso para registrar cobros.</Mensaje>
      </>
    );
  }

  async function consultarCuotas() {
    if (!/^[1-9][0-9]*$/.test(matriculaId.trim())) {
      return;
    }
    setConsultando(true);
    setError(null);
    try {
      // El detalle del plan trae las cuotas con su saldo almacenado.
      const r = await api.get<{
        plan_pago: { plan_pago_id: number } | null;
        mensualidades: Array<{
          id: number;
          numero_cuota: number;
          saldo_pendiente: string;
          monto_original: string;
          estado: string;
          fecha_vencimiento: string;
        }>;
      }>(`/matriculas/${matriculaId.trim()}/plan-pago`);
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
    }
  }

  useEffect(() => {
    const pendientes = cuotas.filter((c) => Number(c.saldo_pendiente) > 0);
    if (pendientes.length === 0) {
      setTotalPendiente(null);
      return;
    }
    void (async () => {
      try {
        const r = await listar<FilaPendientes>(
          `/reportes/estudiantes-pendientes?matricula_id=${matriculaId.trim()}&limite=1`
        );
        setTotalPendiente(r.filas[0]?.saldo_total ?? null);
      } catch {
        setTotalPendiente(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuotas, matriculaId]);

  const montoValido = /^[0-9]+(\.[0-9]{1,2})?$/.test(monto.trim()) && Number(monto.trim()) > 0;
  const excedeDeuda = totalPendiente !== null && montoValido && Number(monto) > Number(totalPendiente);

  function valido(): boolean {
    return (
      /^[1-9][0-9]*$/.test(matriculaId.trim()) &&
      montoValido &&
      !excedeDeuda &&
      /^\d{4}-\d{2}-\d{2}$/.test(fechaEfectiva.trim())
    );
  }

  async function registrar() {
    setEnviando(true);
    setError(null);
    setNota(null);
    try {
      const cuerpo: Record<string, unknown> = {
        matricula_id: Number(matriculaId.trim()),
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
      setNota('Cobro registrado correctamente.');
      setMonto('');
      setClave('');
      setReferencia('');
      await consultarCuotas();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <>
      <Cabecera
        titulo="Registrar cobro"
        descripcion="El cobro se aplica a las cuotas vencidas más antiguas primero."
        accion={
          <Boton tipo="secundario" icono="receipt_long" onClick={() => navegar('/reportes')}>
            Ver reportes
          </Boton>
        }
      />

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}
      {nota ? <Notificacion tipo="exito" texto={nota} onCerrar={() => setNota(null)} /> : null}

      <div className="cobro">
        <div className="tarjeta">
          <form
            className="cobro__form"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (valido()) {
                setConfirmando(true);
              }
            }}
          >
            <Campo etiqueta="Matrícula" identificador="matricula" >
              <div style={{ display: 'flex', gap: 'var(--esp-2)' }}>
                <input
                  id="matricula"
                  inputMode="numeric"
                  value={matriculaId}
                  onChange={(e) => setMatriculaId(e.target.value)}
                  onBlur={() => void consultarCuotas()}
                  placeholder="Número de matrícula"
                />
                <Boton tipo="secundario" icono="search" cargando={consultando} onClick={() => void consultarCuotas()}>
                  Consultar
                </Boton>
              </div>
            </Campo>

            <Campo
              etiqueta="Monto"
              identificador="monto"
              error={excedeDeuda ? `El monto supera la deuda pendiente (${totalPendiente})` : null}
              ayuda="Use punto decimal, por ejemplo 1500.00"
            >
              <input
                id="monto"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                aria-invalid={excedeDeuda}
                placeholder="0.00"
              />
            </Campo>

            <Campo etiqueta="Fecha efectiva" identificador="fecha" ayuda="Determina si corresponde mora.">
              <input
                id="fecha"
                type="date"
                value={fechaEfectiva}
                onChange={(e) => setFechaEfectiva(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Medio de pago" identificador="medio">
              <select id="medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
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
                onChange={(e) => setClave(e.target.value)}
                placeholder="cobro-0001"
              />
            </Campo>

            <Boton tipo="primario" bloque grande icono="payments" disabled={!valido()}>
              Confirmar cobro
            </Boton>
          </form>
        </div>

        <div className="cobro__col">
          <div className="tarjeta cobro__panel">
          <h3>Resumen de la operación</h3>
          <dl style={{ margin: 0 }}>
            <div className="cobro__resumen">
              <dt>Matrícula</dt>
              <dd>{matriculaId.trim() || '—'}</dd>
            </div>
            <div className="cobro__resumen">
              <dt>Monto a cobrar</dt>
              <dd>{montoValido ? monto : '—'}</dd>
            </div>
            <div className="cobro__resumen">
              <dt>Medio</dt>
              <dd>{medio}</dd>
            </div>
            <div className="cobro__resumen">
              <dt>Deuda pendiente</dt>
              <dd>
                {totalPendiente !== null ? <Importe valor={totalPendiente} /> : '—'}
              </dd>
            </div>
          </dl>

          <div className="cobro__seccion">
            <h3>Cuotas</h3>
          {consultando ? (
            <Cargando texto="Consultando cuotas…" />
          ) : cuotas.length === 0 ? (
            <p style={{ color: 'var(--texto-suave)', fontSize: 'var(--texto-md)' }}>
              Consulte una matrícula para ver sus cuotas.
            </p>
          ) : (
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
                {cuotas.map((c) => (
                  <tr key={c.mensualidad_id}>
                    <td>{c.numero_cuota}</td>
                    <td>{c.fecha_vencimiento}</td>
                    <td className="tabla__numerico">
                      <Importe valor={c.saldo_pendiente} />
                    </td>
                    <td>
                      <Etiqueta
                        tipo={Number(c.saldo_pendiente) === 0 ? 'exito' : 'aviso'}
                        icono={Number(c.saldo_pendiente) === 0 ? 'check_circle' : 'schedule'}
                      >
                        {Number(c.saldo_pendiente) === 0 ? 'Pagada' : 'Pendiente'}
                      </Etiqueta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>

          <div className="cobro__panel--crecer">
            <h3>Últimos cobros</h3>
            <UltimosCobros />
          </div>
        </div>
      </div>

      {confirmando ? (
        <Confirmacion
          titulo="Confirmar el cobro"
          mensaje={`Se registrará un cobro de ${monto} por ${medio} sobre la matrícula ${matriculaId.trim()} con fecha efectiva ${fechaEfectiva}. Esta operación afecta los saldos.`}
          textoConfirmar="Sí, registrar"
          onConfirmar={registrar}
          onCancelar={() => setConfirmando(false)}
          cargando={enviando}
          icono="payments"
        />
      ) : null}

      {resultado ? (
        <div className="tarjeta tarjeta--destacada" style={{ marginTop: 'var(--esp-6)' }}>
          <h3>Cobro registrado</h3>
          <p>
            Pago <strong>#{resultado.pago.id}</strong> por {resultado.pago.monto_total}.{' '}
            {resultado.comprobante.numero_comprobante ? (
              <>
                Comprobante <strong>{resultado.comprobante.numero_comprobante}</strong>.
              </>
            ) : null}
          </p>
          <table className="tabla" style={{ marginTop: 'var(--esp-4)' }}>
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
                  <td className="tabla__numerico">{a.monto_aplicado}</td>
                  <td className="tabla__numerico">{a.saldo_pendiente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/** Cobros registrados hoy: informacion util, no espacio vacio. */
function UltimosCobros() {
  const [filas, setFilas] = useState<any[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const r = await listar<any>(`/reportes/pagos-por-periodo?desde=${hoy}&hasta=${hoy}&limite=8`);
        setFilas(r.filas);
      } catch {
        setFilas([]);
      }
    })();
  }, []);
  if (filas.length === 0) {
    return <p style={{ color: 'var(--texto-suave)', fontSize: 'var(--texto-md)' }}>Sin cobros hoy.</p>;
  }
  return (
    <div className="tabla-envolvente">
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">Pago</th>
            <th scope="col" className="tabla__numerico">Monto</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>#{f.id}</td>
              <td className="tabla__numerico">{f.monto_total}</td>
              <td>
                <Etiqueta tipo={f.estado === 'REVERTIDO' || f.estado === 'ANULADO' ? 'peligro' : 'exito'} icono={f.estado === 'REVERTIDO' || f.estado === 'ANULADO' ? 'close' : 'check_circle'}>
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
