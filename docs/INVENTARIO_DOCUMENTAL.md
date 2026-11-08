# Inventario documental del SGPM

Fecha de corte: 2026-11-06. Revisión documental local, no auditoría del repositorio remoto ni aceptación institucional.

## Fuentes y localización

Las rutas se expresan desde la raíz del proyecto. `P####` identifica el párrafo no vacío de `word/document.xml`, en orden de aparición, incluidos los párrafos de tablas. Para reproducirlo: abrir el DOCX como ZIP, recorrer `w:p`, concatenar sus descendientes `w:t` y descartar los párrafos cuyo texto sea solo espacio. No son números de página de Word. Las citas de secciones complementan esos localizadores. No se ejecutaron macros ni ejemplos de los documentos.

| ID | Archivo local | Clasificación y lectura |
|---|---|---|
| PM | `Prompt_Maestro_Desarrollo_SGPM_v2.md` | Instrucción de desarrollo vigente; fuente de fases y controles. |
| D01 | `documents/1 » Documento Integral de Ingenieria de Software SGPM  »  Bryan Maradiaga & Steven Manzanares »  [v1].docx` | Contenedor rotulado v1; consultada específicamente su sección 5 de diseño, P2782–3393. Esa sección declara internamente diseño v2; su equivalencia debe confirmarse. No se realizó una revisión exhaustiva de los 8830 párrafos del contenedor. |
| D02 | `documents/entrega I/1 » Levantamiento De Requerimientos » Bryan Maradiaga & Steven Manzanares » [v2].docx` | SRS principal: 1259 párrafos no vacíos; texto revisado, incluidos catálogos y anexos. |
| D03 | `documents/entrega I/2 » Eleccion De Arquitectura » Bryan Maradiaga & Steven Manzanares » [v2].docx` | Arquitectura vigente: 827 párrafos; texto revisado. |
| D04 | `documents/entrega I/3 » Eleccion De Metodologia » Bryan Maradiaga & Steven Manzanares » [v2].docx` | Kanban: 440 párrafos; texto revisado. Conserva referencias a MySQL. |
| D05 | `documents/entrega I/4 » Analisis Modelado De Lenguaje » Bryan Maradiaga & Steven Manzanares [v2].docx` | Dominio: 351 párrafos; texto y cuatro imágenes revisados: logo, actividades de ventanilla, secuencia FIFO y casos de uso. |
| D06 | `documents/entrega I/5 » Diseño Modelado De Lenguaje » Bryan Maradiaga & Steven Manzanares » [v2].docx` | Contenido incorrectamente rotulado: es escenario de red. 487 párrafos; idéntico byte a byte a D11. No acredita el diseño independiente esperado. |
| D07 | `documents/entrega II/1 » Principios SOLID » Bryan Maradiaga & Steven Manzanares »  [v2].docx` | 605 párrafos; texto revisado. Ejemplos de diseño, no código ejecutado. |
| D08 | `documents/entrega II/2 » Programacion Segura » Bryan Maradiaga & Steven Manzanares »  [v2] .docx` | 1002 párrafos; texto revisado, incluidas ambas partes y anexos. Contiene matrices incompatibles de roles y metas históricas. |
| D09 | `documents/entrega II/3 » Aplicacion De Prueba De Base De Datos » Bryan Maradiaga & Steven Manzanares »  [v2] .docx` | 424 párrafos; texto revisado. Protocolos no ejecutados; permanecen fragmentos de dialecto MySQL. |
| D10 | `documents/entrega II/4 » Aplicacion De Prueba Del Sistema » Bryan Maradiaga & Steven Manzanares »  [v2] .docx` | 873 párrafos; texto revisado. Casos y resultados esperados, no evidencia de ejecución. |
| D11 | `documents/entrega II/5 » Escenario de Red Estructurado » Bryan Maradiaga & Steven Manzanares »  [v2] .docx` | 487 párrafos; revisado mediante su copia idéntica D06. Direcciones, puertos y equipos tratados como escenarios. |
| D12 | `documents/entrega III/1 » Informe Financiero - Juridico »  Bryan Maradiaga & Steven Manzanares »  [v2].docx` | 2156 párrafos; texto revisado. Estimaciones, instrumentos sin firma y criterios propuestos; no tarifas autorizadas. |
| D13 | `documents/entrega III/2 » Tabla Analisis Financiero - Juridico »  Bryan Maradiaga & Steven Manzanares »  [v2].xlsx` | 18 hojas: entradas, fórmulas y cachés revisadas mediante XML. No se recalcularon fórmulas ni se certificaron resultados financieros. |
| REF | `documents/[REPO LINK].txt` | Referencia a `https://github.com/bamwilt/system_CCM`; no descargado ni inspeccionado en esta fase. |

## Artefactos propios elaborados en la sesión de documentación (PROPUESTOS)

