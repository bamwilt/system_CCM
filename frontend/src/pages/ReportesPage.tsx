import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContexto';
import { Boton, Campo, Filtros, Importe, Mensaje, Tabla } from '../components/Comunes';
import { listar, mensajeDeError } from '../services/api';

/**
 * REPORTES (FASE 9)
 *
 * Consume la API de la Fase 8. Los importes llegan como texto exacto y se
 * muestran tal cual: la interfaz NO recalcula totales (PM: "No duplicar
 * calculos monetarios de manera inconsistente entre backend y frontend").
 */

type Reporte = 'recaudacion' | 'morosidad' | 'estudiantes-pendientes' | 'operaciones-anuladas';

export default function ReportesPage() {
  const { puede } = useSesion();
  const [reporte, setReporte] = useState<Reporte>('recaudacion');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [fechaCorte, setFechaCorte] = useState('');
  const [filas, setFilas] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  if (!puede('reportes:read')) {
    return <Mensaje tipo="info">Su usuario no tiene permiso para ver reportes.</Mensaje>;
  }

  async function consultar() {
    setCargando(true);
    setError(null);
    try {
      const parametros: Record<string, unknown> = {};
      if (reporte === 'morosidad') {
        if (fechaCorte.trim() === '') {
          setError('La morosidad requiere una fecha de corte.');
          setCargando(false);
          return;
        }
        parametros.fecha_corte = fechaCorte.trim();
      } else {
        if (desde.trim() !== '') {
          parametros.desde = desde.trim();
        }
        if (hasta.trim() !== '') {
          parametros.hasta = hasta.trim();
        }
      }
      const r = await listar<Record<string, unknown>>(`/reportes/${reporte}`, parametros);
      setFilas(r.filas);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void consultar();
  }, []);

  function columnasDe(reporteElegido: Reporte) {
    if (reporteElegido === 'recaudacion') {
      return [
        { encabezado: 'Dia', celda: (f: Record<string, unknown>) => String(f.dia) },
        { encabezado: 'Operaciones', celda: (f: Record<string, unknown>) => String(f.operaciones) },
        { encabezado: 'Total', celda: (f: Record<string, unknown>) => <Importe valor={String(f.total)} /> },
        { encabezado: 'Anuladas', celda: (f: Record<string, unknown>) => String(f.anuladas) },
      ];
    }
    if (reporteElegido === 'morosidad') {
      return [
        { encabezado: 'Estudiante', celda: (f: Record<string, unknown>) => String(f.estudiante_nombre) },
        { encabezado: 'Cuota', celda: (f: Record<string, unknown>) => String(f.numero_cuota) },
        { encabezado: 'Vence', celda: (f: Record<string, unknown>) => String(f.fecha_vencimiento) },
        { encabezado: 'Saldo', celda: (f: Record<string, unknown>) => <Importe valor={String(f.saldo_pendiente)} moneda={f.moneda as string | null} /> },
        { encabezado: 'Dias vencida', celda: (f: Record<string, unknown>) => String(f.dias_vencida) },
      ];
    }
    if (reporteElegido === 'estudiantes-pendientes') {
      return [
        { encabezado: 'Estudiante', celda: (f: Record<string, unknown>) => String(f.nombre) },
        { encabezado: 'Cuotas', celda: (f: Record<string, unknown>) => String(f.cuotas_pendientes) },
        { encabezado: 'Saldo', celda: (f: Record<string, unknown>) => <Importe valor={String(f.saldo_total)} moneda={f.moneda as string | null} /> },
      ];
    }
    return [
      { encabezado: 'Pago', celda: (f: Record<string, unknown>) => String(f.id) },
      { encabezado: 'Fecha', celda: (f: Record<string, unknown>) => String(f.fecha_pago) },
      { encabezado: 'Monto', celda: (f: Record<string, unknown>) => <Importe valor={String(f.monto_total)} /> },
      { encabezado: 'Estado', celda: (f: Record<string, unknown>) => String(f.estado) },
      { encabezado: 'Motivo', celda: (f: Record<string, unknown>) => String(f.revertido_motivo ?? '—') },
    ];
  }

  return (
    <div className="listado">
      <h2>Reportes</h2>

      <Filtros>
        <Campo etiqueta="Reporte" identificador="reporte">
          <select
            id="reporte"
            value={reporte}
            onChange={(e) => setReporte(e.target.value as Reporte)}
          >
            <option value="recaudacion">Recaudacion</option>
            <option value="morosidad">Morosidad</option>
            <option value="estudiantes-pendientes">Estudiantes pendientes</option>
            <option value="operaciones-anuladas">Operaciones anuladas</option>
          </select>
        </Campo>

        {reporte === 'morosidad' ? (
          <Campo
            etiqueta="Fecha de corte"
            identificador="corte"
            ayuda="Obligatoria: el reporte no usa la fecha del servidor."
          >
            <input
              id="corte"
              type="date"
              value={fechaCorte}
              onChange={(e) => setFechaCorte(e.target.value)}
            />
          </Campo>
        ) : (
          <>
            <Campo etiqueta="Desde" identificador="desde">
              <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta" identificador="hasta">
              <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </>
        )}

        <Boton tipo="primario" icono="search" onClick={() => void consultar()}>
          Consultar
        </Boton>
      </Filtros>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}
      {cargando ? <p role="status">Consultando...</p> : null}

      <Tabla<Record<string, unknown>>
        filas={filas}
        clave={(f) => String(f.id ?? f.dia ?? JSON.stringify(f))}
        columnas={columnasDe(reporte)}
        vacio={{ titulo: 'El reporte no devolvio filas.' }}
      />
    </div>
  );
}
