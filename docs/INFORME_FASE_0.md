# Informe de control — FASE 0

Fecha: 2026-11-06. Versión 0.1.

**FASE:** 0 — Análisis inicial y consolidación de requisitos.

**OBJETIVO:** identificar fuentes, requisitos, discrepancias, dependencias, criterios y alcance antes de implementar el SGPM.

## REQUISITOS IMPLEMENTADOS

No se implementaron funcionalidades. Se elaboraron los artefactos de análisis solicitados por PM fase 0 y el estado para continuidad. Se individualizaron los 62 registros originales de D02: 40 FR, 13 NFR, 5 STK-REQ y 4 SYS-REQ. Se agregaron reglas, controles y candidatos con procedencia y estado separados; no se consideran nuevas aprobaciones institucionales.

## ARCHIVOS CREADOS

- `docs/REQUISITOS_CONSOLIDADOS.md`
- `docs/MATRIZ_TRAZABILIDAD.md`
- `docs/DECISIONES_Y_CONTRADICCIONES.md`
- `docs/ALCANCE_IMPLEMENTACION.md`
- `docs/ESTADO_DESARROLLO.md`
- `docs/INVENTARIO_DOCUMENTAL.md`
- `docs/INFORME_FASE_0.md`

## ARCHIVOS MODIFICADOS

Ningún archivo preexistente. Los Markdown nuevos se refinaron durante su elaboración. Documentos originales, prompt y enlace del repositorio conservados. Archivos auxiliares temporales fuera del proyecto en `/tmp/opencode/sgpm-fase0/`; no requeridos para continuar.

## PRUEBAS EJECUTADAS

No hay pruebas del SGPM ejecutadas: no existe aplicación local implementada. Se realizaron inspecciones documentales y comprobaciones mecánicas de los entregables; su alcance es distinto al de pruebas de software.

| Comprobación | Procedimiento | Resultado |
|---|---|---|
| Inventario Office y lectura estructural | Python 3, ZIP/XML de 12 DOCX y del XLSX; hashes SHA-256. | Extracción obtenida; 18 hojas financieras identificadas. |
| Duplicidad de diseño/red | Comparar SHA-256 de D06/D11. | Idénticos: `381a76f82a8ef22b78eda0866d54300a720b8e04eb52c12dd9ef0253fe7465c0`. |
| Contenido de análisis | Lectura de texto V2 y D01 §5; inspección visual de cuatro imágenes D05. | Hallazgos y alcance registrados; lectura exhaustiva de todo D01 no realizada. |
| Consistencia mecánica de Markdown | Python 3: siete archivos, enlaces locales, IDs únicos, fuente/criterio no vacíos, siete columnas del catálogo y rangos SRS. | Salida 0: FR 40/40; NFR 13/13; STK 5/5; SYS 4/4; 119 filas únicas; 16 decisiones; 0 errores. No acredita exactitud semántica de cada criterio. |
| Preservación de originales | Recalcular hashes contra el manifiesto inicial. | 13 archivos Office comprobados sin diferencias; salida 0. |

La comprobación mecánica puede reproducirse sin dependencias de la aplicación: leer los Markdown con Python 3, extraer los IDs de primera columna de las tablas, compararlos con los rangos FR-001–040, NFR-001–013, STK-REQ-001–005 y SYS-REQ-001–004, rechazar duplicados, verificar siete columnas y comprobar que los enlaces relativos existen. Comparar asimismo los SHA-256 de Office con el inventario. El control no prueba calidad semántica exhaustiva ni aprobación institucional.

Comando reproducible desde la raíz (no usa las extracciones temporales):

