# Informe de control — FASE 7.A

Fecha: 2026-11-11. Versión: 1.0.

**FASE:** 7.A — Registro de pagos y comprobantes (incremento parcial).

**OBJETIVO:** Exponer por HTTP el proceso de cobro ya implementado en el incremento 6.B —registro de pagos, búsqueda de operaciones, detalle, comprobantes y anulación compensatoria— sin añadir lógica financiera nueva y sin dependencias no verificables.

## REQUISITOS IMPLEMENTADOS

Funcionalidades del Prompt Maestro para la FASE 7 (diez en total) y su estado real:

| # | Funcionalidad PM | Estado | Origen |
|---|---|---|---|
| 1 | Registrar pagos | Implementado | 7.A (`POST /api/pagos`) |
| 2 | Seleccionar estudiante | **NO IMPLEMENTADO** | es de interfaz; corresponde a la Fase 9 |
| 3 | Consultar obligaciones | Implementado | heredado de 6.A |
| 4 | Aplicar abonos | Implementado | heredado de 6.B |
| 5 | Calcular saldos | Implementado | heredado de 6.A |
| 6 | Confirmar transacción | Implementado | 7.A (transacción única) |
| 7 | Emitir comprobantes | Implementado como DATO | 7.A; el PDF queda pendiente |
| 8 | Consultar historial | Implementado | heredado de 6.B |
| 9 | Buscar operaciones | Implementado | 7.A (`GET /api/pagos` con filtros) |
| 10 | Anular operaciones autorizadas | Implementado | 7.A (reversión compensatoria) |

Reglas de seguridad financiera del PM:

- **Atomicidad:** "Una operación de pago debe ejecutarse de forma atómica" → `POST /api/pagos` ejecuta revalidación de actor, cobro con sus aplicaciones, emisión del comprobante y auditoría en **una única transacción** bajo el advisory lock del proyecto.
- **Idempotencia:** clave de aplicación reutilizable; repetir la misma clave devuelve el pago original sin duplicar nada; reutilizarla con otra matrícula devuelve 409.
- **Identificadores únicos de comprobante:** correlativo por año asignado por una secuencia de PostgreSQL (trigger `fn_comprobantes_asignar_numero`), no por `MAX()+1`.
- **"La generación de un comprobante no debe alterar independientemente el saldo":** `GET /:id/comprobante` es estrictamente de solo lectura; probado con hash lógico de cinco tablas antes y después.

## ARCHIVOS CREADOS

- `database/migrations/009_fase7_comprobantes.sql` — tabla `comprobantes` (identificador único, uno por pago, FKs `ON DELETE RESTRICT`), tabla de correlativos, columnas de reversión en `pagos` con sus CHECK y trigger de reversión única, y ampliación del CHECK de `auth_role_permissions` con `pagos:manage` y `pagos:read`.
- `backend/src/routes/pagos.routes.ts` — cinco endpoints con el patrón de casa.
- `backend/src/services/pagos.service.ts` — orquesta el consumo del motor de 6.B, la emisión del comprobante y la reversión.
- `backend/src/repositories/comprobantes.repository.ts` — persistencia de comprobantes, lectura de pagos y operación de reversión.

## ARCHIVOS MODIFICADOS

- `backend/src/authorization/permissions.ts` — `pagos:manage` y `pagos:read`.
- `backend/src/app.ts` — registro del router.
- `backend/src/services/aplicacion-pagos.service.ts` — acepta un `PoolClient` externo para integrarse en la transacción de la ruta.
- `backend/src/services/pagos.service.ts` — propaga ese cliente.

## PRUEBAS EJECUTADAS

- **Regresión completa:** `cd backend && npm test` → **16 archivos, 320 pruebas, 320 PASS / 0 FAIL / 0 SKIP, exit 0** (169 s). Línea base previa: 15 archivos y 297 pruebas; este lote añade **23 pruebas** en 1 archivo nuevo.
- **Typecheck de fuente:** exit 0. **Typecheck de fuente + tests:** exit 0.
- **Verificación funcional puntual** (no automatizada): 45 comprobaciones del implementador sobre base de datos scratch aislada, más la verificación del orquestador de la atomicidad y de la lectura del comprobante mediante hash lógico.

**Las nueve pruebas obligatorias del PM** (doble clic, repetición de solicitudes, fallos de red, concurrencia, pago parcial, pago completo, reversión, permisos, integridad de comprobantes) están implementadas en `backend/tests/pagos-api.test.ts`: **23 pruebas, todas en verde**, más 6 de límites y forma de consulta. Las tres primeras versiones del arnés fallaron por defectos del propio arnés, no del producto: (1) el `beforeEach` borraba `auth_login_limits`, tabla cuyo lock de fila retiene el limitador durante cada petición HTTP, lo que bloqueaba el hook hasta su timeout de 30 s; (2) varias pruebas montaban su matrícula con un actor al que le faltaba `matriculas:manage` o con un CSRF inválido; (3) dos conteos filtraban por `observaciones`, campo que la fila inversa de la reversión no lleva.

