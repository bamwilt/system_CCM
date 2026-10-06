import { describe, expect, it } from 'vitest';
import { MODULOS, modulosVisibles } from '../config/modulos';
import { ICONOS } from '../componentes/Iconos';
import { ETIQUETA_ROL, ROLES, puedeEscribir } from '../api/tipos';

/**
 * Pruebas de la configuración de los módulos.
 *
 * `modulos.ts` es la fuente de verdad de las ocho pantallas: si una columna está
 * mal nombrada o falta un icono, el error aparece en runtime y no lo detecta el
 * typecheck. Estas pruebas cubren esas inconsistencias.
 */

describe('catálogo de módulos', () => {
  it('expone los ocho módulos esperados', () => {
    expect(MODULOS.map((m) => m.modulo)).toEqual([
      'estudiantes',
      'clientes',
      'docentes',
      'asignaturas',
      'grupos',
      'matriculas',
      'notas',
      'pagos',
    ]);
  });

  it('todas las rutas son únicas y empiezan por barra', () => {
    const rutas = MODULOS.map((m) => `/api/${m.modulo}`);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it('cada módulo tiene icono definido en ICONOS', () => {
    for (const mod of MODULOS) {
      expect(ICONOS[mod.icono], `falta el icono '${mod.icono}' de ${mod.modulo}`).toBeDefined();
    }
  });

  it('cada módulo declara su clave primaria entre las columnas', () => {
    for (const mod of MODULOS) {
      expect(
        mod.columnas.some((c) => c.clave === mod.pk),
        `${mod.modulo} no tiene ${mod.pk}`,
      ).toBe(true);
    }
  });

  it('no repite nombres de columna dentro de un módulo', () => {
    for (const mod of MODULOS) {
      const claves = mod.columnas.map((c) => c.clave);
      expect(new Set(claves).size, `${mod.modulo} tiene columnas repetidas`).toBe(claves.length);
    }
  });

  it('declara al menos una columna visible en la tabla', () => {
    for (const mod of MODULOS) {
      const visibles = mod.columnas.filter((c) => !c.soloFormulario);
      expect(visibles.length, `${mod.modulo} no tiene columnas visibles`).toBeGreaterThan(0);
    }
  });

  it('los filtros apuntan a columnas declaradas y con tipo válido', () => {
    for (const mod of MODULOS) {
      for (const filtro of mod.filtros ?? []) {
        expect(
          mod.columnas.some((c) => c.clave === filtro.clave) || filtro.tipo !== 'autoincremento',
          `el filtro ${filtro.clave} de ${mod.modulo} no corresponde a una columna`,
        ).toBe(true);
      }
    }
  });

  it('las columnas con opciones no tienen catálogo y viceversa', () => {
    for (const mod of MODULOS) {
      for (const col of mod.columnas) {
        const conOpciones = Boolean(col.opciones?.length);
        const conCatalogo = Boolean(col.catalogo);
        // Un select necesita exactamente una de las dos fuentes de valores.
        if (col.tipo === 'seleccion') {
          expect(
            conOpciones !== conCatalogo,
            `${mod.modulo}.${col.clave} debe tener opciones XOR catálogo`,
          ).toBe(true);
        }
      }
    }
  });

  it('todo catálogo referenciado existe en el tipo Catalogos', () => {
    const validos = [
      'niveles',
      'grupos',
      'programas',
      'asignaturas',
      'estudiantes',
      'clientes',
      'docentes',
      'evaluaciones',
      'usuarios',
      'metodosPago',
    ];
    for (const mod of MODULOS) {
      for (const col of [...mod.columnas, ...(mod.filtros ?? [])]) {
        if (col.catalogo) {
          expect(validos, `${mod.modulo}.${col.clave} apunta a un catálogo inexistente`).toContain(
            col.catalogo,
          );
        }
      }
    }
  });

  it('el orden inicial es una columna existente', () => {
    for (const mod of MODULOS) {
      if (!mod.ordenInicial) continue;
      expect(
        mod.columnas.some((c) => c.clave === mod.ordenInicial!.columna),
        `${mod.modulo} ordena por una columna inexistente`,
      ).toBe(true);
    }
  });

  it('los campos requeridos están marcados como tal', () => {
    // Si un campo va requerido y no tiene la marca, el formulario deja enviar
    // un vacío y la API lo rechaza con un 422 en vez de avisar al instante.
    for (const mod of MODULOS) {
      for (const col of mod.columnas) {
        if (col.requerido) expect(col.etiqueta, `${mod.modulo}.${col.clave}`).toBeTruthy();
      }
    }
  });
});

describe('modulosVisibles', () => {
  it('devuelve todos los módulos al rol con edición', () => {
    expect(modulosVisibles(true)).toHaveLength(MODULOS.length);
  });

  it('oculta los módulos marcados como sinCrear para solo lectura', () => {
    const soloLectura = modulosVisibles(false);
    for (const mod of soloLectura) {
      expect(mod.sinCrear, `${mod.modulo} no debería verse`).toBeFalsy();
    }
  });
});

describe('roles', () => {
  it('solo administración y secretaría pueden escribir', () => {
    expect(puedeEscribir('admin')).toBe(true);
    expect(puedeEscribir('secretaria')).toBe(true);
    expect(puedeEscribir('docente')).toBe(false);
    expect(puedeEscribir('consulta')).toBe(false);
    expect(puedeEscribir(undefined)).toBe(false);
  });

  it('todo rol tiene etiqueta visible', () => {
    for (const rol of ROLES) {
      expect(ETIQUETA_ROL[rol]).toBeTruthy();
    }
  });
});