| Documento | Contenido | Estado | Fuentes de derivación |
|---|---|---|---|
| `docs/DISENO_TECNICO_PROPUESTO.md` | Diseño técnico propuesto: capas frontend/API/controladores/aplicación/dominio/repositorios con PostgreSQL, módulos y relaciones conceptuales con incertidumbres DEC, requisitos→componentes PROPUESTOS, contratos HTTP ilustrativos, invariantes, seguridad y fases. | PROPUESTO; no es aprobación institucional ni adopción. | PM fases 0–14; D02, D03, D05, D07, D08, D09, D10; consolidación en [REQUISITOS_CONSOLIDADOS.md](REQUISITOS_CONSOLIDADOS.md). |
| `docs/CRITERIOS_EVALUACION_PROPUESTOS.md` | Criterios de evaluación propuestos con las categorías exactas del PM fase 14 — LOGRADO, LOGRADO CON OBSERVACIONES, PARCIALMENTE LOGRADO y NO EVIDENCIADO —, trazabilidad, evidencia mínima, reglas honestas y formato. | PROPUESTO; no sustituye la rúbrica institucional ausente. | PM fase 14. |

Los requisitos consolidados no se consideran nuevos aprobados; los componentes descritos como PROPUESTOS no generan identificadores de requisitos nuevos.

## Extractos técnicos y permisos de la sesión

- Los tres extractos técnicos `.minion/inputs/{ARQUITECTURA,METODOLOGIA,SOLID}.md` se generaron como texto con el contenido y la SHA-256 original de los documentos fuente; su tamaño supera 1 MiB en el lote autorizado y no requieren modificar los DOCX.
- Permisos mínimos autorizados en esta sesión: `raíz`, `docs`, `documents`, `documents/entrega I`, `documents/entrega II` y `documents/entrega III` de `0o775` a `0o755`; los Markdown de `docs/` y el prompt de la raíz de `0o664` a `0o644`. No se ampliaron permisos sobre los originales.
- No debe confundirse este procedimiento con certificación de seguridad o aval de producto.

## Huellas SHA-256 de los archivos Office

| Fuente | SHA-256 |
|---|---|
| D01 | `4af71cb38e4ac449c368dce2103b770aad5094866617687f3e5d29efd89e7d6b` |
| D02 | `5e7e0d0420e01d051954fb9252c9bcc88c4a8a3d2ab5e3111f0d30c17c3b40a1` |
| D03 | `f15c2c18cc7aaec781bceebc9128f8b1fe2ea9d45e6fcfbd1c3fbed6fa3464f3` |
| D04 | `458335344d8e5ec7e23dba0a30322f2eb1d0ac3c4223eb41c0c558eacb042ebe` |
| D05 | `4913fbbc95257619d0f163f4207688c5c118efc8ba24dbdeae14f4e7b49d09f3` |
| D06 | `381a76f82a8ef22b78eda0866d54300a720b8e04eb52c12dd9ef0253fe7465c0` |
| D07 | `59364aa06185a34029ab2dfee2fa7124b7445212dbcf28610225474f94ea1c79` |
| D08 | `0e69af2dd4adb650580b102b83b7bd8fb73136ddba8eb24013ab67cea2f7715d` |
| D09 | `71ec23071df8249e329f43b3840dc8d5c8c18444d03ffbf1fbf6a0799ac82ae9` |
| D10 | `039ec4a6ecbbeb529a1f7cf27576e22d354a38255e81af004d72410a76ab1df3` |
| D11 | `381a76f82a8ef22b78eda0866d54300a720b8e04eb52c12dd9ef0253fe7465c0` |
| D12 | `99f9220da50dcf9ec47618fd1dda33471a9632a0bb9a91093620935504c81b64` |
| D13 | `ab09d22ff4033d4d86547fabddb28a475166cfecc5aa09d1fa620442dcbdef0a` |

## Disponibilidad frente al prompt

- Disponibles: requisitos, arquitectura, metodología, análisis, SOLID, seguridad/ISO, planes de pruebas BD/sistema, red e informe económico con libro de cálculo.
- Diseño: no está disponible como documento independiente correcto. Existe una sección recuperable en D01, con declaración interna v2 y procedencia `Diseno_Modelado_Lenguaje_v2_APA7_INDICE.docx`; no se promueve automáticamente sobre los V2 independientes.
- No localizados en el árbol local inventariado: `Informe_Generico_Criterios_Evaluacion_Software(1).md` ni variante `(2).md`, ni un archivo independiente titulado «Modelo Financiero y Técnico». D13 es candidato para este último, equivalencia pendiente.
- No se localizaron archivos separados de actas firmadas, reglamento de tarifas, inventario institucional o export de datos de Eleventa. Los modelos de acta de D12 no equivalen a esos documentos.

## Límites

La extracción examinó texto y tablas; se inspeccionaron además las cuatro imágenes de D05. Los diagramas representan los mismos procesos descritos, no demuestran implementación ni resuelven las políticas pendientes. D05 anuncia máquina de estados, pero entre sus imágenes solo se observaron logo, actividades, secuencia y casos de uso: solicitar el modelo de estados si existe. No se revisaron visualmente las imágenes de los demás documentos, el diseño de páginas de Word, campos, notas o comentarios. No puede declararse exhaustividad semántica de todo el expediente mientras falten las fuentes y revisiones indicadas. Las extracciones auxiliares de esta sesión están en `/tmp/opencode/sgpm-fase0/`; no son entregables permanentes ni deben ser una dependencia para retomar el trabajo. Los originales y sus huellas son la referencia permanente.

La consulta al índice de conocimiento encontró únicamente otros proyectos, ninguno con esta raíz. Se usó inspección directa de documentos no-code; no se atribuye evidencia de código al grafo.
