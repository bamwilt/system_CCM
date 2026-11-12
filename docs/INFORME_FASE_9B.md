# Informe de control — FASE 9.B (rediseño premium y cobro por nombre)

Fecha: 2026-11-12. Versión: 1.0.

**FASE:** 9.B — Pulido de la interfaz web: apariencia configurable, estadísticas en la portada y **cobro sin números de matrícula**.

**ORIGEN DE ESTA ENTREGA (quejas reales de uso, no supuestos):**

1. *"Tengo que adivinar el número de matrícula, no sé ni a quién le cobro y tengo que aprenderme todas las matrículas."*
2. *"Sigo viendo símbolos ASCII en vez de logos o iconos modernos."*
3. *"Necesito configuración para personalizar temas."*
4. Revisión de la pantalla de cobro: contraste del botón principal, icono "LOGOUT" roto, logo inconsistente, placeholders ilegibles, campos desalineados, tablas incompletas, importes sin moneda ni separador de miles.

Cada punto se corrigió y se verificó con la aplicación en marcha (Playwright), no por inspección del código.

---

## 1. COBRAR POR NOMBRE, NO POR NÚMERO

**Antes:** el campo "Matrícula" exigía un número entero. Para cobrar había que saberse el identificador interno de cada familia.

**Ahora:** `GET /api/pagos/buscar-deudor` devuelve una **tabla de matrículas activas** que se filtra mientras se escribe:

| Filtro | Comportamiento |
|---|---|
| `q` | Texto parcial sobre nombre, apellido, documento **y grado**; insensible a acentos (`translate` en PostgreSQL, los dos lados) |
| `grado` | Grado o sección, para quien prefiere mirar el listado |
| `deuda=pendiente` | Solo quienes deben algo |
| `limite` | Máximo 50 |

Cada fila muestra lo necesario para no equivocarse de familia: nombre completo, grado, matrícula, cuotas pendientes, próximo vencimiento y deuda **almacenada**. Un clic en "Elegir" carga el cobro.

**Archivos:**

- `backend/src/repositories/busqueda-deudores.repository.ts` — una consulta parametrizada (los placeholders se numeran según los filtros activos; pasar parámetros que el SQL no usa devuelve 500, error real medido y corregido).
- `backend/src/routes/pagos.routes.ts` — ruta con permiso `pagos:manage`; rechaza filtros de una sola letra y comodines de LIKE (`%`, `_`).
- `frontend/src/components/TablaDeudores.tsx` — tabla con filtros, orden por columna y estados vacíos que explican qué hacer.
- `frontend/src/pages/CobroPage.tsx` — selección arriba a todo el ancho; cobro y resumen debajo.

---

## 1.bis. NUEVA MATRÍCULA: CATÁLOGOS REALES

El formulario de matrícula tenía el mismo defecto que el cobro: pedía el id del
estudiante, del año lectivo, del grado y de la tarifa. Los endpoints de catálogo
**no existían** (la pantalla los esperaba y el `catch` se lo callaba), así que la
persona se quedaba escribiendo números.

Endpoints añadidos (solo lectura, permiso `matriculas:read`):

- `GET /api/estudiantes/anios-lectivos`
- `GET /api/estudiantes/grados?anio_lectivo_id=`
- `GET /api/estudiantes/tarifas?anio_lectivo_id=` — el monto viaja como `::text`
- `GET /api/estudiantes?q=` — búsqueda parcial e insensible a acentos

El monto de la tarifa se muestra con su símbolo (`C$ 1,500.00`) y los grados y
tarifas se recargan al cambiar el año, porque dependen de él.

---

## 2. ICONOS REALES (adiós a los símbolos ASCII)

El subconjunto de Material Symbols se **reconstruye desde la fuente completa** con `fontTools` + `feaLib`: se conservan solo los glifos que usa la aplicación y las ligaduras exactas de esos nombres. 41 KB en lugar de los 4 MB de la fuente completa.

- Los nombres se extraen del código (entre comillas y como texto JSX), de modo que añadir un icono nuevo es añadir su nombre al código.
- El logo de SGPM y el botón de salir son **SVG propios** (`frontend/src/components/IconosSvg.tsx`): si una fuente no carga, la barra lateral no muestra texto roto.
- La URL de la fuente lleva `?v=N`: el navegador cachea la versión anterior y, sin el parámetro, la corrección no se ve.

**Defecto encontrado y corregido en el camino:** los iconos `arrow_upward` y `swap_vert` (orden de columnas) no estaban en el subconjunto descargado, así que se renderizaban como la palabra "ARROW_UPWARD" en la cabecera de la tabla. Detectado por la revisión automática de textos y corregido regenerando la fuente.

---

## 3. APARIENCIA CONFIGURABLE

`frontend/src/context/AparienciaContexto.tsx` + pantalla `/configuracion`:

