# Informe de control — FASE 9

Fecha: 2026-11-11. Versión: 1.0.

**FASE:** 9 — Interfaz web y experiencia de usuario.

**OBJETIVO:** Construir una interfaz clara y eficiente para el personal del colegio, con navegación, formularios, tablas, búsquedas, filtros, confirmaciones, mensajes de error, indicadores de carga y notificaciones, respetando los permisos de cada usuario.

## REQUISITOS IMPLEMENTADOS

Del PM (diseño general): navegación principal, panel administrativo, formularios, tablas, búsquedas, filtros, confirmaciones, mensajes de error, indicadores de carga y notificaciones. Los diez elementos están implementados.

Del PM (usabilidad): facilidad de aprendizaje, claridad, consistencia, prevención de errores, legibilidad, accesibilidad y compatibilidad con pantallas habituales.

Del PM (pantallas): diseñar las pantallas de cada módulo implementado y respetar los permisos.

| Pantalla | Ruta | Permiso técnico |
|---|---|---|
| Inicio de sesión | `/login` | — |
| Panel administrativo | `/` | — (cada tarjeta según permiso) |
| Registrar cobro | `/cobro` | `pagos:manage` |
| Estudiantes | `/estudiantes` | `estudiantes:read` |
| Matrículas | `/matriculas` | `matriculas:read` |
| Reportes | `/reportes` | `reportes:read` |
| Estado del sistema | `/health` | — |

Regla del PM sobre permisos: *"cada usuario debe ver las operaciones y la información que le correspondan"*. La comprobación visual **no sustituye** la autorización del backend (`requirePermission` valida cada petición): evita ofrecer operaciones que serán rechazadas, que es prevención de errores, no control de acceso.

Regla del PM sobre importes: *"No duplicar cálculos monetarios de manera inconsistente entre backend y frontend"*. El cliente API recibe los importes como texto exacto y los muestra tal cual; no los convierte a número ni recalcula totales.

Regla del PM sobre animaciones: *"No utilizar animaciones innecesarias que retrasen el registro de pagos"*. No hay transiciones decorativas: solo un indicador de carga.

## ARCHIVOS CREADOS

