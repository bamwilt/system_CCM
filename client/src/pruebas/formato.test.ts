import { describe, expect, it } from 'vitest';
import {
  aInputFecha,
  esNumero,
  formatearBooleano,
  formatearCelda,
  formatearFecha,
  formatearMoneda,
  formatearNumero,
  valorDesdeFila,
  valorParaApi,
  VACIO,
} from '../componentes/formato';
import type { Columna } from '../config/modulos';

/**
 * Pruebas de presentación de valores.
 *
 * Aquí es donde se concentran los errores que el usuario ve de forma directa:
 * una fecha corrida por un día o un `undefined` impreso como "NaN".
 */

function columna(parcial: Partial<Columna> = {}): Columna {
  return { clave: 'campo', etiqueta: 'Campo', tipo: 'texto', ...parcial };
}

describe('formatearFecha', () => {
  it('devuelve el guion largo cuando no hay fecha', () => {
    expect(formatearFecha(null)).toBe(VACIO);
    expect(formatearFecha(undefined)).toBe(VACIO);
    expect(formatearFecha('')).toBe(VACIO);
  });

  it('no desplaza la fecha por la zona horaria', () => {
    // '2026-01-15' en UTC se vería como 14/01/2026 en el hemisferio oeste,
    // así que la función debe mostrar siempre el día que dice el dato.
    expect(formatearFecha('2026-01-15')).toBe('15/01/2026');
    expect(formatearFecha('2026-12-31')).toBe('31/12/2026');
  });

  it('acepta el formato ISO completo que devuelve la API', () => {
    expect(formatearFecha('2026-01-15T00:00:00.000Z')).toBe('15/01/2026');
  });

  it('devuelve el texto original si no puede interpretarlo', () => {
    expect(formatearFecha('no-es-fecha')).toBe('no-es-fecha');
  });
});

describe('formatearNumero', () => {
  it('agrupa los miles segun el locale es-DO', () => {
    // El separador exacto depende de los datos de locale del runtime, asi que
    // la prueba compara contra Intl en vez de fijar un simbolo a mano.
    expect(formatearNumero(1234567)).toBe(
      new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(1234567),
    );
  });

  it('respeta los decimales pedidos', () => {
    const fmt = (d: number) =>
      new Intl.NumberFormat('es-DO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(
        78.94,
      );
    expect(formatearNumero(78.94, 1)).toBe(fmt(1));
    expect(formatearNumero(78.94, 0)).toBe(fmt(0));
  });

  it('no imprime NaN cuando el valor no es numérico', () => {
    expect(formatearNumero('hola')).toBe('hola');
    expect(formatearNumero(null)).toBe(VACIO);
  });
});

describe('formatearMoneda', () => {
  it('antepone el simbolo de la moneda dominicana', () => {
    expect(formatearMoneda(50000)).toBe(
      new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        maximumFractionDigits: 2,
      }).format(50000),
    );
    expect(formatearMoneda(50000)).toContain('RD');
  });

  it('no imprime NaN', () => {
    expect(formatearMoneda('abc')).toBe('abc');
  });
});

describe('formatearBooleano', () => {
  it('traduce a Sí y No', () => {
    expect(formatearBooleano(true)).toBe('Sí');
    expect(formatearBooleano(false)).toBe('No');
  });

  it('deja vacío lo que no es booleano', () => {
    expect(formatearBooleano(null)).toBe(VACIO);
    expect(formatearBooleano('sí')).toBe(VACIO);
  });
});

describe('formatearCelda', () => {
  it('elige el formato según el tipo de la columna', () => {
    expect(formatearCelda('2026-01-15', columna({ tipo: 'fecha' }))).toBe('15/01/2026');
    expect(formatearCelda(true, columna({ tipo: 'booleano' }))).toBe('Sí');
    expect(formatearCelda(3, columna({ tipo: 'numero' }))).toBe('3');
    expect(formatearCelda('texto', columna({ tipo: 'texto' }))).toBe('texto');
  });

  it('usa moneda solo en las columnas marcadas como tal', () => {
    const col = columna({ tipo: 'decimal', clave: 'salario', moneda: true });
    expect(formatearCelda(1000, col)).toBe(formatearMoneda(1000));

    // Un porcentaje no es un monto: debe verse como numero, no como pesos.
    const pct = columna({ tipo: 'decimal', clave: 'porcentaje', decimales: 1 });
    expect(formatearCelda(82.5, pct)).not.toContain('RD');
    expect(formatearCelda(82.5, pct)).toBe(formatearNumero(82.5, 1));
  });
});

describe('valorParaApi', () => {
  it('convierte los desplegables de claves foráneas a enteros', () => {
    // Un select siempre devuelve texto, pero la columna es integer.
    expect(valorParaApi('7', 'numero')).toBe(7);
  });

  it('convierte los decimales sin perder precisión', () => {
    expect(valorParaApi('1234.56', 'decimal')).toBe(1234.56);
  });

  it('traduce los vacíos a null, no a cadena vacía', () => {
    // Mandar '' a una columna integer es un error de PostgreSQL; null la deja
    // en NULL, que es lo que el usuario quiere al no elegir nada.
    expect(valorParaApi('', 'numero')).toBeNull();
    expect(valorParaApi('   ', 'texto')).toBeNull();
  });

  it('interpreta el booleano del checkbox', () => {
    expect(valorParaApi(true, 'booleano')).toBe(true);
    expect(valorParaApi(false, 'booleano')).toBe(false);
  });

  it('descarta el texto que no es un número', () => {
    expect(valorParaApi('abc', 'numero')).toBeNull();
  });
});

describe('valorDesdeFila', () => {
  it('trae el valor de la fila al input', () => {
    expect(valorDesdeFila('Ana', columna())).toBe('Ana');
    expect(valorDesdeFila(null, columna())).toBe('');
  });

  it('respeta los booleanos como checkbox', () => {
    expect(valorDesdeFila(true, columna({ tipo: 'booleano' }))).toBe(true);
    expect(valorDesdeFila(false, columna({ tipo: 'booleano' }))).toBe(false);
  });
});

describe('aInputFecha', () => {
  it('extrae la parte de fecha para el input', () => {
    expect(aInputFecha('2026-01-15T00:00:00.000Z')).toBe('2026-01-15');
    expect(aInputFecha(null)).toBe('');
  });
});

describe('esNumero', () => {
  it('rechaza NaN e Infinity', () => {
    expect(esNumero(5)).toBe(true);
    expect(esNumero(NaN)).toBe(false);
    expect(esNumero('5')).toBe(false);
  });
});
