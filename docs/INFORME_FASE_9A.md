# Informe de control — FASE 9

Fecha: 2026-11-11. Versión: 1.0.

**FASE:** 9 — Interfaz web y experiencia de usuario (incremento 9.A).

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

## ARCHIVOS MODIFICADOS

- `frontend/src/services/api.ts` — credenciales en cookies, token CSRF para mutaciones, `mensajeDeError`, `iniciarSesion`/`cerrarSesion`/`listar`. Se conservó `checkHealth`.
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

Resultados: `cd frontend && npm test` → 11 pruebas, 11 PASS. `npm run typecheck` → exit 0. `npm run build` → exit 0. El backend no se modificó en esta fase.

## ERRORES DETECTADOS

1. **La navegación perdía la ruta pedida.** Sin sesión se redirigía a `/login` y, al autenticar, a `/`: una persona que abrió `/cobro` acababa en el panel. Corregido renderizando el login en la ruta actual, sin cambiar la URL.
2. **La red de seguridad del cobro era burlable en pruebas:** el mock de éxito no distinguía un cuerpo con error de uno válido. Corregido haciendo que `mensajeDeError` reconozca la forma del error en lugar de depender de `axios.isAxiosError`.
3. **`@testing-library/user-event` no está instalado** y no se puede añadir (misma razón que el PDF: `npm audit` inalcanzable, regla 13 del PM). Las pruebas usan `fireEvent`, que sí está disponible.

## ERRORES CORREGIDOS

Los tres anteriores, verificados.

## LIMITACIONES

1. **Sin dependencias nuevas.** React, React DOM, React Router y Axios ya estaban; no se instaló nada porque `npm audit` no es ejecutable en este entorno y la regla 13 del PM exige poder verificar lo que se instala.
2. **Sin `@testing-library/user-event`:** las pruebas usan `fireEvent`, que no simula la secuencia completa de teclado de `userEvent`. Se prefirió no instalar la dependencia antes que añadir código no verificable.
3. **Sin hoja de estilos completa:** `src/styles/index.css` no se amplió; las clases usadas por los componentes existen pero el diseño visual definitivo no es parte de este cierre técnico.
4. **Proxy de desarrollo:** ya existía en `vite.config.ts` (`/api` → `http://localhost:3000`), de modo que las peticiones de la interfaz llegan al backend en desarrollo.
5. **Sin pantalla de tutores ni de matrícula (alta/edición):** solo listado. La creación de matrícula con plan de pago sigue siendo por API.
6. **La sesión no sobrevive a la recarga:** al montar no se consulta la sesión activa, así que un refresco vuelve al login.

## REQUISITOS PENDIENTES

- Proxy de desarrollo `/api` → backend.
- Hoja de estilos y diseño visual definitivo.
- Alta y edición de matrícula con su plan de pago.
- Persistencia de sesión tras recarga (endpoint de sesión activa).
- Pantalla de tutores.
- DEC-03: matriz de permisos institucionales (los permisos usados son técnicos).

## ESTADO DE LA FASE

**FASE 9.A COMPLETADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.** Los diez elementos de diseño general del PM están implementados, con permisos respetados en la interfaz y pruebas de navegación, formularios, mensajes y tareas. Reservas: sin proxy de desarrollo, sin hoja de estilos definitiva y sin persistencia de sesión tras recarga.
