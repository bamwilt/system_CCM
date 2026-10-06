import { useEffect, useState } from 'react';
import { dashboard } from '../api/recursos';
import type { Dashboard } from '../api/tipos';
import { ErrorFatal } from '../componentes/Alerta';
import { formatearMoneda, formatearNumero } from '../componentes/formato';
import {
  IconoAsignaturas,
  IconoDocentes,
  IconoEstudiantes,
  IconoMatriculas,
  IconoNotas,
  IconoPagos,
} from '../componentes/Iconos';

/**
 * Panel de indicadores.
 *
 * Los gráficos son barras HTML con CSS, no una librería de charts: para estos
 * volúmenes (docenas de registros) son suficientes y evitan una dependencia
 * más que mantener.
 */

interface Tarjeta {
  etiqueta: string;
  valor: string;
  pie?: string;
  icono: React.ReactElement;
}

export function PaginaPanel() {
  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const control = new AbortController();
    dashboard(control.signal)
      .then(setDatos)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el panel');
      })
      .finally(() => setCargando(false));
    return () => control.abort();
  }, []);

  if (cargando) {
    return (
      <div className="ccm-estado">
        <div className="ccm-cargador" role="status" aria-label="Cargando el panel" />
      </div>
    );
  }

  if (error || !datos) {
    return <ErrorFatal titulo="No se pudo cargar el panel" detalle={error} />;
  }

  const t = datos.tarjetas;

  const tarjetas: Tarjeta[] = [
    {
      etiqueta: 'Estudiantes',
      valor: formatearNumero(t.estudiantes),
      pie: `${formatearNumero(t.alumnosMatriculados)} matriculados`,
      icono: <IconoEstudiantes tam={17} />,
    },
    {
      etiqueta: 'Docentes',
      valor: formatearNumero(t.docentes),
      pie: `${formatearNumero(t.empleados)} empleados en total`,
      icono: <IconoDocentes tam={17} />,
    },
    {
      etiqueta: 'Asignaturas',
      valor: formatearNumero(t.asignaturas),
      icono: <IconoAsignaturas tam={17} />,
    },
    {
      etiqueta: 'Matrículas',
      valor: formatearNumero(t.matriculas),
      icono: <IconoMatriculas tam={17} />,
    },
    {
      etiqueta: 'Notas registradas',
      valor: formatearNumero(t.notas),
      icono: <IconoNotas tam={17} />,
    },
    {
      etiqueta: 'Promedio general',
      valor: formatearNumero(t.promedioGeneral, 1),
      pie: 'Sobre 100',
      icono: <IconoPagos tam={17} />,
    },
  ];

  const ingresosTotal = datos.ingresos.reduce((suma, i) => suma + i.monto, 0);
  const maxIngresos = Math.max(1, ...datos.ingresos.map((i) => i.monto));

  return (
    <div className="ccm-pagina">
      <header>
        <h1 className="ccm-pagina-titulo">Panel general</h1>
        <p className="ccm-pagina-descripcion">
          Resumen de la institución y estado de la facturación.
        </p>
      </header>

      <div className="ccm-rejilla-tarjetas">
        {tarjetas.map((tarjeta) => (
          <article key={tarjeta.etiqueta} className="ccm-tarjeta">
            <div className="ccm-tarjeta-cabecera">
              <span className="ccm-tarjeta-etiqueta">{tarjeta.etiqueta}</span>
              <span className="ccm-tarjeta-icono">{tarjeta.icono}</span>
            </div>
            <p className="ccm-tarjeta-valor">{tarjeta.valor}</p>
            {tarjeta.pie && <p className="ccm-tarjeta-pie">{tarjeta.pie}</p>}
          </article>
        ))}
      </div>

      <div className="ccm-rejilla-graficos">
        {/* Estudiantes por nivel */}
        <section className="ccm-panel">
          <div className="ccm-panel-titulo">
            <h3>Estudiantes por nivel</h3>
            <span>{formatearNumero(t.estudiantes)} total</span>
          </div>
          <Barras
            datos={datos.porNivel.map((n) => ({ etiqueta: n.nivel, valor: n.total }))}
            formato={(v) => formatearNumero(v)}
          />
        </section>

        {/* Promedio por asignatura */}
        <section className="ccm-panel">
          <div className="ccm-panel-titulo">
            <h3>Promedio por asignatura</h3>
            <span>Sobre 100</span>
          </div>
          <Barras
            datos={datos.porAsignatura.map((a) => ({ etiqueta: a.asignatura, valor: a.promedio }))}
            formato={(v) => formatearNumero(v, 1)}
            // El promedio va de 0 a 100, no relativo al mayor: un 82 sobre 100
            // debe verse largo aunque sea el peor de la lista.
            maximo={100}
          />
        </section>

        {/* Ingresos por mes */}
        <section className="ccm-panel">
          <div className="ccm-panel-titulo">
            <h3>Ingresos por mes</h3>
            <span>{formatearMoneda(ingresosTotal)} cobrados</span>
          </div>
          {datos.ingresos.length === 0 ? (
            <p className="ccm-estado-texto" style={{ padding: 19 }}>
              Todavía no hay pagos registrados.
            </p>
          ) : (
            <Barras
              datos={datos.ingresos.map((i) => ({
                etiqueta: mesLegible(i.mes),
                valor: i.monto,
                pie: `${i.ordenes} ${i.ordenes === 1 ? 'orden' : 'órdenes'}`,
              }))}
              formato={(v) => formatearMoneda(v)}
              maximo={maxIngresos}
            />
          )}
        </section>

        {/* Estado de pagos */}
        <section className="ccm-panel">
          <div className="ccm-panel-titulo">
            <h3>Órdenes de pago</h3>
            <span>{formatearNumero(datos.estadoPagos.total)} en total</span>
          </div>
          <div style={{ padding: 19, display: 'grid', gap: 14 }}>
            <FilaEstado
              etiqueta="Pagadas"
              valor={datos.estadoPagos.pagadas}
              total={datos.estadoPagos.total}
              tono="exito"
            />
            <FilaEstado
              etiqueta="Pendientes"
              valor={datos.estadoPagos.pendientes}
              total={datos.estadoPagos.total}
              tono="alerta"
            />
          </div>

          {datos.topEstudiantes.length > 0 && (
            <>
              <div
                className="ccm-panel-titulo"
                style={{ borderTop: '1px solid var(--ccm-espacial-200)' }}
              >
                <h3>Mejores promedios</h3>
              </div>
              <div className="ccm-lista-clasificada">
                {datos.topEstudiantes.map((e, i) => (
                  <div key={e.nombre} className="ccm-clasificado-fila">
                    <span className="ccm-clasificado-sub" style={{ width: 22 }}>
                      {i + 1}.
                    </span>
                    <span className="ccm-clasificado-nombre">{e.nombre}</span>
                    <span className="ccm-clasificado-valor">{formatearNumero(e.promedio, 1)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Barras horizontales proporcionales. */
function Barras({
  datos,
  formato,
  maximo,
}: {
  datos: { etiqueta: string; valor: number; pie?: string }[];
  formato: (v: number) => string;
  maximo?: number;
}) {
  // Sin `maximo` explícito, la barra más larga ocupa todo el ancho; con él, se
  // compara contra ese techo (para el promedio, que va de 0 a 100).
  const techo = maximo ?? Math.max(1, ...datos.map((d) => d.valor));

  return (
    <div className="ccm-barras">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="ccm-barra-fila">
          <span className="ccm-barra-etiqueta" title={dato.etiqueta}>
            {dato.etiqueta}
          </span>
          <span className="ccm-barra-pista">
            <span
              className="ccm-barra-relleno"
              style={{ width: `${Math.min(100, (dato.valor / techo) * 100)}%` }}
            />
          </span>
          <span className="ccm-barra-valor" title={dato.pie}>
            {formato(dato.valor)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FilaEstado({
  etiqueta,
  valor,
  total,
  tono,
}: {
  etiqueta: string;
  valor: number;
  total: number;
  tono: 'exito' | 'alerta';
}) {
  const porcentaje = total === 0 ? 0 : Math.round((valor / total) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{etiqueta}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {formatearNumero(valor)}{' '}
          <span style={{ fontWeight: 400, color: 'var(--ccm-espacial-500)' }}>({porcentaje}%)</span>
        </span>
      </div>
      <span className="ccm-barra-pista">
        <span
          className="ccm-barra-relleno"
          style={{
            width: `${porcentaje}%`,
            background: tono === 'exito' ? 'var(--ccm-verde-700)' : 'var(--ccm-amarillo-700)',
          }}
        />
      </span>
    </div>
  );
}

/** `2026-01` → `Enero 2026`. */
function mesLegible(mes: string): string {
  const [anio, m] = mes.split('-');
  const indice = Number(m) - 1;
  const nombres = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const nombre = nombres[indice];
  return nombre ? `${nombre} ${anio}` : mes;
}
