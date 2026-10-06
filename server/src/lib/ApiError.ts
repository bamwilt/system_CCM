/**
 * Error de aplicación con código HTTP y detalles opcionales.
 *
 * Los errores conocidos (validación, no encontrado, conflicto) se lanzan como
 * `ApiError` y el middleware los traduce a una respuesta limpia. Cualquier
 * otro error se considera no previsto y se reporta como 500 sin filtrar
 * detalles internos al cliente.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? httpCodeToSlug(status);
    if (details !== undefined) this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'No autenticado'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'No tenés permiso para esta acción'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Recurso no encontrado'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }
}

function httpCodeToSlug(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    500: 'INTERNAL_ERROR',
  };
  return map[status] ?? 'ERROR';
}