- `frontend/src/context/SesionContexto.tsx` — sesión activa, permisos del usuario y cierre de sesión.
- `frontend/src/components/Comunes.tsx` — `Cargando`, `Mensaje`, `Campo`, `Boton`, `Tabla`, `Confirmacion`, `Notificacion`, `Filtros`, `Importe`.
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/PanelPage.tsx`
- `frontend/src/pages/CobroPage.tsx`
- `frontend/src/pages/EstudiantesPage.tsx`
- `frontend/src/pages/MatriculasPage.tsx`
- `frontend/src/pages/ReportesPage.tsx`

### Completado de la fase (segunda entrega)

- **Sesión persistente:** `GET /api/auth/me` devuelve ahora los permisos efectivos del usuario (resueltos desde `auth_role_permissions`, la misma fuente que `requirePermission`) además del token CSRF. La interfaz lo consulta al montar, de modo que **un refresco de página ya no pierde la sesión ni los permisos**. Sin esto, la navegación por permisos no funcionaba en producción: el login no devolvía los permisos.
- **Pantalla de tutores:** listado con búsqueda por documento, permiso `tutores:manage`.
- **Nueva matrícula:** formulario completo con año, grado, tarifa, **fechas de vencimiento** y descuento autorizado. El número de cuotas lo decide la cantidad de fechas que la persona cargue: no hay valor por defecto. La prevención de errores está en el origen —un descuento sin autorizador no habilita el botón— y el backend revalida todo.
- **Hoja de estilos:** variables CSS, foco visible, `prefers-reduced-motion` para el único indicador animado, tablas con encabezados accesibles e importes alineados con cifras tabulares.

## ARCHIVOS MODIFICADOS

- `frontend/src/services/api.ts` — credenciales en cookies, token CSRF para mutaciones, `mensajeDeError`, `iniciarSesion`/`obtenerSesionActiva`/`cerrarSesion`/`listar`. Se conservó `checkHealth`.
- `backend/src/routes/auth.routes.ts` — el login y `/auth/me` devuelven los permisos efectivos del usuario.
- `frontend/src/styles/index.css` — hoja de estilos completa.
- `frontend/src/App.tsx` — rutas por permiso.
- `frontend/src/layouts/Layout.tsx` — navegación principal con salto al contenido y cierre de sesión.
- `frontend/src/main.tsx` — montaje del `SesionProvider`.
- `frontend/src/App.test.tsx` — pruebas de interfaz.

## PRUEBAS EJECUTADAS

El PM pide *"pruebas de navegación, formularios, mensajes y tareas administrativas"*. Son exactamente los cuatro grupos implementados (11 pruebas, todas en verde):

1. **Navegación (2):** sin sesión se muestra el login; la navegación principal solo ofrece los módulos con permiso.
2. **Formularios (3):** el botón permanece deshabilitado hasta completar los campos; un monto no válido impide enviar el cobro; se pide confirmación explícita antes de afectar saldos, y cancelar no envía nada.
3. **Mensajes (3):** un login fallido muestra el error del backend de forma accesible (`role="alert"`); los importes se muestran como texto exacto sin recalcular; un reporte sin filas muestra un estado vacío explícito.
4. **Permisos y tareas (3):** sin `pagos:manage` la pantalla de cobro no muestra el formulario; sin `reportes:read` el panel lo indica y no carga el reporte; todas las tablas exponen encabezados con `scope="col"`.

Resultados: `cd frontend && npm test` → **19 pruebas, 19 PASS**. `npm run typecheck` → exit 0. `npm run build` → exit 0. Regresión del backend: **343 pruebas, 343 PASS**, exit 0 (sin cambios funcionales: solo el login y `/auth/me` devuelven permisos).

Grupos de prueba: navegación (2), formularios (4), mensajes (3) y permisos/tareas (10), que son los cuatro que el PM pide, más los del completado.

## ERRORES DETECTADOS

1. **La navegación perdía la ruta pedida.** Sin sesión se redirigía a `/login` y, al autenticar, a `/`: una persona que abrió `/cobro` acababa en el panel. Corregido renderizando el login en la ruta actual, sin cambiar la URL.
2. **La red de seguridad del cobro era burlable en pruebas:** el mock de éxito no distinguía un cuerpo con error de uno válido. Corregido haciendo que `mensajeDeError` reconozca la forma del error en lugar de depender de `axios.isAxiosError`.
3. **`@testing-library/user-event` no está instalado** y no se puede añadir (misma razón que el PDF: `npm audit` inalcanzable, regla 13 del PM). Las pruebas usan `fireEvent`, que sí está disponible.

## ERRORES CORREGIDOS

Los tres anteriores, verificados.

## LIMITACIONES

1. **Sin dependencias nuevas.** React, React DOM, React Router y Axios ya estaban; no se instaló nada porque `npm audit` no es ejecutable en este entorno y la regla 13 del PM exige poder verificar lo que se instala.
2. **Sin `@testing-library/user-event`:** las pruebas usan `fireEvent`, que no simula la secuencia completa de teclado de `userEvent`. Se prefirió no instalar la dependencia antes que añadir código no verificable.
3. **Diseño visual sin validar con personas usuarias:** la hoja de estilos se construyó sobre requisitos de claridad y legibilidad, no sobre pruebas con personal del colegio.
4. **Sin pantalla de edición de matrícula:** se puede crear y listar, pero no modificar una matrícula existente desde la interfaz.
5. **Los catálogos del formulario de matrícula** (años, grados, tarifas) se cargan si existen endpoints; si no, la persona introduce los identificadores a mano. No se añadieron endpoints de catálogo en esta fase.

## REQUISITOS PENDIENTES

- Proxy de desarrollo `/api` → backend.
- Hoja de estilos y diseño visual definitivo.
- Pantalla de edición de matrícula.
- Endpoints de catálogo (años, grados, tarifas) para que el formulario no requiera introducir identificadores a mano.
- Validación del diseño con personal administrativo.
- DEC-03: matriz de permisos institucionales (los permisos usados son técnicos).

## ESTADO DE LA FASE

**FASE 9 COMPLETADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.** Los diez elementos de diseño general del PM están implementados, con permisos respetados en la interfaz, sesión que sobrevive a la recarga, alta de matrícula con plan de pago, pantalla de tutores y hoja de estilos. 19 pruebas de interfaz en verde. Reservas: diseño visual sin validar con personas usuarias y sin pantalla de edición de matrícula.
