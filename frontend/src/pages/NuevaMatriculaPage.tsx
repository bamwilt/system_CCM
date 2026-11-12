import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Boton, Campo, Confirmacion, Cargando, Mensaje, Notificacion } from '../components/Comunes';
import { mutationHeaders } from '../services/api';
import api from '../services/api';

/**
 * NUEVA MATRICULA (FASE 9)
 *
 * Completa el flujo que faltaba: crear la matricula con su plan de pago y sus
 * cuotas desde la interfaz, que es la tarea central del SGPM.
 *
 * Prevencion de errores (requisito del PM):
 * - el numero de cuotas lo decide la cantidad de fechas de vencimiento que la
 *   persona cargue; no hay valor por defecto inventado;
 * - cada fecha se valida en el navegador antes de enviar, pero el backend la
 *   revalida (nunca se confia en la validacion del cliente);
 * - confirmacion explicita antes de crear, porque la operacion es transaccional
 *   y genera obligaciones.
 */

interface Anio {
  id: number;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
}

interface Grado {
  id: number;
  nombre: string;
  anio_lectivo_id: number;
}

interface Tarifa {
  id: number;
  concepto: string;
  monto: string;
  moneda: string | null;
  anio_lectivo_id: number;
}

export default function NuevaMatriculaPage() {
  const { puede } = useSesion();
  const [estudianteId, setEstudianteId] = useState('');
  const [anioId, setAnioId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [tarifaId, setTarifaId] = useState('');
  const [fechas, setFechas] = useState('');
  const [descuento, setDescuento] = useState('');
  const [autorizadoPor, setAutorizadoPor] = useState('');
  const [anios, setAnios] = useState<Anio[]>([]);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ matricula: { id: number }; plan_pago_id: number; total_cuotas: number } | null>(null);

  useEffect(() => {
    if (!puede('matriculas:manage')) {
      return;
    }
    void (async () => {
      try {
        const [rAnios, rGrados, rTarifas] = await Promise.all([
          api.get<{ anios: Anio[] }>('/estudiantes/anios-lectivos'),
          api.get<{ grados: Grado[] }>('/estudiantes/grados'),
          api.get<{ tarifas: Tarifa[] }>('/estudiantes/tarifas'),
        ]);
        setAnios(rAnios.data.anios ?? []);
        setGrados(rGrados.data.grados ?? []);
        setTarifas(rTarifas.data.tarifas ?? []);
      } catch {
        // Los catalogos pueden no existir como endpoint: se deja vacio y la
        // persona introduce los identificadores a mano.
      }
    })();
  }, [puede]);

  if (!puede('matriculas:manage')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para crear matriculas.</Mensaje>;
  }

  function fechasValidas(): string[] | null {
    const lista = fechas
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f !== '');
    if (lista.length === 0 || lista.length > 120) {
      return null;
    }
    for (const f of lista) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        return null;
      }
      // Fecha real: evita que el navegador acepte 2026-02-31.
      const [y, m, d] = f.split('-').map(Number);
      const fecha = new Date(Date.UTC(y, m - 1, d));
      if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
        return null;
      }
    }
    // Orden ascendente y sin repetidas: el motor exige ambas condiciones.
    const ordenadas = [...lista].sort();
    if (ordenadas.join('|') !== lista.join('|')) {
      return null;
    }
    if (new Set(lista).size !== lista.length) {
      return null;
    }
    return lista;
  }

  function valido(): boolean {
    // Prevencion en el origen: un descuento sin autorizador no deja continuar,
    // en lugar de fallar despues de confirmar.
    if (descuento.trim() !== '' && autorizadoPor.trim() === '') {
      return false;
    }
    return (
      /^[1-9][0-9]*$/.test(estudianteId.trim()) &&
      /^[1-9][0-9]*$/.test(anioId.trim()) &&
      /^[1-9][0-9]*$/.test(gradoId.trim()) &&
      /^[1-9][0-9]*$/.test(tarifaId.trim()) &&
      fechasValidas() !== null
    );
  }

  async function crear() {
    setEnviando(true);
    setError(null);
    setNota(null);
    try {
      const cuerpo: Record<string, unknown> = {
        estudiante_id: Number(estudianteId.trim()),
        anio_lectivo_id: Number(anioId.trim()),
        grado_id: Number(gradoId.trim()),
        plan_pago: {
          tarifa_id: Number(tarifaId.trim()),
          fechas_vencimiento: fechasValidas(),
        },
      };
      if (descuento.trim() !== '') {
        if (autorizadoPor.trim() === '') {
          setError('Un descuento requiere indicar quien lo autoriza.');
          setEnviando(false);
          setConfirmando(false);
          return;
        }
        cuerpo.descuento = {
          porcentaje: descuento.trim(),
          autorizado_por: autorizadoPor.trim(),
        };
      }
      const respuesta = await api.post('/matriculas', cuerpo, { headers: mutationHeaders() });
      setResultado(respuesta.data);
      setNota(`Matricula creada con ${respuesta.data.total_cuotas} cuotas.`);
      setEstudianteId('');
      setFechas('');
      setDescuento('');
      setAutorizadoPor('');
    } catch (e) {
      const mensaje =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message;
      setError(typeof mensaje === 'string' ? mensaje : 'No se pudo crear la matricula.');
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="matricula">
      <h2>Nueva matricula</h2>

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
        <Campo etiqueta="Estudiante" identificador="estudiante">
          <input
            id="estudiante"
            inputMode="numeric"
            value={estudianteId}
            onChange={(e) => setEstudianteId(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Anio lectivo" identificador="anio">
          {anios.length > 0 ? (
            <select id="anio" value={anioId} onChange={(e) => setAnioId(e.target.value)}>
              <option value="">Seleccione</option>
              {anios.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.anio}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="anio"
              inputMode="numeric"
              value={anioId}
              onChange={(e) => setAnioId(e.target.value)}
            />
          )}
        </Campo>

        <Campo etiqueta="Grado" identificador="grado">
          {grados.length > 0 ? (
            <select
              id="grado"
              value={gradoId}
              onChange={(e) => {
                setGradoId(e.target.value);
                const grado = grados.find((g) => String(g.id) === e.target.value);
                if (grado) {
                  setAnioId(String(grado.anio_lectivo_id));
                  setTarifas((previas) => previas);
                }
              }}
            >
              <option value="">Seleccione</option>
              {grados.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="grado"
              inputMode="numeric"
              value={gradoId}
              onChange={(e) => setGradoId(e.target.value)}
            />
          )}
        </Campo>

        <Campo etiqueta="Tarifa" identificador="tarifa">
          {tarifas.length > 0 ? (
            <select id="tarifa" value={tarifaId} onChange={(e) => setTarifaId(e.target.value)}>
              <option value="">Seleccione</option>
              {tarifas.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.concepto} — {t.monto} {t.moneda ?? ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="tarifa"
              inputMode="numeric"
              value={tarifaId}
              onChange={(e) => setTarifaId(e.target.value)}
            />
          )}
        </Campo>

        <Campo
          etiqueta="Fechas de vencimiento"
          identificador="fechas"
          ayuda="Separadas por comas, ascendentes y sin repetir. La cantidad de fechas ES el numero de cuotas: no hay valor por defecto."
        >
          <input
            id="fechas"
            value={fechas}
            onChange={(e) => setFechas(e.target.value)}
            placeholder="2026-03-10, 2026-04-10"
          />
        </Campo>

        <Campo
          etiqueta="Descuento autorizado (opcional)"
          identificador="descuento"
          ayuda="Porcentaje sobre el monto de la tarifa. Requiere indicar quien lo autoriza."
        >
          <input
            id="descuento"
            inputMode="decimal"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
          />
        </Campo>
        {descuento.trim() !== '' && autorizadoPor.trim() === '' ? (
          <p className="campo__error" role="alert">
            Indique quien autoriza el descuento.
          </p>
        ) : null}

        {descuento.trim() !== '' ? (
          <Campo etiqueta="Autorizado por" identificador="autoriza">
            <input
              id="autoriza"
              value={autorizadoPor}
              onChange={(e) => setAutorizadoPor(e.target.value)}
            />
          </Campo>
        ) : null}

        <Boton tipo="primario" disabled={!valido()}>
          Crear matricula
        </Boton>
      </form>

      {enviando ? <Cargando texto="Creando matricula y plan de pago..." /> : null}

      {confirmando ? (
        <Confirmacion
          titulo="Confirmar la matricula"
          mensaje={`Se creara la matricula con ${fechasValidas()?.length ?? 0} cuotas. Esta operacion genera las obligaciones de pago.`}
          textoConfirmar="Si, crear"
          onConfirmar={crear}
          onCancelar={() => setConfirmando(false)}
          cargando={enviando}
        />
      ) : null}

      {resultado ? (
        <section className="matricula__resultado">
          <h3>Matricula creada</h3>
          <p>
            Matricula <strong>#{resultado.matricula.id}</strong> — plan{' '}
            <strong>#{resultado.plan_pago_id}</strong> con {resultado.total_cuotas} cuotas.
          </p>
        </section>
      ) : null}
    </div>
  );
}