```bash
python3 - <<'PY'
from pathlib import Path
import re, hashlib
d = Path('docs')
names = ['REQUISITOS_CONSOLIDADOS', 'MATRIZ_TRAZABILIDAD',
         'DECISIONES_Y_CONTRADICCIONES', 'ALCANCE_IMPLEMENTACION',
         'ESTADO_DESARROLLO', 'INVENTARIO_DOCUMENTAL', 'INFORME_FASE_0',
         'DISENO_TECNICO_PROPUESTO', 'CRITERIOS_EVALUACION_PROPUESTOS']
for name in names:
    assert (d / (name + '.md')).is_file(), name
catalog = (d / 'MATRIZ_TRAZABILIDAD.md').read_text().split('## 8. Correspondencia')[0]
ids = []
for line in catalog.splitlines():
    if re.match(r'^\| (FR-|NFR-|STK-REQ-|SYS-REQ-|RN-SGPM-|TEC-|SEG-|CAL-|GOB-|CAND-)', line):
        c = [x.strip() for x in line.strip('|').split('|')]
        assert len(c) == 7 and c[2] and c[5], line
        ids.append(c[0])
assert len(ids) == len(set(ids)) == 119
for prefix, count in [('FR-', 40), ('NFR-', 13), ('STK-REQ-', 5), ('SYS-REQ-', 4)]:
    assert {x for x in ids if x.startswith(prefix)} == {f'{prefix}{n:03}' for n in range(1, count + 1)}
    print(prefix, f'{count}/{count}')
for p in d.glob('*.md'):
    for link in re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)', p.read_text()):
        assert '://' in link or (p.parent / link).exists(), (p, link)
inventory = (d / 'INVENTARIO_DOCUMENTAL.md').read_text()
paths = dict(re.findall(r'^\| (D\d{2}) \| `(documents/[^`]+)`', inventory, re.M))
hashes = dict(re.findall(r'^\| (D\d{2}) \| `([a-f0-9]{64})`', inventory, re.M))
assert len(paths) == len(hashes) == 13
for key, path in paths.items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == hashes[key], key
decisions = re.findall(r'^### (DEC-\d{2})', (d / 'DECISIONES_Y_CONTRADICCIONES.md').read_text(), re.M)
assert decisions == [f'DEC-{n:02}' for n in range(1, 17)]
print('119 IDs únicos; enlaces válidos; 13 hashes originales; 16 decisiones; 0 errores')
PY
```

Incidencia del control auxiliar: la primera versión del comprobador confundió la tabla de correspondencias de cuatro columnas de la sección 8 con el catálogo de siete columnas y terminó con `IndexError` (salida 1). Se inspeccionaron las filas 179–184, se delimitó el catálogo a las secciones 1–7 y se repitió el control completo con salida 0. No se alteró el catálogo para ocultar el fallo. El comando reproducible anterior incorpora esa delimitación.

Al probar la variante permanente del comando, el patrón de rutas también capturó las filas de hashes del inventario y sobrescribió sus rutas, produciendo `FileNotFoundError` (salida 1). Se acotó el patrón a rutas que comienzan con `documents/`; no se modificaron los archivos fuente ni los hashes para resolverlo. La verificación final corresponde al comando corregido.

## RESULTADOS

- Cuatro entregables principales de fase 0 elaborados en versión preliminar, más inventario, estado e informe.
- Matriz con fuentes y criterios individuales para el catálogo SRS; pruebas previstas no marcadas aprobadas.
- Dieciséis registros de decisiones/hallazgos, con alternativas, justificación, responsables propuestos, impacto y estado.
- Separación de alcance técnico documentado, autorización actual del usuario, candidatos y aceptación institucional.
- Orden de implementación y bloqueos definidos sin iniciar fase 1.

## ERRORES DETECTADOS

Motor MySQL/PostgreSQL contradictorio; diseño mal rotulado/duplicado; rúbrica no disponible; roles incompatibles; día 5/día 11; umbrales de rendimiento/recuperación dispares; numeración de pruebas ambigua; ejemplos de SQL heredado y afirmaciones sin evidencia. Detalle en DEC-01–16. La invocación inicial `python` no estaba disponible en el entorno (salida 127); se repitió la extracción con `python3` y se obtuvo salida correcta.

## ERRORES CORREGIDOS

En los entregables nuevos se distinguieron escenarios de hechos, ejemplos de requisitos y pruebas previstas de resultados. Se conservaron IDs originales y se evitó adoptar tablas/roles/tarifas del repositorio o Excel como aprobados. No se corrigieron ni sobrescribieron las fuentes originales; sus discrepancias siguen abiertas para decisión.

## LIMITACIONES

- Faltan diseño independiente correcto, rúbrica y confirmación de equivalencias documentales.
- El contenedor D01 solo se revisó en el diseño; otras imágenes Office/notas/campos y renderizado no revisados. La máquina de estados anunciada en D05 no se observó entre sus imágenes.
- No se auditó código remoto, no se fijó commit y no se ejecutaron tests, SQL, carga, seguridad, restauración ni despliegue del SGPM.
- Sin reglamento de tarifas, matriz final de permisos, inventario institucional, política de conservación ni actas auténticas de aprobación.
- Libro financiero leído como fuente de supuestos; no recálculo ni auditoría financiera/jurídica.

## REQUISITOS PENDIENTES

Completar fuentes/revisión, ratificar políticas financieras y permisos, precisar reglas monetarias/financieras, matrícula/catálogos y despliegue. Aprobar alcance y criterios institucionales sin convertir la instrucción del solicitante en firma del colegio. El motor quedó respondido por el solicitante (DEC-01) y el origen de desarrollo confirmado como nuevo (DEC-16); la implementación del SGPM y las pruebas de producto siguen sin iniciar, mientras la verificación documental de la ronda 2 concluyó en exit 0 / **PASS** (registro `sgpm-fase0-registro-evidencia-01`). Después, y con autorización de continuación, implementar fases posteriores y verificar cada obligación.

## ESTADO DE LA FASE

**EN CURSO / PARCIALMENTE ELABORADA.** La condición «todos los requisitos identificados, clasificados y asociados a fuente» no puede afirmarse para el expediente completo por los límites y fuentes faltantes. Los entregables no constituyen cierre institucional ni habilitan automáticamente fase 1.

Actualización de la tarea `sgpm-fase0-registro-evidencia-01` (registro de evidencia; verificación ronda 2/2): la verificación documental mecánica concluyó en exit 0 / **PASS** y la integración documental en exit 0 / **PASS** (tester `sgpm-fase0-test-02`; reviewer `sgpm-fase0-revision-final-02`). La fase permanece **EN CURSO / PARCIALMENTE ELABORADA** por decisiones y fuentes institucionales pendientes; no se marcó **COMPLETA** ni se habilitó fase 1.

## ACTUALIZACIÓN POSTERIOR — SESIÓN DE DOCUMENTACIÓN (sgpm-fase0-documentacion-01 — intento 1)

**Contexto:** la tarea de documentación `sgpm-fase0-documentacion-01 — intento 1` actualizó la fase 0 consolidada y elaboró dos propuestas propias.

**Documentos modificados (7):** `docs/REQUISITOS_CONSOLIDADOS.md`, `docs/MATRIZ_TRAZABILIDAD.md`, `docs/DECISIONES_Y_CONTRADICCIONES.md`, `docs/ALCANCE_IMPLEMENTACION.md`, `docs/ESTADO_DESARROLLO.md`, `docs/INVENTARIO_DOCUMENTAL.md`, `docs/INFORME_FASE_0.md`.

**Documentos creados (2):** `docs/DISENO_TECNICO_PROPUESTO.md`, `docs/CRITERIOS_EVALUACION_PROPUESTOS.md`.

**Resultados actuales:** **PENDIENTES DE VERIFICACIÓN DE LA ACTUALIZACIÓN.** El comprobador embebido en este informe se actualizó para exigir nueve documentos (las siete entregas iniciales más las dos propuestas), manteniendo los controles de 119 IDs, 16 decisiones y 13 hashes de fuentes, y los enlaces de todos los Markdown. La verificación corresponde al master; esta sesión no ejecutó pruebas.

**Conservación de la historia:** la versión inicial del informe («ningún archivo preexistente») se conserva con su encabezado de registro inicial; esta sección añade la actualización posterior. No se inventó fecha de aprobación exacta: fecha de corte documental heredada 2026-11-06; confirmaciones posteriores en esta conversación sin timestamp independiente.

**Resultados iniciales:** los resultados de la fase 0 inicial se conservan como históricos, con su registro inicial y sus limitaciones; los resultados de esta sesión de documentación están pendientes de verificación.

**Estado de la fase:** **EN CURSO / PARCIALMENTE ELABORADA.** La condición «todos los requisitos identificados, clasificados y asociados a fuente» no puede afirmarse para el expediente completo por los límites y fuentes faltantes. Los entregables no constituyen cierre institucional ni habilitan automáticamente fase 1.

## ACTUALIZACIÓN POSTERIOR — SESIÓN DE CORRECCIÓN DOCUMENTAL (sgpm-fase0-correccion-01 — intento runtime1, ronda documental 2/2)

**Contexto:** la tarea correctiva `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2) desarrolló contenido específico en los documentos de diseño, criterios, decisiones, estado y reporte, sin aplicar cambios de código.

**Resultados reales recibidos por master (ronda 1):** tester `ses_e4c4c94fbffet8g8OrJKjJI1dF` — ronda mecánica **PASS**, exit 0, con 9 documentos exigidos, 119 IDs, 40 FR, 13 NFR, 5 STK-REQ, 4 SYS-REQ, 16 DEC, enlaces válidos y 13 hashes; integración **FAIL** en transacción del ciclo completo. Reviewer `ses_e4c4c3e18ffepzHRT5pbBpkFto` — **FAIL** por lo mismo y por falta de contratos/mapeo; security `ses_e4c4a5c2bffe4ZQCeOo8DV6pE5` — **CON NOTAS**, sin bloqueadores.

**Defectos detectados y corrección documental realizada:** separación Aplicación/Dominio propuesta; modelo conceptual con entidades, relaciones y estados; mapeo módulo→IDs originales agrupados (FR-001–024, FR-025–033, FR-034–040 y STK/SYS/NFR); contratos HTTP ilustrativos por operación con idempotencia y errores; transacciones por operación separadas (A/B/C/D/E); seguridad con título «Seguridad y privacidad de datos personales y de menores»; criterios con columnas de IDs y artefactos mínimos.

**Ronda 2 (documental):** verificación **PENDIENTE**. La fase 0 permanece **EN CURSO / PARCIALMENTE ELABORADA** por políticas no aprobadas; no se afirmó que la corrección ya está validada; no son pruebas del producto las verificaciones mecánicas.

**No se modificó el comprobador para ocultar defectos.**

## ACTUALIZACIÓN POSTERIOR — SESIÓN DE REGISTRO DE EVIDENCIA (sgpm-fase0-registro-evidencia-01 — verificación ronda 2/2)

**Contexto:** la tarea de documentación `sgpm-fase0-registro-evidencia-01` registró la evidencia de la verificación documental correspondiente a la sesión de corrección `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2).

**Resultado (ronda 2):** tester `sgpm-fase0-test-02` — sesión `ses_e4c259a45ffe19WKa29Bd3AQxJ` — **ronda mecánica PASS**, exit 0, con 9 documentos exigidos, 119 IDs, 40 FR, 13 NFR, 5 STK-REQ, 4 SYS-REQ, 16 DEC, enlaces válidos y 13 SHA originales; integración documental **PASS**, exit 0, con transacciones por operación separadas (A/B/C/D/E) y contratos HTTP ilustrativos con idempotencia y errores.

**Errores detectados y corrección / verificación:** los defectos previos (separación Aplicación/Dominio, modelo conceptual, mapeo módulo→IDs, contratos HTTP ilustrativos, transacciones por operación y criterios con artefactos mínimos) fueron corregidos en la sesión `sgpm-fase0-correccion-01`; la ronda 2 verificó mecánica e integración con exit 0 / **PASS**. Los cuatro bloqueadores previos quedaron corregidos según el reviewer.

**Limitaciones:** UI/a11y **NO VERIFICADO** sin aplicación; no se ejecutaron pruebas del producto. Reviewer **PASS WITH NOTES** con cuatro notas menores pendientes (privacidad específica remitida a tutor/retención; criterio sin código vs área documental requiere conciliar frase; tipado de salida y ubicación de errores PDF; permiso de reversión ambiguo); no se corrigieron en este encargo, se registran como limitaciones. Security **CON NOTAS**, sin bloqueadores; correcciones de seguridad en propuesta reconocidas por el reviewer; no se afirmó nueva auditoría de seguridad ejecutada.

**Requisitos pendientes:** completar fuentes/revisión, ratificar políticas financieras y permisos, precisar reglas monetarias/financieras, matrícula/catálogos y despliegue; sin autorización para fase 1.

**Conservación de la historia:** los resultados **PENDIENTES** de las actualizaciones anteriores se conservaron como históricos y esta tarea añadió el resultado **ACTUAL** verificado documentalmente; fase 0 no se marcó **COMPLETA**.

**No se inventó timestamp de aprobación institucional.** No se afirmó aceptación institucional; no se inició fase 1 ni fase productiva.

## CIERRE DE FASE 0 (documental, con reservas)

**Fecha de cierre:** 2026-11-07 (solicitada por el usuario; sin acta institucional).

**Resumen de entregables y resultados:** El cierre solicitado corresponde al cierre documental de la fase 0. Los nueve Markdown exigidos se verificaron en la ronda 2/2 (`sgpm-fase0-registro-evidencia-01`): 9 documentos, 119 IDs únicos, 16 DEC, enlaces válidos y 13 SHA originales; verificación mecánica **PASS** (exit 0) e integración documental **PASS** (exit 0); reviewer **PASS WITH NOTES** y security **CON NOTAS**, sin bloqueadores. No se ejecutaron pruebas del producto; no se afirmó aceptación institucional. FASE 0 no se marcó **COMPLETA** ni se habilitó fase 1.

**Decisiones pendientes y restricciones para fase 1:** Quedan pendientes y registradas como reservas: roles/permisos (DEC-03/04); tarifas y montos (DEC-05); mora/excedente (DEC-07/08); reversión parcial/total (DEC-08); menores/consentimiento (DEC-11); retención de auditoría (DEC-14); fuentes institucionales faltantes (DEC-02/06/09/10/16). FASE 1 NO INICIADA en el momento del cierre.

**Nota:** el cierre documental no equivale a validación institucional ni a cumplimiento completo de los criterios de evaluación.
