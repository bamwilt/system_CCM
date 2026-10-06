import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from './ApiError.js';
import { parseBody, parseParams, parseQuery } from './validate.js';
import { activarMensajesEnEspanol, etiqueta } from './zod-es.js';
/**
 * Pruebas de la capa de validación.
 *
 * `src/index.ts` activa los mensajes en español al arrancar; aquí se activa
 * igual, para poder comprobarlos sin levantar el servidor.
 *
 * Esta capa es la barrera que impide que datos sin validar lleguen al SQL, así
 * que se prueban tres cosas: que rechace lo que debe, que acepte lo que debe,
 * y que lo que le llega al usuario esté en español y nombre el campo culpable.
 */
activarMensajesEnEspanol();
/** El mensaje del primer error de validación, o falla si no hubo ninguno. */
function primerMensaje(resultado) {
    if (resultado.success)
        expect.unreachable('se esperaba un error de validación');
    const issue = resultado.error.issues[0];
    if (!issue)
        expect.unreachable('Zod no devolvió ningún issue');
    return issue.message;
}
describe('ApiError', () => {
    it('deduce el código a partir del estado', () => {
        expect(ApiError.badRequest('x').code).toBe('BAD_REQUEST');
        expect(ApiError.unauthorized().code).toBe('UNAUTHORIZED');
        expect(ApiError.forbidden().code).toBe('FORBIDDEN');
        expect(ApiError.notFound().code).toBe('NOT_FOUND');
        expect(ApiError.conflict('x').code).toBe('CONFLICT');
        expect(ApiError.unprocessable('x').code).toBe('VALIDATION_ERROR');
    });
    it('usa los mensajes por defecto cuando no se pasan', () => {
        expect(ApiError.unauthorized().message).toBe('No autenticado');
        expect(ApiError.notFound().message).toBe('Recurso no encontrado');
    });
    it('lleva los detalles cuando los hay', () => {
        const err = ApiError.conflict('No se puede', { dependientes: { notas: 3 } });
        expect(err.details).toEqual({ dependientes: { notas: 3 } });
        expect(ApiError.notFound().details).toBeUndefined();
    });
});
describe('parseBody', () => {
    const esquema = z.object({
        nombre: z.string().trim().min(3),
        edad: z.coerce.number().int().positive(),
    });
    it('devuelve los datos ya normalizados, como los espera el SQL', () => {
        const datos = parseBody(esquema, { nombre: '  Ana  ', edad: '30' });
        expect(datos).toEqual({ nombre: 'Ana', edad: 30 });
    });
    it('lanza 422 señalando el campo culpable', () => {
        expect.assertions(3);
        try {
            parseBody(esquema, { nombre: 'A', edad: 30 });
        }
        catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            const err = e;
            expect(err.status).toBe(422);
            expect(err.details).toMatchObject({ nombre: expect.stringContaining('3') });
        }
    });
    it('distingue body, query y params en el mensaje', () => {
        expect(() => parseBody(esquema, {})).toThrow(/inválidos en body/);
        expect(() => parseQuery(esquema, {})).toThrow(/inválidos en query/);
        expect(() => parseParams(esquema, {})).toThrow(/inválidos en params/);
    });
    it('conserva un solo mensaje por campo, aunque falle dos veces', () => {
        const conDos = z.object({
            codigo: z.string().min(5, 'muy corto').regex(/^\d+$/, 'solo dígitos'),
        });
        expect.assertions(1);
        try {
            parseBody(conDos, { codigo: 'ab' });
        }
        catch (e) {
            // Dos reglas sobre el mismo campo no deben generar dos mensajes distintos.
            expect(Object.keys(e.details)).toEqual(['codigo']);
        }
    });
    it('no revienta con un body que no es un objeto', () => {
        expect(() => parseBody(esquema, 'texto')).toThrow(ApiError);
        expect(() => parseBody(esquema, null)).toThrow(ApiError);
    });
});
describe('mensajes en español', () => {
    it('traduce los errores nativos de Zod', () => {
        const r = z.object({ edad: z.number() }).safeParse({ edad: 'x' });
        expect(primerMensaje(r)).toBe('Edad debe ser un número');
    });
    it('no deja palabras en inglés en la respuesta', () => {
        const r = z
            .object({ edad: z.number(), nombre: z.string(), lista: z.array(z.number()).min(2) })
            .safeParse({});
        const todos = [primerMensaje(r)];
        expect(todos.join(' ')).not.toMatch(/required|expected|received|invalid/i);
    });
    it('usa la etiqueta bonita del campo cuando existe', () => {
        const r = z.object({ primer_nombre: z.string().min(4) }).safeParse({ primer_nombre: 'An' });
        expect(primerMensaje(r)).toBe('Primer nombre debe tener al menos 4 caracteres');
    });
    it('no duplica «es obligatorio» cuando el tipo falta', () => {
        const r = z.object({ nombre: z.string() }).safeParse({});
        expect(primerMensaje(r)).toBe('Nombre es obligatorio');
    });
    it('traduce los formatos conocidos', () => {
        expect(primerMensaje(z.email().safeParse('no-es-email'))).toMatch(/email/i);
        expect(primerMensaje(z.iso.date().safeParse('02/03/2026'))).toMatch(/AAAA-MM-DD/);
    });
    it('no pisa los mensajes que el propio esquema define', () => {
        const r = z.object({ codigo: z.string().min(5, 'Poné al menos 5 letras') }).safeParse({
            codigo: 'ab',
        });
        expect(primerMensaje(r)).toBe('Poné al menos 5 letras');
    });
    it('distingue «obligatorio» del límite mínimo inclusivo', () => {
        // Una lista vacía es un dato faltante; un 0 en un `positive()` NO lo es,
        // aunque el mínimo sea 1: el campo vino y era inválido.
        expect(primerMensaje(z.array(z.number()).min(1).safeParse([]))).toBe('El campo es obligatorio');
        // `positive()` es `> 0` en Zod: el 0 se descarta y el mensaje lo dice.
        expect(primerMensaje(z.number().int().positive().safeParse(0))).toContain('mayor que 0');
        expect(primerMensaje(z.number().min(5).safeParse(1))).toContain('mayor o igual a 5');
        expect(primerMensaje(z.string().min(3).safeParse('ab'))).toContain('al menos 3 caracteres');
    });
});
describe('etiqueta', () => {
    it('usa el diccionario cuando conoce el campo', () => {
        expect(etiqueta('primer_apellido')).toBe('Primer apellido');
        expect(etiqueta('fecha_registro')).toBe('Fecha de registro');
        expect(etiqueta('cedula')).toBe('Cédula');
    });
    it('convierte snake_case en una frase legible', () => {
        expect(etiqueta('nota_total')).toBe('Nota total');
        expect(etiqueta('empleado_id')).toBe('Empleado id');
    });
});
//# sourceMappingURL=validate.test.js.map