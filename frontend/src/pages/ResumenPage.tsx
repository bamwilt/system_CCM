import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../context/SesionContexto';
import {
  Boton,
  Cabecera,
  Esqueleto,
  Etiqueta,
  Importe,
  Indicador,
  Mensaje,
} from '../components/Comunes';
import { listar, mensajeDeError } from '../services/api';

/**
 * ============================================================================
 * RESUMEN DEL DÍA (FASE 9.B)
 * ============================================================================
 *
 * Pantalla de inicio: las cifras que el personal necesita al empezar el turno.
 * Todas salen de los reportes de la Fase 8 — la interfaz NO recalcula (PM: "No
 * duplicar calculos monetarios de manera inconsistente").
 */

interface FilaRecaudacion {
  dia: string;
  operaciones: number;
  total: string;
  anuladas: number;
  total_anulado: string;
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

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ResumenPage() {
  const { puede } = useSesion();
  const navegar = useNavigate();
  const [recaudacion, setRecaudacion] = useState<FilaRecaudacion[]>([]);
  const [morosos, setMorosos] = useState<FilaMoroso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      setError(null);
      try {
        if (puede('reportes:read')) {
          const [rRec, rMor] = await Promise.all([
            listar<FilaRecaudacion>(`/reportes/recaudacion?desde=${hoy()}&hasta=${hoy()}&limite=1`),
            listar<FilaMoroso>(`/reportes/morosidad?fecha_corte=${hoy()}&limite=5`),
          ]);
          setRecaudacion(rRec.filas);
          setMorosos(rMor.filas);
        }
      } catch (e) {
        setError(mensajeDeError(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [puede]);

  if (!puede('reportes:read')) {
    return (
      <>
        <Cabecera
          titulo="Resumen del día"
          descripcion="Cifras de hoy sobre los registros oficiales."
          accion={puede('pagos:manage') ? <Boton icono="payments" onClick={() => navegar('/cobro')}>Registrar cobro</Boton> : undefined}
        />
        <Mensaje tipo="info">Su usuario no tiene permiso para ver reportes financieros.</Mensaje>
      </>
    );
  }

  const recaudado = recaudacion.reduce((acc, f) => acc + Number(f.total), 0);
  const operaciones = recaudacion.reduce((acc, f) => acc + f.operaciones, 0);
  const anuladas = recaudacion.reduce((acc, f) => acc + f.anuladas, 0);
  const deudaVencida = morosos.reduce((acc, m) => acc + Number(m.saldo_pendiente), 0);

  return (
    <>
      <Cabecera
        titulo="Resumen del día"
        descripcion="Cifras de hoy sobre los registros oficiales."
        accion={
          puede('pagos:manage') ? (
            <Boton icono="payments" onClick={() => navegar('/cobro')}>
              Registrar cobro
            </Boton>
          ) : undefined
        }
      />

      {error ? <Mensaje tipo="error" onCerrar={() => setError(null)}>{error}</Mensaje> : null}

      {cargando ? (
        <div className="rejilla rejilla--4">
          <Esqueleto lineas={1} tipo="indicador" />
          <Esqueleto lineas={1} tipo="indicador" />
          <Esqueleto lineas={1} tipo="indicador" />
          <Esqueleto lineas={1} tipo="indicador" />
        </div>
      ) : (
        <>
          <div className="rejilla rejilla--4" style={{ marginBottom: 'var(--esp-8)' }}>
            <Indicador
              etiqueta="Recaudado hoy"
              valor={<Importe valor={recaudado.toFixed(2)} />}
              nota="Solo operaciones no anuladas"
              icono="savings"
              tono="exito"
            />
            <Indicador
              etiqueta="Cobros registrados"
              valor={String(operaciones)}
              nota="Operaciones de hoy"
              icono="receipt_long"
              tono="acento"
            />
            <Indicador
              etiqueta="Anulaciones"
              valor={String(anuladas)}
              nota="Operaciones revertidas"
              icono="close"
              tono="peligro"
            />
            <Indicador
              etiqueta="Deuda vencida"
              valor={<Importe valor={deudaVencida.toFixed(2)} />}
              nota={`${morosos.length} cuotas vencidas`}
              icono="schedule"
              tono="aviso"
            />
          </div>

          <div className="contenido__cabecera" style={{ marginBottom: 'var(--esp-3)' }}>
            <h2 style={{ fontSize: 'var(--texto-lg)' }}>Cuotas vencidas</h2>
            <Boton tipo="fantasma" icono="open_in_new" onClick={() => navegar('/reportes')}>
              Ver todas
            </Boton>
          </div>

          {morosos.length === 0 ? (
            <div className="tarjeta">
              <p style={{ color: 'var(--texto-suave)' }}>
                No hay cuotas vencidas. Todo al día.
              </p>
            </div>
          ) : (
            <div className="tabla-envolvente">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Estudiante</th>
                    <th scope="col">Cuota</th>
                    <th scope="col">Vence</th>
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
                    <tr key={m.mensualidad_id}>
                      <td>{m.estudiante_nombre}</td>
                      <td>{m.numero_cuota}</td>
                      <td>{m.fecha_vencimiento}</td>
                      <td className="tabla__numerico">
                        <Importe valor={m.saldo_pendiente} moneda={m.moneda} />
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
        </>
      )}
    </>
  );
}
