import path from 'node:path';
import fs from 'node:fs';

/**
 * Shared, machine-independent resolution of the isolated PostgreSQL test
 * instance used by the auth suite.
 *
 * The socket directory lives inside the repository (`.tmp/test-artifacts/
 * sgpm-fase3-db`), so it must never be hardcoded: the project root is probed
 * at runtime instead. The probing rules below intentionally mirror
 * `resolveProjectRoot()` in `./testDb.ts`, so that the socket directory
 * exported here is exactly the one that `getTestDatabaseUrl()` validates
 * against (`APPROVED_SOCKET_DIR`). Keep both resolutions in sync.
 *
 * The value is a plain filesystem path (never percent-encoded) because it is
 * the directory of a Unix domain socket.
 */
const SOCKET_DIR_RELATIVE = path.join('.tmp', 'test-artifacts', 'sgpm-fase3-db');

function resolveProjectRoot(): string {
  const socketDir = (candidate: string): string =>
    path.resolve(candidate, SOCKET_DIR_RELATIVE);
  // Se sube por el arbol hasta encontrar el socket o llegar a la raiz del
  // sistema de archivos. Esto permite ejecutar la suite tanto desde `backend/`
  // como desde artefactos mas profundos bajo `.tmp/`, sin exigir un numero
  // fijo de niveles ni depender del directorio de trabajo.
  let candidate = process.cwd();
  for (let depth = 0; depth < 32; depth += 1) {
    if (fs.existsSync(socketDir(candidate))) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }
  // Fallback for the documented invocation (workdir=backend).
  return path.resolve(process.cwd(), '..');
}

/** Absolute path of the project root that owns the isolated test instance. */
export const PROJECT_ROOT: string = resolveProjectRoot();

/** Absolute path of the approved Unix-socket directory of the test instance. */
export const TEST_SOCKET_DIR: string = path.resolve(PROJECT_ROOT, SOCKET_DIR_RELATIVE);

/** Alias using the same name as `APPROVED_SOCKET_DIR` in `./testDb.ts`. */
export const APPROVED_SOCKET_DIR: string = TEST_SOCKET_DIR;
