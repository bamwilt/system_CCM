import { ApiError } from './ApiError.js';
/**
 * Valida y normaliza datos de entrada con Zod.
 *
 * Todas las rutas usan esto antes de tocar la base: es lo que impide que un
 * `email` con 300 caracteres o un `puntaje` de -5 lleguen al SQL.
 */
/** Valida el body y devuelve el objeto tipado, o lanza 422 con el detalle. */
export function parseBody(schema, data) {
    return parseOrThrow(schema, data, 'body');
}
/** Igual que `parseBody` pero para query string y params. */
export function parseQuery(schema, data) {
    return parseOrThrow(schema, data, 'query');
}
export function parseParams(schema, data) {
    return parseOrThrow(schema, data, 'params');
}
function parseOrThrow(schema, data, where) {
    const result = schema.safeParse(data);
    if (result.success)
        return result.data;
    const campos = {};
    for (const issue of result.error.issues) {
        const ruta = issue.path.join('.') || '(raíz)';
        // Si un campo falla dos veces, la primera understandably.
        if (!(ruta in campos))
            campos[ruta] = issue.message;
    }
    throw ApiError.unprocessable(`Datos inválidos en ${where}`, campos);
}
//# sourceMappingURL=validate.js.map