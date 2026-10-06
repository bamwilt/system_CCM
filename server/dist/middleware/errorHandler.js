import { ZodError } from 'zod';
import { ApiError } from '../lib/ApiError.js';
import { dbErrorMessage } from '../db/pool.js';
import { env } from '../config/env.js';
/**
 * Manejo centralizado de errores.
 *
 * Express 5 propaga automáticamente los rechazos de los handlers async, así
 * que un `throw ApiError(...)` dentro de una ruta async llega acá sin
 * necesidad de un try/catch en cada endpoint.
 *
 * Regla: al cliente solo se le da un mensaje útil. El detalle técnico (stack,
 * SQL interno) se registra en el servidor y sólo se expone en desarrollo.
 */
export function notFoundHandler(req, _res, next) {
    next(ApiError.notFound(`Ruta inexistente: ${req.method} ${req.path}`));
}
export function errorHandler(err, _req, res, next) {
    // Si ya se empezó a enviar la respuesta, no se puede armar otra.
    if (res.headersSent) {
        next(err);
        return;
    }
    if (err instanceof ApiError) {
        res.status(err.status).json({
            error: { message: err.message, code: err.code, details: err.details },
        });
        return;
    }
    if (err instanceof ZodError) {
        const campos = {};
        for (const i of err.issues) {
            campos[i.path.join('.') || '(raíz)'] ??= i.message;
        }
        res.status(422).json({
            error: { message: 'Datos inválidos', code: 'VALIDATION_ERROR', details: campos },
        });
        return;
    }
    const { status, message } = dbErrorMessage(err);
    const code = err?.code;
    if (status >= 500) {
        console.error('[error no controlado]', err);
    }
    res.status(status).json({
        error: {
            message,
            code: code ?? 'INTERNAL_ERROR',
            // El stack solo en desarrollo: en producción es información interna.
            ...(env.NODE_ENV !== 'production' && err instanceof Error ? { stack: err.stack } : {}),
        },
    });
}
//# sourceMappingURL=errorHandler.js.map