import { useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { useNavigate } from 'react-router-dom';
import { Boton, Campo, Confirmacion, Cargando, Mensaje, Notificacion } from '../components/Comunes';
import { mutationHeaders } from '../services/api';
import api from '../services/api';

/**
 * REGISTRAR COBRO (FASE 9) — la tarea frecuente y la mas critica.
 *
 * Requisito del PM: "No utilizar animaciones innecesarias que retrasen el
 * registro de pagos" y "El personal administrativo debe poder realizar las
 * tareas frecuentes con una cantidad razonable de interacciones".
 *
 * Prevencion de errores:
 * - el boton se deshabilita mientras se envia (no hay doble clic posible);
 * - la confirmacion es explícita antes de afectar saldos;
 * - los importes viajan como texto exacto, sin conversion a Number.
 */

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
  const [fechaEfectiva, setFechaEfectiva] = useState('');
  const [medio, setMedio] = useState('EFECTIVO');
  const [motivoIdempotencia, setMotivoIdempotencia] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobro | null>(null);

  // Sin permiso no se muestra el formulario: la ruta igual lo rechazaria.
  if (!puede('pagos:manage')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para registrar cobros.</Mensaje>;
  }

  function valido(): boolean {
    return (
      /^[1-9][0-9]*$/.test(matriculaId.trim()) &&
      /^[0-9]+(\.[0-9]{1,2})?$/.test(monto.trim()) &&
      Number(monto.trim()) > 0 &&
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
        medios: [{ tipo: medio, monto: monto.trim() }],
      };
      if (motivoIdempotencia.trim() !== '') {
        cuerpo.idempotency_key = motivoIdempotencia.trim();
      }
      const respuesta = await api.post('/pagos', cuerpo, { headers: mutationHeaders() });
      setResultado(respuesta.data as ResultadoCobro);
      setNota('Cobro registrado correctamente.');
      setMatriculaId('');
      setMonto('');
      setMotivoIdempotencia('');
    } catch (e) {
      const mensaje =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message;
      setError(typeof mensaje === 'string' ? mensaje : 'No se pudo registrar el cobro.');
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="cobro">
      <h2>Registrar cobro</h2>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}
      {nota ? <Notificacion tipo="exito" texto={nota} onCerrar={() => setNota(null)} /> : null}

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          if (valido()) {
            setConfirmando(true);
          }
        }}
      >
        <Campo etiqueta="Matricula" identificador="matricula">
          <input
            id="matricula"
            inputMode="numeric"
            value={matriculaId}
            onChange={(e) => setMatriculaId(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Monto" identificador="monto" ayuda="Use punto decimal, por ejemplo 1500.00">
          <input
            id="monto"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Fecha efectiva" identificador="fecha">
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

        <Campo
          etiqueta="Clave de reintento (opcional)"
          identificador="idem"
          ayuda="Si el cobro se interrumpe, repitalo con la misma clave: no se duplicara."
        >
          <input
            id="idem"
            value={motivoIdempotencia}
            onChange={(e) => setMotivoIdempotencia(e.target.value)}
          />
        </Campo>

        <Boton tipo="primario" disabled={!valido()}>
          Confirmar cobro
        </Boton>
      </form>

      {enviando ? <Cargando texto="Registrando cobro..." /> : null}

      {confirmando ? (
        <Confirmacion
          titulo="Confirmar el cobro"
          mensaje={`Se registrara un cobro de ${monto} por ${medio} sobre la matricula ${matriculaId}. Esta operacion afecta los saldos.`}
          textoConfirmar="Si, registrar"
          onConfirmar={registrar}
          onCancelar={() => setConfirmando(false)}
          cargando={enviando}
        />
      ) : null}

      {resultado ? (
        <section className="cobro__resultado">
          <h3>Cobro registrado</h3>
          <p>
            Pago <strong>#{resultado.pago.id}</strong> por {resultado.pago.monto_total} — estado{' '}
            {resultado.pago.estado}.
          </p>
          {resultado.comprobante.numero_comprobante ? (
            <p>
              Comprobante <strong>{resultado.comprobante.numero_comprobante}</strong>.
            </p>
          ) : null}
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Cuota</th>
                <th scope="col">Aplicado</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {resultado.aplicaciones.map((a) => (
                <tr key={a.numero_cuota}>
                  <td>{a.numero_cuota}</td>
                  <td>{a.monto_aplicado}</td>
                  <td>{a.saldo_pendiente}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Boton tipo="secundario" onClick={() => navegar('/reportes')}>
            Ver reportes
          </Boton>
        </section>
      ) : null}
    </div>
  );
}