| Ajuste | Valores | Persistencia |
|---|---|---|
| Tema | oscuro (por defecto) / claro | `localStorage` |
| Densidad | cómoda / compacta | `localStorage` |
| Movimiento | completo / reducido | `localStorage` |

Se aplican al `<html>` como `data-tema`, `data-densidad` y `data-movimiento`; la hoja de estilos consume tokens, de modo que añadir un tema es declarar su bloque de variables. Ningún ajuste toca una cifra ni una regla de cobro, y la pantalla lo dice explícitamente.

---

## 4. CORRECCIONES DE LA REVISIÓN DE USABILIDAD

| Observación | Corrección |
|---|---|
| Botón "Confirmar cobro" ilegible (texto oscuro sobre azul claro) | Texto blanco sobre azul saturado (`#0e6ea8` → `#08507f`), altura estándar de 38 px |
| Botón primario sin estado deshabilitado visible | `disabled` real con opacidad, `cursor: not-allowed` y saturación reducida |
| Icono "LOGOUT" roto y logo "SH" inconsistente | SVG propios (`IconosSvg.tsx`) |
| Placeholders y ayudas con contraste insuficiente | Token `--texto-ayuda` en gris-400 (5.9:1 sobre el fondo oscuro, AA) |
| Campo de matrícula truncado | Reemplazado por la tabla con filtros |
| Consulta en dos pasos | La tabla se filtra mientras se escribe, con estado de carga |
| Columnas desalineadas | La ayuda va **debajo** del campo (`campo__pie`) y los inputs tienen altura fija |
| Espacio muerto en la tarjeta del formulario | Se eliminó el formulario de una columna; contenido compacto |
| "Últimos cobros" fuera de su tarjeta | Tarjeta propia con familia, matrícula, fecha, medio, monto y estado |
| Importes sin moneda ni separadores | `C$ 4,500.00`; el formateo es de presentación sobre el **texto exacto** del backend, sin conversión a coma flotante |
| Fecha ambigua (12/11/2026) | Fecha larga ("12 nov 2026") bajo el control nativo |
| Tablas que recortaban columnas | `tabla-scroll` (scroll dentro de la tarjeta) y columnas consolidadas |
|Ítem activo del menú poco marcado | Fondo degradado + borde interior + barra lateral dorada |
| Botón de salir igual al resto | Tono danger suave, separado del perfil |
| Tema: se mostraba la acción, no el estado | "Tema oscuro activo" / "Tema claro activo", con `aria-pressed` |

---

## 5. VERIFICACIÓN

| Comprobación | Resultado |
|---|---|
| Backend, suite completa | **355 pruebas, 0 fallos** (19 archivos; 8 nuevas de `busqueda-deudores` y 4 de `catalogos-matricula`) |
| Frontend, suite de interfaz | **19 pruebas, 0 fallos** |
| `tsc --noEmit` (backend y frontend) | OK |
| `npm run build` (frontend) | OK, 0 advertencias |
| Iconos renderizados como glifo | **51 de 51** medidos en el navegador real |
| Revisión automática de textos | Sin desbordes, sin texto menor de 11 px, sin importes partidos en dos líneas |
| Capturas | `docs/capturas/` (referenciadas desde el README) |

Las pruebas cubren, con datos reales en PostgreSQL 16: búsqueda por nombre con y sin acentos, por grado, por documento; deuda que baja al registrar un pago parcial; matrículas DESACTIVADAS que no se ofrecen; filtros cortos y comodines de LIKE rechazados; y acceso denegado sin el permiso de cobro.

**Disciplina de la base de pruebas compartida:** la suite nueva deja la base como la encontró. Sin esa limpieza, la siguiente suite no puede reaplicar migraciones (restricción `check` violada) — fallo real medido y corregido. Además se aisló su rango de años lectivos (2400+), porque el de otra suite se solapaba y rompía sus fechas.

---

## 6. DECISIONES TOMADAS AQUÍ

| ID | Decisión | Estado |
|---|---|---|
| DEC-21 | La búsqueda de a quién cobrar exige `pagos:manage` (no `estudiantes:read`): es la pantalla de quien cobra y devuelve solo lo mínimo para cobrar (nombre, grado, deuda). | Adoptada |
| DEC-22 | El símbolo de moneda es de presentación: `NIO` → `C$`, `USD` → `US$`, moneda ausente → sin símbolo (nunca se inventa). | Adoptada |
| DEC-23 | El subconjunto de iconos se genera desde la fuente completa con `fontTools` y se versiona (`?v=N`) para evitar que la caché del navegador sirva una versión rota. | Adoptada |

Ninguna regla financiera cambió: 10 cuotas, montos, moneda, redondeo, mora, FIFO y descuentos siguen siendo los definidos en las fases 5–7 y pendientes de ratificación institucional (DEC-20).