## RESULTADOS

- Correlativo bajo concurrencia real, dos conexiones: `CMP-2026-000001` y `CMP-2026-000002`. La segunda esperó el bloqueo de fila del año y aun así recibió un identificador distinto.
- Segundo comprobante para el mismo pago: rechazado por `comprobantes_pago_unique` (23505).
- Segunda reversión del mismo pago: rechazada; la fila original conserva monto, fecha y la primera reversión. Reversión parcial, motivo vacío, auto-reversión y fecha anterior a la creación: rechazadas por CHECK.
- Paridad de catálogo entre instalación limpia (001..009) y upgrade (001..008 + 009): dump de 137 líneas **sin diferencias**.
- `GET /comprobante`: dos llamadas devuelven payload idéntico y el hash de `mensualidades`, `pagos`, `pago_medios`, `pago_aplicaciones`, `comprobantes` y `comprobantes_correlativos` es el mismo antes y después.

## ERRORES DETECTADOS

1. **Atomicidad incumplida en la primera entrega de `POST /api/pagos`.** El cobro y la emisión del comprobante caían en transacciones separadas: un fallo al emitir dejaba el pago registrado sin comprobante. Contradice el requisito explícito del PM. Causa raíz: el motor de 6.B no aceptaba un `PoolClient` externo.
2. **Fuga de conexiones introducida al corregir lo anterior.** Al reescribir el bloque transaccional de la ruta se perdió el `finally { client.release() }`; cada petición filtraba una conexión y, agotado el pool, cada una esperaba los 5 s de `connectionTimeoutMillis`. Detectado porque ocho pruebas tardaban 5,5 s exactos.
3. **Carrera en el limitador de inicio de sesión** (`backend/src/services/auth.service.ts`, código de Fase 3). El patrón `INSERT ... ON CONFLICT DO NOTHING` seguido de `SELECT ... FOR UPDATE` usaba `row.window_start` sin comprobar que la fila existiera; si una transacción concurrente insertaba la clave y revertía, `row` quedaba en `undefined` y el `TypeError` se convertía en 500.

## ERRORES CORREGIDOS

1. El motor acepta `clienteExterno?: PoolClient`; la ruta abre la transacción y el motor se integra en ella sin abrir, comitear ni revertir nada por su cuenta. `POST /api/pagos` es ahora una sola transacción atómica.
2. Restituido el `finally { client.release() }`.
3. Sustituidos los dos sitios por un `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atómico, más una guarda defensiva. Verificado sin regresión: las suites de autenticación pasan 32/32 y la regresión completa 297/297.

## LIMITACIONES

1. **Sin PDF.** Ver el punto 2 de LIMITACIONES: es la reserva que queda, junto con la selección de estudiante que corresponde a la Fase 9.
2. **Sin PDF.** El PM y las fuentes piden comprobante en PDF, pero no hay librería instalada y `npm audit` no es ejecutable en este entorno (registro npm inalcanzable), de modo que la regla 13 del PM ("verifica las dependencias antes de utilizarlas") impedía añadirla sin poder auditarla. El comprobante se entrega como dato con identificador único, que es lo que el PM exige de forma no negociable.
3. **Sin endpoint de "seleccionar estudiante":** es de interfaz y corresponde a la Fase 9.
4. **La moneda del comprobante es nullable** y el año del correlativo depende de la zona horaria de sesión de PostgreSQL: ambos amarrados a DEC-05, sin decisión institucional.
5. **Formato del correlativo `CMP-AAAA-NNNNNN` provisional:** DEC-10 sigue abierto.

## REQUISITOS PENDIENTES

- Cobertura automatizada de las nueve pruebas del PM (arnés de prueba por depurar).
- Comprobante en PDF cuando se pueda auditar la dependencia.
- Reversión: reflejar la anulación en `comprobantes.estado` (hoy `pagos` es la única fuente de "el pago fue revertido").
- DEC-08 (política institucional de anulación), DEC-10 (correlativos y firma), DEC-03 (matriz de roles).

## ESTADO DE LA FASE

**FASE 7.A COMPLETADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.** Las diez funcionalidades del PM están implementadas salvo «seleccionar estudiante» (interfaz, Fase 9) y el comprobante en PDF (dependencia no auditable en este entorno). Las nueve pruebas obligatorias del PM pasan. Reserva principal: sin PDF.
