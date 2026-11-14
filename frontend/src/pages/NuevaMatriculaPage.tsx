import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import {
  Boton,
  Cabecera,
  Campo,
  Cargando,
  Confirmacion,
  Etiqueta,
  Importe,
  Mensaje,
  Notificacion,
} from '../components/Comunes';
import TablaEstudiantes, { type EstudianteElegible } from '../components/TablaEstudiantes';
import { mutationHeaders } from '../services/api';
import { conMoneda } from '../utils/formato';
import api from '../services/api';

/**
 * ============================================================================
 * NUEVA MATRÍCULA (FASE 9.B)
 * ============================================================================
 *
 * Misma composición que "Registrar cobro":
 *   - Cabecera con título, descripción y acción.
 *   - TablaEstudiantes arriba: filtros por nombre, documento y grado que se
 *     aplican mientras se escribe, y un botón "Elegir" por fila que completa
 *     los datos (igual que TablaDeudores en la pantalla de cobro).
 *   - Layout de dos columnas: formulario a la izquierda, resumen a la derecha.
 *   - Confirmación explícita antes de crear.
 *
 * Prevención de errores (requisito del PM):
 * - el número de cuotas lo decide la cantidad de fechas de vencimiento;
 * - cada fecha se valida en el navegador y el backend la revalida;
 * - un descuento sin autorizador impide continuar;
 * - el botón se deshabilita hasta que el formulario es válido.
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
  nivel: string;
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
  const navegar = useNavigate();

  const [estudianteId, setEstudianteId] = useState('');
  const [estudianteElegido, setEstudianteElegido] = useState<EstudianteElegible | null>(null);
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
  const [resultado, setResultado] = useState<{
    matricula: { id: number };
    plan_pago_id: number;
    total_cuotas: number;
  } | null>(null);

  const tarifaElegida = tarifas.find((t) => String(t.id) === tarifaId);
  // La tarifa define la naturaleza del cobro: la mensualidad se cobra varias
  // veces (una cuota por fecha); la matricula y el uniforme se cobran UNA sola
  // vez. La interfaz es la misma, la validacion no.
  const esRecurrente = tarifaElegida ? /mensual/i.test(tarifaElegida.concepto) : false;
  // Mensualidades (varias cuotas) separadas de pagos únicos (una sola).
  const tarifasMensuales = tarifas.filter((t) => /mensual/i.test(t.concepto));
  const tarifasUnicas = tarifas.filter((t) => !/mensual/i.test(t.concepto));
  const montoPorCuota = tarifaElegida ? conMoneda(tarifaElegida.monto, tarifaElegida.moneda) : '—';
  // Año (número) seleccionado: la tabla lo usa para saber si el estudiante ya
  // cursa ese año, en cuyo caso no se le puede volver a matricular.
  const anioActivo = anios.find((a) => String(a.id) === anioId)?.anio ?? null;

  const listaFechas = fechasValidas();
  const totalCuotas = listaFechas?.length ?? 0;
  const totalPlan = tarifaElegida && listaFechas ? Number(tarifaElegida.monto) * listaFechas.length : 0;

  function elegir(estudiante: EstudianteElegible) {
    setEstudianteId(String(estudiante.id));
    setEstudianteElegido(estudiante);
    // Al cambiar de persona se limpia la academia elegida: no arrastra grados
    // ni tarifas de otra matricula.
    setAnioId('');
    setGradoId('');
    setTarifaId('');
    setFechas('');
    setDescuento('');
    setAutorizadoPor('');
  }

  /** Quita la seleccion: vuelve al estado inicial para elegir a otro. */
  function deseleccionar() {
    setEstudianteId('');
    setEstudianteElegido(null);
    setAnioId('');
    setGradoId('');
    setTarifaId('');
    setFechas('');
    setDescuento('');
    setAutorizadoPor('');
    setResultado(null);
    setNota(null);
    setError(null);
  }

  // -------------------------------------------------------------------------
  // Catálogos: años, grados y tarifas
  // -------------------------------------------------------------------------
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
        setError('No se pudieron cargar los catálogos (años, grados, tarifas).');
      }
    })();
  }, [puede]);

  // Grado y tarifa dependen del año elegido.
  useEffect(() => {
    if (anioId === '') {
      return;
    }
    void (async () => {
      try {
        const [rGrados, rTarifas] = await Promise.all([
          api.get<{ grados: Grado[] }>('/estudiantes/grados', { params: { anio_lectivo_id: anioId } }),
          api.get<{ tarifas: Tarifa[] }>('/estudiantes/tarifas', { params: { anio_lectivo_id: anioId } }),
        ]);
        setGrados(rGrados.data.grados ?? []);
        setTarifas(rTarifas.data.tarifas ?? []);
        if (!rGrados.data.grados?.some((g) => String(g.id) === gradoId)) {
          setGradoId('');
        }
        if (!rTarifas.data.tarifas?.some((t) => String(t.id) === tarifaId)) {
          setTarifaId('');
        }
      } catch {
        setGrados([]);
        setTarifas([]);
      }
    })();
  }, [anioId]);

  if (!puede('matriculas:manage')) {
    return (
      <>
        <Cabecera titulo="Nueva matrícula" />
        <Mensaje tipo="info">Su usuario no tiene permiso para crear matrículas.</Mensaje>
      </>
    );
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
      const [y, m, d] = f.split('-').map(Number);
      const fecha = new Date(Date.UTC(y, m - 1, d));
      if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
        return null;
      }
    }
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
    if (descuento.trim() !== '' && autorizadoPor.trim() === '') {
      return false;
    }
    const fechas = fechasValidas();
    if (fechas === null) {
      return false;
    }
    // La matricula y el uniforme se cobran una sola vez: una unica fecha. La
    // mensualidad admite varias (una cuota por fecha).
    if (!esRecurrente && fechas.length !== 1) {
      return false;
    }
    return (
      /^[1-9][0-9]*$/.test(estudianteId.trim()) &&
      /^[1-9][0-9]*$/.test(anioId.trim()) &&
      /^[1-9][0-9]*$/.test(gradoId.trim()) &&
      /^[1-9][0-9]*$/.test(tarifaId.trim())
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
          setError('Un descuento requiere indicar quién lo autoriza.');
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
      setNota(`Matrícula creada con ${respuesta.data.total_cuotas} cuotas.`);
      setEstudianteId('');
      setEstudianteElegido(null);
      setAnioId('');
      setGradoId('');
      setTarifaId('');
      setFechas('');
      setDescuento('');
      setAutorizadoPor('');
    } catch (e) {
      const mensaje =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message;
      setError(typeof mensaje === 'string' ? mensaje : 'No se pudo crear la matrícula.');
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <>
      <Cabecera
        titulo="Nueva matrícula"
        descripcion="Elija al estudiante, el año lectivo, el grado, la tarifa y las fechas de vencimiento."
        accion={
          <Boton tipo="secundario" icono="school" onClick={() => navegar('/estudiantes')}>
            Ver estudiantes
          </Boton>
        }
      />

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}
      {nota ? <Notificacion tipo="exito" texto={nota} onCerrar={() => setNota(null)} /> : null}

      {/* ---------------- Paso 1: tabla para elegir al estudiante ---------------- */}
      <TablaEstudiantes
        onElegir={elegir}
        seleccionadoId={estudianteId ? Number(estudianteId) : null}
        anioActivo={anioActivo}
      />

      {/* -------- Paso 2 y 3: formulario + resumen (siempre visibles) -------- */}
      <div className="cobro">
          {/* Columna izquierda: formulario */}
          <div className="cobro__col">
            <section className="cobro__panel">
              <h2 className="panel__titulo">
                <span className="icono">receipt_long</span>
                2. Datos de la matrícula
              </h2>
              {estudianteElegido ? (
                <div className="elegido" style={{ marginBottom: 'var(--esp-4)' }}>
                  <span className="buscador__avatar" aria-hidden="true">
                    {estudianteElegido.nombres.charAt(0)}
                    {estudianteElegido.apellidos.charAt(0)}
                  </span>
                  <div className="elegido__texto">
                    <div className="elegido__nombre">
                      {estudianteElegido.nombres} {estudianteElegido.apellidos}
                    </div>
                    <div className="elegido__meta">
                      documento {estudianteElegido.documento_identidad} · estudiante #{estudianteElegido.id}
                      {estudianteElegido.grado ? ` · cursa ${estudianteElegido.grado}` : ''}
                    </div>
                  </div>
                  <Etiqueta tipo="info" icono="badge">
                    {(estudianteElegido.anios_matriculados?.length ?? 0) > 0
                      ? `Matriculado en ${(estudianteElegido.anios_matriculados ?? []).join(', ')}`
                      : 'Sin matrícula'}
                  </Etiqueta>
                  <Boton tipo="fantasma" icono="close" onClick={deseleccionar}>
                    Quitar
                  </Boton>
                </div>
              ) : (
                <div className="panel__vacio" style={{ marginBottom: 'var(--esp-3)' }}>
                  <span className="icono">person_search</span>
                  <span>
                    Elija un estudiante arriba. Los campos ya puede irlos completando.
                  </span>
                </div>
              )}
              <form
                onSubmit={(evento) => {
                  evento.preventDefault();
                  if (valido()) {
                    setConfirmando(true);
                  }
                }}
              >
                <div>
                  <Campo
                    etiqueta="Año lectivo"
                    identificador="anio"
                    ayuda="Del año depende qué grados y tarifas se ofrecen."
                  >
                    <select id="anio" value={anioId} onChange={(e) => setAnioId(e.target.value)}>
                      <option value="">Seleccione el año</option>
                      {anios.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.anio}
                        </option>
                      ))}
                    </select>
                  </Campo>

                  <Campo etiqueta="Grado" identificador="grado">
                    <select id="grado" value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
                      <option value="">
                        {anioId === '' ? 'Primero elija el año' : 'Seleccione el grado'}
                      </option>
                      {grados.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                          {g.nombre}
                        </option>
                      ))}
                    </select>
                  </Campo>

                  <Campo
                    etiqueta="Tarifa"
                    identificador="tarifa"
                    ayuda={
                      esRecurrente
                        ? 'Mensualidad: el monto es el de CADA cuota.'
                        : tarifaElegida
                          ? 'Pago único (matrícula o uniforme): se cobra UNA sola vez.'
                          : 'Elija qué va a cobrar: mensualidades o un pago único.'
                    }
                  >
                    <select id="tarifa" value={tarifaId} onChange={(e) => setTarifaId(e.target.value)}>
                      <option value="">
                        {anioId === '' ? 'Primero elija el año' : 'Seleccione la tarifa'}
                      </option>
                      {/* Separado por naturaleza: mensualidades (varias cuotas) de
                          pagos únicos (una sola cuota). Antes salían mezclados en
                          una sola lista y se elegía sin saber qué implicaba. */}
                      <optgroup label="Mensualidades — una cuota por fecha">
                        {tarifasMensuales.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.concepto} — <Importe valor={t.monto} moneda={t.moneda} />
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Pagos únicos — una sola fecha">
                        {tarifasUnicas.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.concepto} — <Importe valor={t.monto} moneda={t.moneda} />
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </Campo>

                  <Campo
                    etiqueta={esRecurrente ? 'Fechas de vencimiento' : 'Fecha de vencimiento'}
                    identificador="fechas"
                    ayuda={
                      esRecurrente
                        ? 'Separadas por comas, ascendentes y sin repetir. La cantidad de fechas ES el número de cuotas.'
                        : 'La matrícula y el uniforme se cobran UNA sola vez: indique una única fecha.'
                    }
                  >
                    <input
                      id="fechas"
                      value={fechas}
                      onChange={(e) => setFechas(e.target.value)}
                      placeholder={esRecurrente ? '2026-03-10, 2026-04-10' : '2026-03-10'}
                    />
                  </Campo>
                  {/* Aviso vivo: evita el error despues de confirmar. */}
                  {tarifaElegida && !esRecurrente && listaFechas !== null && listaFechas.length !== 1 ? (
                    <p className="campo__error" role="alert">
                      La tarifa "{tarifaElegida.concepto}" se cobra una sola vez: deje una única fecha.
                    </p>
                  ) : null}

                  <Campo
                    etiqueta="Descuento autorizado (opcional)"
                    identificador="descuento"
                    ayuda="Porcentaje sobre el monto de la tarifa. Requiere indicar quién lo autoriza."
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
                      Indique quién autoriza el descuento.
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
                </div>

                <div className="cobro__acciones">
                  <span className="cobro__nota">
                    {totalCuotas > 0 ? `Plan: ${totalCuotas} cuota${totalCuotas !== 1 ? 's' : ''}` : ''}
                    {totalPlan > 0
                      ? ` · Total: ${conMoneda(totalPlan.toFixed(2), tarifaElegida?.moneda ?? null)}`
                      : ''}
                  </span>
                  <Boton
                    tipo="primario"
                    disabled={!valido()}
                    onClick={() => {
                      if (valido()) {
                        setConfirmando(true);
                      }
                    }}
                  >
                    Crear matricula
                  </Boton>
                </div>
              </form>
            </section>
          </div>

          {/* Columna derecha: resumen de la operación */}
          <div className="cobro__col cobro__panel--crecer">
            <section className="cobro__panel">
              <h2 className="panel__titulo">
                <span className="icono">receipt_long</span>
                Resumen de la operación
              </h2>
              <dl className="resumen">
                <div className="resumen__fila">
                  <dt>Persona</dt>
                  <dd>
                    {estudianteElegido
                      ? `${estudianteElegido.nombres} ${estudianteElegido.apellidos}`
                      : '—'}
                  </dd>
                </div>
                <div className="resumen__fila">
                  <dt>Año lectivo</dt>
                  <dd>{anios.find((a) => String(a.id) === anioId)?.anio ?? '—'}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Grado</dt>
                  <dd>{grados.find((g) => String(g.id) === gradoId)?.nombre ?? '—'}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Tarifa</dt>
                  <dd>{tarifaElegida?.concepto ?? '—'}</dd>
                </div>
                {tarifaElegida ? (
                  <div className="resumen__fila">
                    <dt>Tipo de cobro</dt>
                    <dd>
                      {esRecurrente ? 'Mensual · una cuota por fecha' : 'Pago único · una sola cuota'}
                    </dd>
                  </div>
                ) : null}
                <div className="resumen__fila">
                  <dt>{esRecurrente ? 'Monto por cuota' : 'Monto'}</dt>
                  <dd>{montoPorCuota}</dd>
                </div>
                <div className="resumen__fila">
                  <dt>Número de cuotas</dt>
                  <dd>{totalCuotas > 0 ? String(totalCuotas) : '—'}</dd>
                </div>
                {totalPlan > 0 ? (
                  <div className="resumen__fila resumen__fila--total">
                    <dt>Total del plan</dt>
                    <dd>{conMoneda(totalPlan.toFixed(2), tarifaElegida?.moneda ?? null)}</dd>
                  </div>
                ) : null}
                {descuento.trim() !== '' ? (
                  <div className="resumen__fila">
                    <dt>Descuento</dt>
                    <dd>
                      {descuento.trim()}% autorizado por {autorizadoPor || '—'}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {totalCuotas === 0 && anioId !== '' && gradoId !== '' && tarifaId !== '' ? (
                <div className="panel__vacio">
                  <span className="icono">error</span>
                  <p>Complete las fechas de vencimiento para ver el resumen del plan.</p>
                </div>
              ) : null}
            </section>
          </div>
        </div>

      {enviando ? <Cargando texto="Creando matrícula y plan de pago…" /> : null}

      {confirmando ? (
        <Confirmacion
          titulo="Confirmar la matrícula"
          mensaje={`Se creará la matrícula con ${totalCuotas} cuota${totalCuotas !== 1 ? 's' : ''}. Esta operación genera las obligaciones de pago.`}
          textoConfirmar="Sí, crear"
          onConfirmar={crear}
          onCancelar={() => setConfirmando(false)}
          cargando={enviando}
        />
      ) : null}

      {resultado ? (
        <section className="matricula__resultado">
          <h3>Matrícula creada</h3>
          <p>
            Matrícula <strong>#{resultado.matricula.id}</strong> — plan{' '}
            <strong>#{resultado.plan_pago_id}</strong> con {resultado.total_cuotas} cuotas.
          </p>
          <Boton tipo="secundario" icono="payments" onClick={() => navegar('/cobro')}>
            Registrar cobro para esta matrícula
          </Boton>
        </section>
      ) : null}
    </>
  );
}