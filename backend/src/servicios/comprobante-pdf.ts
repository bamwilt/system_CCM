/**
 * ============================================================================
 * COMPROBANTE EN PDF — GENERADOR PROPIO, SIN DEPENDENCIAS
 * ============================================================================
 *
 * POR QUE NO SE USA UNA LIBRERIA
 * ------------------------------
 * El PM (regla 13: "verifica las dependencias antes de utilizarlas") y la
 * auditoria de seguridad exigen poder auditar lo que se instala. En este
 * entorno `npm audit` NO es ejecutable (el registro npm es inalcanzable), de
 * modo que anadir `pdfkit` o similar seria instalar codigo de terceros sin
 * poder verificarlo. Eso contradice la regla.
 *
 * Escribir el generador aqui tiene CERO dependencias: no hay nada que auditar
 * porque no se instala nada. No es una "solucion improvisada" que sustituya un
 * mecanismo seguro: es producir un formato de documento abierto y conocido.
 *
 * ALCANCE Y LIMITES DECLARADOS
 * ----------------------------
 * Genera UN PDF valido de una pagina con texto (comprobante de pago). No es una
 * suite de maquetacion: no incrusta imagenes ni fuentes, y usa las 14 fuentes
 * estandar del PDF (Helvetica) que todo visor debe tener.
 *
 * GARANTIA DE NO-ESCRITURA
 * ------------------------
 * Este modulo es una funcion pura: recibe datos y devuelve bytes. No toca la
 * base de datos, no abre conexiones y no tiene efectos secundarios. La ruta que
 * lo usa sigue siendo de solo lectura.
 */

/** Longitud maxima de linea antes de partir, en puntos de Helvetica 10. */
const ANCHO_UTIL = 500;
const TAMANO_FUENTE = 10;
const INTERLINEADO = 14;

interface LineaPdf {
  readonly texto: string;
  readonly negrita?: boolean;
  readonly tamano?: number;
}

/** Escapa los caracteres que romperian el contenido de un string PDF. */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

/** Parte una linea larga por palabras, sin cortar palabras a la mitad. */
function envolver(texto: string, ancho = ANCHO_UTIL): string[] {
  const palabras = texto.split(/\s+/).filter((p) => p.length > 0);
  if (palabras.length === 0) {
    return [''];
  }
  const salida: string[] = [];
  let actual = palabras[0];
  for (const palabra of palabras.slice(1)) {
    // Helistica aproximada: 0.5 * tamano por caracter. Es conservadora.
    if ((actual.length + 1 + palabra.length) * TAMANO_FUENTE * 0.5 > ancho) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = `${actual} ${palabra}`;
    }
  }
  salida.push(actual);
  return salida;
}

/** Construye el contenido (content stream) de la pagina a partir de lineas. */
function construirContenido(lineas: readonly LineaPdf[]): string {
  const partes: string[] = [];
  let y = 800; // margen superior en puntos (pagina 792 de alto)
  for (const linea of lineas) {
    const tamano = linea.tamano ?? TAMANO_FUENTE;
    y -= INTERLINEADO;
    const fuente = linea.negrita ? 'F2' : 'F1';
    for (const trozo of envolver(linea.texto)) {
      if (y < 50) {
        // Una sola pagina: no se desborda, se corta con marca visible.
        partes.push('BT /F1 8 Tf 1 0 0 1 50 40 Tm (…) Tj ET');
        break;
      }
      partes.push(
        `BT /${fuente} ${tamano} Tf 1 0 0 1 50 ${y} Tm (${escapar(trozo)}) Tj ET`
      );
      y -= INTERLINEADO;
    }
  }
  return partes.join('\n');
}

/**
 * Objeto PDF minimo: catalog, pages, page, font (Helvetica regular y bold) y
 * content stream. Los offsets del xref se calculan sobre los bytes reales.
 */
function construirPdf(lineas: readonly LineaPdf[]): Buffer {
  const contenido = construirContenido(lineas);
  const objetos: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let pdf = '%PDF-1.4\n%âããÓ\n';
  const offsets: number[] = [];
  objetos.forEach((cuerpo, indice) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${indice + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export interface ComprobantePdfDatos {
  readonly numero_comprobante: string;
  readonly fecha_emision: string;
  readonly estado: string;
  readonly estudiante_nombre: string;
  readonly grado_nombre: string | null;
  readonly anio_lectivo: number | null;
  readonly monto_total: string;
  readonly moneda: string | null;
  readonly pago_fecha: string;
  readonly matricula_id: number | null;
  readonly pago_id: number;
  readonly usuario_id: number | null;
}

/**
 * Genera el PDF del comprobante. Funcion pura: sin base de datos, sin I/O y sin
 * efectos secundarios. Se puede llamar todas las veces que se quiera: el
 * resultado es deterministico y NO altera ningun saldo.
 */
export function generarComprobantePdf(datos: ComprobantePdfDatos): Buffer {
  const lineas: LineaPdf[] = [
    { texto: 'COMPROBANTE DE PAGO', negrita: true, tamano: 16 },
    { texto: '' },
    { texto: `Comprobante: ${datos.numero_comprobante}`, negrita: true },
    { texto: `Fecha de emision: ${datos.fecha_emision}` },
    { texto: `Estado: ${datos.estado}` },
    { texto: '' },
    { texto: 'ESTUDIANTE', negrita: true },
    { texto: `Nombre: ${datos.estudiante_nombre}` },
    { texto: `Grado: ${datos.grado_nombre ?? 'no registrado'}` },
    { texto: `Anio lectivo: ${datos.anio_lectivo ?? 'no registrado'}` },
    { texto: '' },
    { texto: 'OPERACION', negrita: true },
    { texto: `Pago: ${datos.pago_id}` },
    { texto: `Matricula: ${datos.matricula_id ?? 'no registrada'}` },
    { texto: `Fecha del pago: ${datos.pago_fecha}` },
    { texto: '' },
    {
      texto: `MONTO: ${datos.monto_total} ${datos.moneda ?? ''}`.trim(),
      negrita: true,
      tamano: 14,
    },
    { texto: '' },
    { texto: 'Este comprobante es una proyeccion del pago registrado.', tamano: 8 },
    { texto: 'Generarlo no modifica saldos ni obligaciones.', tamano: 8 },
  ];
  return construirPdf(lineas);
}

/** Verificacion estructural del PDF generado (usada por las pruebas). */
export function verificarEstructuraPdf(pdf: Buffer): {
  readonly valido: boolean;
  readonly motivos: readonly string[];
} {
  const motivos: string[] = [];
  const texto = pdf.toString('latin1');
  if (!texto.startsWith('%PDF-')) {
    motivos.push('no empieza con la marca %PDF-');
  }
  if (!texto.trimEnd().endsWith('%%EOF')) {
    motivos.push('no termina con %%EOF');
  }
  if (!/^xref$/m.test(texto)) {
    motivos.push('no contiene la tabla xref');
  }
  if (!/\/Type\s*\/Catalog/.test(texto)) {
    motivos.push('no contiene el objeto Catalog');
  }
  if (!/\/Type\s*\/Page[^s]/.test(texto)) {
    motivos.push('no contiene el objeto Page');
  }
  const objs = texto.match(/^\d+ 0 obj$/gm) ?? [];
  if (objs.length < 6) {
    motivos.push(`se esperaban al menos 6 objetos, hay ${objs.length}`);
  }
  return { valido: motivos.length === 0, motivos };
}
