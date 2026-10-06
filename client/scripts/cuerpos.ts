// Genera, desde la configuración real del cliente, el cuerpo que enviaría el
// formulario de cada módulo con valores plausibles.
import { MODULOS } from '../src/config/modulos';

const CATALOGOS: Record<string, any> = {
  clientes: [{ id: 1, etiqueta: 'Cliente' }],
  estudiantes: [{ id: 1, etiqueta: 'Estudiante' }],
  docentes: [{ id: 1, etiqueta: 'Docente' }],
  asignaturas: [{ id: 1, etiqueta: 'Asignatura' }],
  grupos: [{ id: 1, etiqueta: 'Grupo' }],
  programas: [{ id: 1, etiqueta: 'Programa' }],
  niveles: [{ id: 1, etiqueta: 'Nivel' }],
  usuarios: [{ id: 1, etiqueta: 'Usuario' }],
  evaluaciones: [{ id: 1, etiqueta: 'Evaluación' }],
  metodosPago: [{ id: 1, etiqueta: 'Efectivo' }],
};

const salida: Record<string, unknown> = {};
for (const mod of MODULOS) {
  const cuerpo: Record<string, unknown> = {};
  for (const c of mod.columnas) {
    if (c.soloLectura || c.autogenerada) continue;
    if (c.clave === mod.pk && mod.modulo === 'docentes') { cuerpo[c.clave] = 9001; continue; }
    switch (c.tipo) {
      case 'texto': cuerpo[c.clave] = 'Dato'; break;
      case 'area': cuerpo[c.clave] = 'Texto largo'; break;
      case 'email': cuerpo[c.clave] = 'a@b.do'; break;
      case 'telefono': cuerpo[c.clave] = '8091234567'; break;
      case 'fecha': cuerpo[c.clave] = '2026-01-15'; break;
      case 'numero': cuerpo[c.clave] = 7; break;
      case 'decimal': cuerpo[c.clave] = 12.5; break;
      case 'booleano': cuerpo[c.clave] = true; break;
      case 'seleccion': cuerpo[c.clave] = c.catalogo ? (CATALOGOS[c.catalogo][0]?.id ?? 1) : (c.opciones?.[0] ?? 'X'); break;
      default: break;
    }
  }
  salida[mod.modulo] = cuerpo;
}
console.log(JSON.stringify(salida, null, 2));
