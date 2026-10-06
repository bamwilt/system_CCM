-- ============================================================================
--  CCM - Datos de demostración
--  Ejecutar DESPUÉS de db/schema.sql y db/migrations/001_auth.sql
--
--  Todas las claves foráneas (31) del esquema original están vacías. Este
--  archivo las puebla con un conjunto coherente y realista para poder
--  demostrar el sistema en clase.
--
--  Volumen: 5 usuarios · 30 clientes · 25 estudiantes · 12 docentes ·
--           30 matrículas · 78 notas · órdenes de pago y productos.
--
--  Es idempotente: TRUNCATE ... RESTART IDENTITY lo deja limpio para
--  reejecutarlo las veces que haga falta.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Limpieza (orden inverso de dependencias)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
    pagos, orden_producto, orden_servicio, orden_pago,
    pension_academica, servicio_academico, nota, evaluaciones,
    horario_asignatura, matriculas, tutor_estudiante,
    docente_asignatura, productos,
    docentes, secretarias, empleados,
    tutores, estudiantes, clientes,
    asignaturas, programa_academico, grupo_academico, periodo_academico,
    ubicacion_academica, nivel_academico, metodo_pago, monedas,
    usuarios
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Usuarios  (contraseñas de demostración - ver README)
-- ---------------------------------------------------------------------------
INSERT INTO usuarios (usuario_id, nombre, email, password_hash, rol) VALUES
  (1, 'Bryan Martínez',    'admin@ccm.edu.do',      '$2b$12$0tD9QXgxiUdP6FrbeAnGEurJwkQ5g4iwfKZl8NBrn4d5p7IAPGoe2', 'admin'),
  (2, 'Ana Lucía Fernández','secretaria@ccm.edu.do','$2b$12$F2fvLxlhmmy7hNthzLk/K.d.yG2xnr1RqGwZ/l9pe50kGVDFlQzIm', 'secretaria'),
  (3, 'Carlos Mendoza',    'docente@ccm.edu.do',     '$2b$12$wVVSPX/MK1DW.s137LdqDehDG6QFOCONIAZ.RwbhIffaVxtI9vToW', 'docente'),
  (4, 'Rosa Peña',         'consulta@ccm.edu.do',    '$2b$12$RdkfrV5j3G4XTgK4VoPnV.y/BwbiHx/NnP.gKHV/.9GIQFuWzn/Y.', 'consulta'),
  (5, 'Miguel Díaz',       'docente2@ccm.edu.do',    '$2b$12$wVVSPX/MK1DW.s137LdqDehDG6QFOCONIAZ.RwbhIffaVxtI9vToW', 'docente');
-- Contraseñas: admin@ccm.edu.do -> Admin123!
--             secretaria@ccm.edu.do -> Secretaria123!
--             docente@ccm.edu.do / docente2@ccm.edu.do -> Docente123!
--             consulta@ccm.edu.do -> Consulta123!

-- ---------------------------------------------------------------------------
-- 2. Catálogos base
-- ---------------------------------------------------------------------------
INSERT INTO monedas (moneda_id, nombre_moneda, simbolo, tipo_cambio) VALUES
  (1, 'Peso Dominicano', 'RD$', 100),
  (2, 'Dolar.US',        '$',  118),
  (3, 'Euro',            '€',  128);

INSERT INTO metodo_pago (metodo_pago_id, nombre_metodo, descripcion) VALUES
  (1, 'Efectivo',        'Pago en efectivo en caja'),
  (2, 'Tarjeta',         'Tarjeta de debito o credito'),
  (3, 'Transferencia',   'Transferencia bancaria');

INSERT INTO nivel_academico (nivel_academico_id, nivel_nombre, descripcion, edad_min, edad_max) VALUES
  (1, 'Preescolar', 'Nivel inicial',  3,  5),
  (2, 'Primaria',   'Primer ciclo',   6,  11),
  (3, 'Secundaria', 'Ciclo basico',  12, 16),
  (4, 'Bachiller',  'Nivel medio',   17, 18);

INSERT INTO ubicacion_academica (ubicacion_academica_id, nombre, capacidad, ubicacion_tipo, estado) VALUES
  (1, 'Aula 101',        30, 'Aula',    true),
  (2, 'Aula 102',        30, 'Aula',    true),
  (3, 'Aula 201',        28, 'Aula',    true),
  (4, 'Laboratorio 1',   20, 'Laboratorio', true),
  (5, 'Biblioteca',      60, 'Biblioteca',  true),
  (6, 'Auditorio',      100, 'Auditorio',   true);

INSERT INTO periodo_academico (periodo_academico_id, fecha_inicio, fecha_fin) VALUES
  (1, DATE '2025-08-18', DATE '2025-12-19'),
  (2, DATE '2026-01-12', DATE '2026-04-10'),
  (3, DATE '2026-08-17', DATE '2026-12-18');

-- ---------------------------------------------------------------------------
-- 3. Grupos y programas  (grupo -> nivel, programa -> grupo + periodo)
-- ---------------------------------------------------------------------------
INSERT INTO grupo_academico (grupo_academico_id, nivel_academico_id, grupo_nombre, turno) VALUES
  (1, 1, 'Preescolar A', 'Matutino'),
  (2, 2, 'Primero A',    'Matutino'),
  (3, 2, 'Segundo A',    'Matutino'),
  (4, 2, 'Tercero A',    'Vespertino'),
  (5, 3, '1ro Sec A',    'Matutino'),
  (6, 4, '5to Bach A',   'Matutino');

INSERT INTO programa_academico (programa_academico_id, grupo_academico_id, periodo_academico_id, nombre_pograma, codigo) VALUES
  (1, 1, 1, 'Inicial 1',              101),
  (2, 2, 1, 'Primaria Basica',        201),
  (3, 3, 1, 'Primaria Basica',        202),
  (4, 4, 1, 'Primaria Superior',      203),
  (5, 5, 1, 'Secundaria Basica',      301),
  (6, 6, 2, 'Bachillerato Cientifico',401);

-- ---------------------------------------------------------------------------
-- 4. Asignaturas  (codigo es UNIQUE)
-- ---------------------------------------------------------------------------
INSERT INTO asignaturas (asignatura_id, programa_academico_id, nombre_asignatura, codigo, horas_semana, descripcion) VALUES
  (1,  2, 'Matematica',      1001, 5, 'Aritmetica y geometria'),
  (2,  2, 'Lengua Espanola', 1002, 6, 'Lectura y escritura'),
  (3,  2, 'Ciencias',        1003, 4, 'Ciencias naturales'),
  (4,  3, 'Historia',        1004, 3, 'Historia dominicana'),
  (5,  3, 'Educacion Fisica',1005, 2, 'Deporte y educacion fisica'),
  (6,  4, 'Informatica',     1006, 2, 'Fundamentos de computacion'),
  (7,  5, 'Algebra',         1007, 5, 'Algebra elemental'),
  (8,  5, 'Biologia',        1008, 4, 'Biologia general'),
  (9,  6, 'Fisica',          1009, 5, 'Mecanica y ondas'),
  (10, 6, 'Quimica',         1010, 5, 'Quimica general'),
  (11, 6, 'Calculo',         1011, 6, 'Calculo diferencial'),
  (12, 1, 'Psicologia',      1012, 2, 'Desarrollo infantil');

-- ---------------------------------------------------------------------------
-- 5. Ubicación de clases
-- ---------------------------------------------------------------------------
INSERT INTO horario_asignatura (horario_asignatura_id, asignatura_id, ubicacion_academica_id, hora_inicio, hora_fin, aula) VALUES
  (1,  1,  1, '08:00', '09:00', 'Aula 101'),
  (2,  2,  1, '09:00', '10:00', 'Aula 101'),
  (3,  3,  2, '08:00', '09:00', 'Aula 102'),
  (4,  4,  2, '10:00', '11:00', 'Aula 102'),
  (5,  5,  3, '11:00', '12:00', 'Aula 201'),
  (6,  6,  3, '08:00', '09:00', 'Aula 201'),
  (7,  7,  4, '09:00', '10:00', 'Laboratorio 1'),
  (8,  8,  4, '10:00', '11:00', 'Laboratorio 1'),
  (9,  9,  6, '08:00', '09:00', 'Auditorio'),
  (10, 11, 6, '11:00', '12:00', 'Auditorio'),
  (11, 10, 4, '09:00', '10:00', 'Laboratorio 1'),
  (12, 12, 5, '10:00', '11:00', 'Biblioteca');

-- ---------------------------------------------------------------------------
-- 6. Personal: empleados, secretarias, docentes
--    (cedula y email son UNIQUE)
-- ---------------------------------------------------------------------------
INSERT INTO empleados (empleado_id, primer_nombre, primer_apellido, cedula, direccion, telefono, email, fecha_contratacion, salario, estado) VALUES
  (1,  'Ana Lucia',  'Fernandez', '001-1234567-8', 'Calle Duarte 12',   '809-555-0101', 'afernandez@ccm.edu.do', TIMESTAMP '2020-02-10 08:00', 42000, true),
  (2,  'Rosa',       'Pena',       '001-2345678-9', 'Calle Mella 34',    '809-555-0102', 'rpena@ccm.edu.do',      TIMESTAMP '2021-01-15 08:00', 38000, true),
  (3,  'Carlos',     'Mendoza',    '001-3456789-0', 'Av. Independencia 5','809-555-0103','cmendoza@ccm.edu.do',   TIMESTAMP '2019-08-20 08:00', 52000, true),
  (4,  'Miguel',     'Diaz',       '001-4567890-1', 'Calle Las Damas 7', '809-555-0104', 'mdiaz@ccm.edu.do',      TIMESTAMP '2018-03-05 08:00', 50000, true),
  (5,  'Yokasta',    'Reyes',      '001-5678901-2', 'Calle El Sol 22',   '809-555-0105', 'yreyes@ccm.edu.do',     TIMESTAMP '2022-01-10 08:00', 34000, true),
  (6,  'Jose Luis',  'Ortiz',      '001-6789012-3', 'Calle La Paz 88',   '809-555-0106', 'jortiz@ccm.edu.do',     TIMESTAMP '2017-08-14 08:00', 48000, true),
  (7,  'Marta',      'Nunez',      '001-7890123-4', 'Calle Duarte 40',   '809-555-0107', 'mnunez@ccm.edu.do',     TIMESTAMP '2023-01-09 08:00', 31000, true),
  (8,  'Rafael',     'Guzman',     '001-8901234-5', 'Av. Mitre 19',      '809-555-0108', 'rguzman@ccm.edu.do',    TIMESTAMP '2020-09-01 08:00', 45000, true),
  (9,  'Laura',      'Velasquez',  '001-9012345-6', 'Calle Mella 71',    '809-555-0109', 'lvelasquez@ccm.edu.do', TIMESTAMP '2021-08-16 08:00', 36000, true),
  (10, 'Pedro',      'Ramirez',    '002-0123456-7', 'Calle El Sol 103',  '809-555-0110', 'pramirez@ccm.edu.do',   TIMESTAMP '2022-08-22 08:00', 33000, true),
  (11, 'Isabel',     'Santana',    '002-1234567-8', 'Calle Las Damas 55','809-555-0111','isantana@ccm.edu.do',   TIMESTAMP '2019-02-28 08:00', 41000, true),
  (12, 'Hector',     'Almonte',    '002-2345678-9', 'Av. Independencia 88','809-555-0112','halmonte@ccm.edu.do',  TIMESTAMP '2023-08-07 08:00', 30000, true),
  (13, 'Nurys',      'Castillo',   '002-3456789-0', 'Calle Duarte 61',   '809-555-0113', 'ncastillo@ccm.edu.do',  TIMESTAMP '2024-01-08 08:00', 29000, true),
  (14, 'Wilfredo',   'Jimenez',    '002-4567890-1', 'Calle Mella 25',    '809-555-0114', 'wjimenez@ccm.edu.do',   TIMESTAMP '2024-08-05 08:00', 28000, true),
  (15, 'Altagracia','De la Cruz', '002-5678901-2', 'Calle La Paz 14',   '809-555-0115', 'adelacruz@ccm.edu.do', TIMESTAMP '2025-01-13 08:00', 27000, true);

INSERT INTO secretarias (empleado_id, area, fecha_ingreso, estado) VALUES
  (1, 'Registro y Matricula',    DATE '2020-02-10', true),
  (2, 'Finanzas',                DATE '2021-01-15', true),
  (5, 'Academica',               DATE '2022-01-10', true),
  (7, 'Atencion al Estudiante', DATE '2023-01-09', true),
  (13,'Direccion',               DATE '2024-01-08', true);

INSERT INTO docentes (empleado_id, docente_codigo, titulo_profesional, especialidad, nivel_formacion, experiencia_docente, fecha_ingreso, categorioa_docente, dedicacion, estado) VALUES
  (3,  1001, 'Licenciatura en Matematicas',  'Matematica',    'Maestro',  '12 anos', DATE '2019-08-20', 'Titular',      'Tiempo completo', true),
  (4,  1002, 'Licenciatura en Fisica',       'Fisica',        'Maestro',  '10 anos', DATE '2018-03-05', 'Titular',      'Tiempo completo', true),
  (6,  1003, 'Licenciatura en Biologia',     'Ciencias',      'Maestro',  '15 anos', DATE '2017-08-14', 'Titular',      'Tiempo completo', true),
  (8,  1004, 'Licenciatura en Historia',     'Humanidades',   'Maestro',  '8 anos',  DATE '2020-09-01', 'Asociado',     'Medio tiempo',   true),
  (9,  1005, 'Licenciatura en Educacion',    'Deporte',       'Maestro',  '6 anos',  DATE '2021-08-16', 'Auxiliar',     'Medio tiempo',   true),
  (10, 1006, 'Ingenieria en Sistemas',       'Informatica',   'Doctor',   '9 anos',  DATE '2022-08-22', 'Titular',      'Tiempo completo', true),
  (11, 1007, 'Licenciatura en Quimica',      'Quimica',       'Maestro',  '14 anos', DATE '2019-02-28', 'Titular',      'Tiempo completo', true),
  (12, 1008, 'Licenciatura en Fisica',       'Fisica',        'Maestro',  '3 anos',  DATE '2023-08-07', 'Auxiliar',     'Medio tiempo',   true),
  (13, 1009, 'Licenciatura en Ingles',       'Lenguas',       'Maestro',  '7 anos',  DATE '2024-01-08', 'Asociado',     'Tiempo completo', true),
  (14, 1010, 'Licenciatura en Matematicas',  'Matematica',    'Maestro',  '2 anos',  DATE '2024-08-05', 'Auxiliar',     'Medio tiempo',   true),
  (15, 1011, 'Maestria en Estadistica',      'Estadistica',   'Doctor',   '11 anos', DATE '2025-01-13', 'Titular',      'Tiempo completo', true),
  (1,  1012, 'Licenciatura en Psicologia',   'Psicologia',    'Maestro',  '5 anos',  DATE '2020-02-10', 'Asociado',     'Medio tiempo',   true);
-- Nota: `categoria_docente` tiene el typo `categorioa_docente` en el esquema original.

INSERT INTO docente_asignatura (docente_codigo, asignatura_id) VALUES
  (1001, 1), (1001, 7), (1001, 11),
  (1002, 9),  (1002, 12),
  (1003, 3),  (1003, 8),
  (1004, 4),
  (1005, 5),
  (1006, 6),
  (1007, 10),
  (1009, 2),
  (1011, 11);

-- ---------------------------------------------------------------------------
-- 7. Clientes y estudiantes
--    La PII base (nombre, telefono, email) vive en `clientes`;
--    `estudiantes` referencia al cliente y añade nombre propio y nacimiento.
--    email es UNIQUE -> los de familia no se repiten entre si.
-- ---------------------------------------------------------------------------
INSERT INTO clientes (cliente_id, nombre, telefono, email, cliente_tipo) VALUES
  (1,  'Maria Josefina Rosario',    '809-555-2001', 'mrosario@correo.do',    'Tutor'),
  (2,  'Jose Antonio Nunez',       '809-555-2002', 'jnunez@correo.do',      'Tutor'),
  (3,  'Carmen Yolanda Perez',     '809-555-2003', 'cperez@correo.do',      'Tutor'),
  (4,  'Luis Manuel Tavarez',       '809-555-2004', 'ltavarez@correo.do',    'Tutor'),
  (5,  'Elena Rosa Diaz',           '809-555-2005', 'ediaz@correo.do',       'Tutor'),
  (6,  'Pedro Pablo Gomez',        '809-555-2006', 'pgomez@correo.do',      'Padre'),
  (7,  'Ana Lucia Martinez',       '809-555-2007', 'amartinez@correo.do',   'Madre'),
  (8,  'Rafael Antonio Diaz',      '809-555-2008', 'rdiaz@correo.do',       'Padre'),
  (9,  'Carmen Rosa Santana',      '809-555-2009', 'csantana@correo.do',    'Madre'),
  (10, 'Jorge Luis Perez',         '809-555-2010', 'jperez@correo.do',      'Padre'),
  (11, 'Marta Josefa Reyes',       '809-555-2011', 'mreyes@correo.do',      'Madre'),
  (12, 'Luis Enrique Tavarez',     '809-555-2012', 'ltavarez2@correo.do',   'Padre'),
  (13, 'Elena Maria Rosario',      '809-555-2013', 'erosario@correo.do',    'Madre'),
  (14, 'Jose Miguel Gomez',        '809-555-2014', 'jgomez@correo.do',      'Padre'),
  (15, 'Yolanda Carmen Diaz',      '809-555-2015', 'ydiaz@correo.do',       'Madre'),
  (16, 'Pedro Santana Perez',      '809-555-2016', 'psantana@correo.do',    'Padre'),
  (17, 'Ana Belen Reyes',          '809-555-2017', 'areyes@correo.do',      'Madre'),
  (18, 'Luis Alberto Gomez',       '809-555-2018', 'lgomez@correo.do',      'Padre'),
  (19, 'Carmen Ana Diaz',          '809-555-2019', 'cdiaz@correo.do',       'Madre'),
  (20, 'Rafael Jose Tavarez',      '809-555-2020', 'rtavarez@correo.do',    'Padre'),
  (21, 'Maria Elena Rosario',      '809-555-2021', 'mrosario2@correo.do',   'Madre'),
  (22, 'Jose Manuel Perez',        '809-555-2022', 'jperez2@correo.do',     'Padre'),
  (23, 'Yokasta Reina Gomez',      '809-555-2023', 'ygomez@correo.do',      'Madre'),
  (24, 'Ana Rosa Santana',         '809-555-2024', 'asantana@correo.do',    'Madre'),
  (25, 'Pedro Diaz Tavarez',       '809-555-2025', 'ptavarez@correo.do',    'Padre'),
  (26, 'Carmen Ysabel Perez',      '809-555-2026', 'cyperez@correo.do',     'Madre'),
  (27, 'Luis Jose Diaz',           '809-555-2027', 'ldiaz@correo.do',       'Padre'),
  (28, 'Ana Maria Gomez',          '809-555-2028', 'amgomez@correo.do',     'Madre'),
  (29, 'Rafael Antonia Perez',     '809-555-2029', 'rperez@correo.do',      'Padre'),
  (30, 'Yolanda Rosa Tavarez',     '809-555-2030', 'ytavarez@correo.do',    'Madre');

INSERT INTO estudiantes (estudiante_id, cliente_id, primer_nombre, primer_apellido, direccion, nacimiento, telefono, fecha_registro, estado) VALUES
  (1,  6,  'Luis Enrique',  'Perez Rosario',    'Calle Duarte 12',   DATE '2015-03-14', '809-555-3001', TIMESTAMP '2025-08-20 09:00', true),
  (2,  7,  'Maria Josefa',  'Martinez Nunez',   'Calle Mella 44',    DATE '2015-07-02', '809-555-3002', TIMESTAMP '2025-08-20 09:05', true),
  (3,  8,  'Pedro Rafael',  'Diaz Santana',     'Av. Independencia 8', DATE '2015-11-25', '809-555-3003', TIMESTAMP '2025-08-20 09:10', true),
  (4,  9,  'Carmen Ana',    'Perez Reyes',      'Calle El Sol 21',   DATE '2015-11-25', '809-555-3004', TIMESTAMP '2025-08-21 08:40', true),
  (5,  10, 'Jorge Luis',    'Perez Tavarez',    'Calle La Paz 66',   DATE '2016-01-08', '809-555-3005', TIMESTAMP '2025-08-21 08:45', true),
  (6,  11, 'Ana Lucia',     'Reyes Diaz',       'Calle Mella 12',    DATE '2016-04-19', '809-555-3006', TIMESTAMP '2025-08-21 08:50', true),
  (7,  12, 'Carlos Manuel', 'Tavarez Perez',    'Av. Mitre 30',      DATE '2016-06-03', '809-555-3007', TIMESTAMP '2025-08-21 08:55', true),
  (8,  13, 'Elena Maria',   'Rosario Gomez',    'Calle Duarte 88',   DATE '2016-09-12', '809-555-3008', TIMESTAMP '2025-08-22 09:00', true),
  (9,  14, 'Jose Miguel',   'Gomez Diaz',       'Calle Las Damas 15',DATE '2016-10-30', '809-555-3009', TIMESTAMP '2025-08-22 09:05', true),
  (10, 15, 'Yolanda Carmen','Diaz Perez',       'Calle El Sol 7',    DATE '2016-12-15', '809-555-3010', TIMESTAMP '2025-08-22 09:10', true),
  (11, 16, 'Pedro Alberto', 'Santana Gomez',    'Av. Independencia 5', DATE '2017-02-08', '809-555-3011', TIMESTAMP '2025-08-22 09:15', true),
  (12, 17, 'Ana Belen',     'Reyes Tavarez',    'Calle La Paz 40',   DATE '2017-02-08', '809-555-3012', TIMESTAMP '2025-08-23 09:00', true),
  (13, 18, 'Luis Alberto',  'Gomez Diaz',       'Calle Mella 33',    DATE '2017-03-22', '809-555-3013', TIMESTAMP '2025-08-23 09:05', true),
  (14, 19, 'Rosa Elena',    'Diaz Perez',       'Calle Duarte 5',    DATE '2017-05-17', '809-555-3014', TIMESTAMP '2025-08-23 09:10', true),
  (15, 20, 'Rafael Jose',   'Tavarez Rosario',  'Av. Mitre 77',      DATE '2017-08-04', '809-555-3015', TIMESTAMP '2025-08-23 09:15', true),
  (16, 21, 'Ana Rosa',      'Rosario Perez',     'Calle La Paz 21',   DATE '2018-01-11', '809-555-3016', TIMESTAMP '2026-01-15 09:00', true),
  (17, 22, 'Jose Manuel',   'Perez Diaz',       'Calle El Sol 63',   DATE '2018-04-06', '809-555-3017', TIMESTAMP '2026-01-15 09:05', true),
  (18, 23, 'Yokasta Reina', 'Gomez Santana',    'Calle Duarte 29',   DATE '2018-06-19', '809-555-3018', TIMESTAMP '2026-01-15 09:10', true),
  (19, 24, 'Ana Isabel',    'Santana Tavarez',  'Av. Independencia 9', DATE '2018-11-15', '809-555-3019', TIMESTAMP '2026-01-15 09:15', true),
  (20, 25, 'Pedro Luis',    'Tavarez Perez',     'Calle Mella 47',    DATE '2018-09-27', '809-555-3020', TIMESTAMP '2026-01-16 09:00', true),
  (21, 26, 'Carmen Ysabel', 'Perez Diaz',       'Calle Las Damas 51',DATE '2018-11-15', '809-555-3021', TIMESTAMP '2026-01-16 09:05', true),
  (22, 27, 'Luis Jose',     'Diaz Gomez',       'Calle La Paz 8',    DATE '2019-02-21', '809-555-3022', TIMESTAMP '2026-01-16 09:10', true),
  (23, 28, 'Ana Maria',     'Gomez Perez',       'Calle Duarte 91',   DATE '2019-05-09', '809-555-3023', TIMESTAMP '2026-01-16 09:15', true),
  (24, 29, 'Rafael Antonia','Perez Diaz',       'Av. Mitre 12',      DATE '2019-08-01', '809-555-3024', TIMESTAMP '2026-01-19 09:00', true),
  (25, 30, 'Yolanda Rosa',  'Tavarez Gomez',    'Calle El Sol 35',   DATE '2019-10-30', '809-555-3025', TIMESTAMP '2026-01-19 09:05', true);

-- ---------------------------------------------------------------------------
-- 8. Tutores  (referencian clientes 1-5)
-- ---------------------------------------------------------------------------
INSERT INTO tutores (tutor_id, cliente_id, primer_nombre, primer_apellido, direccion, telefono) VALUES
  (1, 1, 'Maria Josefina', 'Rosario',  'Calle Duarte 12',  '809-555-2001'),
  (2, 2, 'Jose Antonio',  'Nunez',    'Calle Mella 34',   '809-555-2002'),
  (3, 3, 'Carmen Yolanda','Perez',    'Av. Independencia 5','809-555-2003'),
  (4, 4, 'Luis Manuel',   'Tavarez',  'Calle El Sol 22',  '809-555-2004'),
  (5, 5, 'Elena Rosa',    'Diaz',     'Calle La Paz 88',  '809-555-2005');

INSERT INTO tutor_estudiante (tutor_id, estudiante_id, fecha_asignacion) VALUES
  (1, 1,  TIMESTAMP '2025-08-25 10:00'),
  (1, 2,  TIMESTAMP '2025-08-25 10:05'),
  (2, 3,  TIMESTAMP '2025-08-25 10:10'),
  (2, 4,  TIMESTAMP '2025-08-25 10:15'),
  (3, 5,  TIMESTAMP '2025-08-25 10:20'),
  (3, 6,  TIMESTAMP '2025-08-25 10:25'),
  (4, 7,  TIMESTAMP '2025-08-25 10:30'),
  (4, 8,  TIMESTAMP '2025-08-25 10:35'),
  (5, 9,  TIMESTAMP '2025-08-25 10:40'),
  (5, 10, TIMESTAMP '2025-08-25 10:45'),
  (1, 11, TIMESTAMP '2026-01-20 10:00'),
  (1, 12, TIMESTAMP '2026-01-20 10:05'),
  (2, 13, TIMESTAMP '2026-01-20 10:10'),
  (2, 14, TIMESTAMP '2026-01-20 10:15'),
  (3, 15, TIMESTAMP '2026-01-20 10:20'),
  (3, 16, TIMESTAMP '2026-01-20 10:25'),
  (4, 17, TIMESTAMP '2026-01-20 10:30'),
  (4, 18, TIMESTAMP '2026-01-20 10:35'),
  (5, 19, TIMESTAMP '2026-01-20 10:40'),
  (5, 20, TIMESTAMP '2026-01-20 10:45');

-- ---------------------------------------------------------------------------
-- 9. Matriculas  (estudiante + grupo)
-- ---------------------------------------------------------------------------
INSERT INTO matriculas (matricula_id, estudiante_id, grupo_academico_id, matricula_fecha, observaciones) VALUES
  (1,  1,  2, DATE '2025-08-18', 'Matricula ordinaria'),
  (2,  2,  2, DATE '2025-08-18', 'Matricula ordinaria'),
  (3,  3,  3, DATE '2025-08-18', 'Matricula ordinaria'),
  (4,  4,  3, DATE '2025-08-18', 'Beca parcial'),
  (5,  5,  4, DATE '2025-08-19', 'Matricula ordinaria'),
  (6,  6,  4, DATE '2025-08-19', 'Matricula ordinaria'),
  (7,  7,  5, DATE '2025-08-19', 'Matricula ordinaria'),
  (8,  8,  5, DATE '2025-08-19', 'Transferencia de grupo'),
  (9,  9,  1, DATE '2025-08-20', 'Primer ingreso'),
  (10, 10, 1, DATE '2025-08-20', 'Primer ingreso'),
  (11, 11, 6, DATE '2025-08-20', 'Matricula ordinaria'),
  (12, 12, 6, DATE '2025-08-20', 'Matricula ordinaria'),
  (13, 13, 2, DATE '2026-01-12', 'Reingreso'),
  (14, 14, 2, DATE '2026-01-12', 'Reingreso'),
  (15, 15, 3, DATE '2026-01-12', 'Reingreso'),
  (16, 16, 3, DATE '2026-01-12', 'Reingreso'),
  (17, 17, 4, DATE '2026-01-13', 'Beca integral'),
  (18, 18, 4, DATE '2026-01-13', 'Reingreso'),
  (19, 19, 5, DATE '2026-01-13', 'Reingreso'),
  (20, 20, 5, DATE '2026-01-13', 'Reingreso'),
  (21, 21, 2, DATE '2026-01-14', 'Nuevo ingreso'),
  (22, 22, 3, DATE '2026-01-14', 'Nuevo ingreso'),
  (23, 23, 4, DATE '2026-01-14', 'Nuevo ingreso'),
  (24, 24, 5, DATE '2026-01-15', 'Nuevo ingreso'),
  (25, 25, 6, DATE '2026-01-15', 'Nuevo ingreso'),
  (26, 1,  2, DATE '2026-01-12', 'Continuidad 2026'),
  (27, 2,  2, DATE '2026-01-12', 'Continuidad 2026'),
  (28, 3,  3, DATE '2026-01-12', 'Continuidad 2026'),
  (29, 7,  5, DATE '2026-01-13', 'Continuidad 2026'),
  (30, 11, 6, DATE '2026-01-13', 'Continuidad 2026');

-- ---------------------------------------------------------------------------
-- 10. Evaluaciones y notas
--     nota_total es smallint; puntaje va de 0 a nota_total.
--     Las notas se derivan de la matricula -> grupo -> programa -> asignatura
--     -> evaluacion, de modo que solo existen combinaciones validas.
-- -------------------------------------------------------------------------
INSERT INTO evaluaciones (evaluacion_id, asignatura_id, evaluacion_nombre, nota_total) VALUES
  (1,  1,  'Parcial 1',        100),
  (2,  1,  'Parcial 2',        100),
  (3,  1,  'Examen Final',     100),
  (4,  2,  'Ensayo 1',         50),
  (5,  2,  'Examen Final',     100),
  (6,  3,  'Practico Lab',     40),
  (7,  4,  'Trabajo Historico', 60),
  (8,  5,  'Evaluacion Practica', 50),
  (9,  6,  'Practico Final',   50),
  (10, 7,  'Parcial 1',        100),
  (11, 7,  'Examen Final',     100),
  (12, 8,  'Practico Biologia',40),
  (13, 9,  'Parcial 1',        100),
  (14, 10, 'Practico Quimica', 40),
  (15, 11, 'Parcial 1',        100),
  (16, 12, 'Observacion',      30);

INSERT INTO nota (nota_id, evaluacion_id, estudiante_id, puntaje, fecha_registro) VALUES
  ( 1,  1,  1,  57, DATE '2025-09-30'),
  ( 2,  2,  1,  74, DATE '2025-11-15'),
  ( 3,  3,  1,  91, DATE '2025-12-10'),
  ( 4,  4,  1,  31, DATE '2025-09-30'),
  ( 5,  5,  1,  79, DATE '2025-11-15'),
  ( 6,  6,  1,  38, DATE '2025-10-20'),
  ( 7,  1,  2,  88, DATE '2025-09-30'),
  ( 8,  2,  2,  59, DATE '2025-11-15'),
  ( 9,  3,  2,  76, DATE '2025-12-10'),
  (10,  4,  2,  46, DATE '2025-09-30'),
  (11,  5,  2,  64, DATE '2025-11-15'),
  (12,  6,  2,  32, DATE '2025-10-20'),
  (13,  7,  3,  49, DATE '2025-11-05'),
  (14,  8,  3,  50, DATE '2025-11-28'),
  (15,  7,  4,  40, DATE '2025-11-05'),
  (16,  8,  4,  42, DATE '2025-11-28'),
  (17,  9,  5,  43, DATE '2025-12-01'),
  (18,  9,  6,  36, DATE '2025-12-01'),
  (19, 10,  7,  74, DATE '2025-09-25'),
  (20, 11,  7,  91, DATE '2025-11-10'),
  (21, 12,  7,  24, DATE '2025-10-18'),
  (22, 10,  8,  59, DATE '2025-09-25'),
  (23, 11,  8,  76, DATE '2025-11-10'),
  (24, 12,  8,  37, DATE '2025-10-18'),
  (25, 16,  9,  30, DATE '2025-10-10'),
  (26, 16, 10,  25, DATE '2025-10-10'),
  (27, 13, 11,  65, DATE '2025-09-28'),
  (28, 14, 11,  32, DATE '2025-10-22'),
  (29, 15, 11,  99, DATE '2025-09-30'),
  (30, 13, 12,  96, DATE '2025-09-28'),
  (31, 14, 12,  26, DATE '2025-10-22'),
  (32, 15, 12,  84, DATE '2025-09-30'),
  (33,  1, 13,  61, DATE '2025-09-30'),
  (34,  2, 13,  78, DATE '2025-11-15'),
  (35,  3, 13,  95, DATE '2025-12-10'),
  (36,  4, 13,  33, DATE '2025-09-30'),
  (37,  5, 13,  83, DATE '2025-11-15'),
  (38,  6, 13,  40, DATE '2025-10-20'),
  (39,  1, 14,  92, DATE '2025-09-30'),
  (40,  2, 14,  63, DATE '2025-11-15'),
  (41,  3, 14,  80, DATE '2025-12-10'),
  (42,  4, 14,  48, DATE '2025-09-30'),
  (43,  5, 14,  68, DATE '2025-11-15'),
  (44,  6, 14,  34, DATE '2025-10-20'),
  (45,  7, 15,  52, DATE '2025-11-05'),
  (46,  8, 15,  29, DATE '2025-11-28'),
  (47,  7, 16,  43, DATE '2025-11-05'),
  (48,  8, 16,  44, DATE '2025-11-28'),
  (49,  9, 17,  45, DATE '2025-12-01'),
  (50,  9, 18,  38, DATE '2025-12-01'),
  (51, 10, 19,  78, DATE '2025-09-25'),
  (52, 11, 19,  95, DATE '2025-11-10'),
  (53, 12, 19,  26, DATE '2025-10-18'),
  (54, 10, 20,  63, DATE '2025-09-25'),
  (55, 11, 20,  80, DATE '2025-11-10'),
  (56, 12, 20,  38, DATE '2025-10-18'),
  (57,  1, 21,  79, DATE '2025-09-30'),
  (58,  2, 21,  96, DATE '2025-11-15'),
  (59,  3, 21,  67, DATE '2025-12-10'),
  (60,  4, 21,  42, DATE '2025-09-30'),
  (61,  5, 21,  55, DATE '2025-11-15'),
  (62,  6, 21,  28, DATE '2025-10-20'),
  (63,  7, 22,  44, DATE '2025-11-05'),
  (64,  8, 22,  45, DATE '2025-11-28'),
  (65,  9, 23,  46, DATE '2025-12-01'),
  (66, 10, 24,  95, DATE '2025-09-25'),
  (67, 11, 24,  66, DATE '2025-11-10'),
  (68, 12, 24,  33, DATE '2025-10-18'),
  (69, 13, 25,  85, DATE '2025-09-28'),
  (70, 14, 25,  22, DATE '2025-10-22'),
  (71, 15, 25,  73, DATE '2025-09-30'),
  (72,  1,  1,  64, DATE '2026-02-27'),
  (73,  2,  1,  81, DATE '2026-03-25'),
  (74,  3,  1,  98, DATE '2026-03-27'),
  (75,  4,  1,  34, DATE '2026-02-27'),
  (76,  5,  1,  86, DATE '2026-03-25'),
  (77,  6,  1,  22, DATE '2026-03-05'),
  (78,  1,  2,  95, DATE '2026-02-27'),
  (79,  2,  2,  66, DATE '2026-03-25'),
  (80,  3,  2,  83, DATE '2026-03-27'),
  (81,  4,  2,  50, DATE '2026-02-27'),
  (82,  5,  2,  71, DATE '2026-03-25'),
  (83,  6,  2,  35, DATE '2026-03-05'),
  (84,  7,  3,  54, DATE '2026-03-02'),
  (85,  8,  3,  30, DATE '2026-03-20'),
  (86, 10,  7,  81, DATE '2026-02-28'),
  (87, 11,  7,  98, DATE '2026-03-27'),
  (88, 12,  7,  27, DATE '2026-03-10'),
  (89, 13, 11,  72, DATE '2026-02-28'),
  (90, 14, 11,  35, DATE '2026-03-12'),
  (91, 15, 11,  60, DATE '2026-03-01');

-- 11. Servicios y pensiones
-- ---------------------------------------------------------------------------
INSERT INTO servicio_academico (servicio_academico_id, nombre_servicio, descripcion, precio_unitario, estado, servicio_tipo) VALUES
  (1, 'Pension Mensual',    'Pension del periodo lectivo', 12000, true,  'Pension'),
  (2, 'Matricula',         'Pago de matricula anual',     8500, true,  'Matricula'),
  (3, 'Materiales',        'Kit de materiales escolar',    2500, true,  'Material'),
  (4, 'Transporte',        'Servicio de transporte',       1800, true,  'Transporte'),
  (5, 'Almuerzo',           'Servicio de almuerzo',         1500, true,  'Alimentacion'),
  (6, 'Uniforme',           'Uniforme escolar',             3200, true,  'Uniforme'),
  (7, 'Seguro Escolar',     'Seguro de accident',           1100, true,  'Seguro'),
  (8, 'Tutorias',           'Refuerzo academico',           2000, false, 'Tutoria');

INSERT INTO pension_academica (pension_academica_id, matricula_id, servicio_academico_id, monto, descripcion, fecha_vencimiento, estado) VALUES
  (1,  1,  1, 12000, 'Pension primer periodo', DATE '2025-10-05', true),
  (2,  1,  2,  8500, 'Matricula 2025',         DATE '2025-08-30', true),
  (3,  2,  1, 12000, 'Pension primer periodo', DATE '2025-10-05', true),
  (4,  2,  2,  8500, 'Matricula 2025',         DATE '2025-08-30', true),
  (5,  3,  1, 12000, 'Pension primer periodo', DATE '2025-10-05', true),
  (6,  4,  1,  6000, 'Pension becada 50%',     DATE '2025-10-05', true),
  (7,  5,  1, 12000, 'Pension primer periodo', DATE '2025-10-05', true),
  (8,  7,  1, 12000, 'Pension primer periodo', DATE '2025-10-05', false),
  (9,  13, 1, 12000, 'Pension segundo periodo',DATE '2026-02-05', true),
  (10, 17, 1,     0, 'Pension becada integral', DATE '2026-02-05', true),
  (11, 21, 2,  8500, 'Matricula 2026',         DATE '2026-01-31', true),
  (12, 25, 1, 12000, 'Pension segundo periodo',DATE '2026-02-05', true);

-- ---------------------------------------------------------------------------
-- 12. Productos
-- ---------------------------------------------------------------------------
INSERT INTO productos (producto_id, producto_nombre, descripcion, precio_unitario, stock, producto_tip, moneda_id) VALUES
  (1, 'Cuaderno Tapa Dura', 'Cuaderno 100 hojas',      350,  80,  'Papeleria', 1),
  (2, 'Boligrafo Azul',     'Boligrafo punta fina',    25,   300, 'Papeleria', 1),
  (3, 'Estuche 3 Penciles', 'Estuche con tres lapices',75,  120, 'Papeleria', 1),
  (4, 'Mochila Escolar',    'Mochila con_logo',         1850, 40,  'Accesorio', 1),
  (5, 'Caja de Carton',     'Caja de carton archi',     60,   150, 'Papeleria', 1),
  (6, 'Juego Geometrico',   'Regla y compas',           180,  75,  'Accesorio', 1),
  (7, 'Calculadora',        'Calculadora basica',      1250, 25,  'Tecnologia', 2),
  (8, 'Tablet Education',   'Tablet 10 pulgadas',      9500, 6,   'Tecnologia', 2);

-- ---------------------------------------------------------------------------
-- 13. Ordenes de pago, detalle y pagos
--     subtotal/total son columnas GENERATED: nunca se insertan.
--     descuento va en 0..1 (fraccion). Se fija en 0 para no dejar NULL.
-- ---------------------------------------------------------------------------
INSERT INTO orden_pago (orden_pago_id, cliente_id, usuario_id, fecha_emision, fecha_finalizacion) VALUES
  (1, 6,  2, TIMESTAMP '2025-08-20 10:15', DATE '2025-08-20'),
  (2, 7,  2, TIMESTAMP '2025-08-20 10:25', DATE '2025-08-21'),
  (3, 8,  1, TIMESTAMP '2025-08-21 09:10', DATE '2025-08-21'),
  (4, 10, 2, TIMESTAMP '2025-08-21 11:00', NULL),
  (5, 12, 1, TIMESTAMP '2026-01-15 10:00', DATE '2026-01-15'),
  (6, 17, 2, TIMESTAMP '2026-01-16 09:30', NULL),
  (7, 26, 1, TIMESTAMP '2026-01-19 14:00', DATE '2026-01-19'),
  (8, 30, 2, TIMESTAMP '2026-01-20 10:00', DATE '2026-01-20');

INSERT INTO orden_producto (orden_producto_id, orden_pago_id, producto_id, cantidad, precio_unitario, descuento) VALUES
  (1,  1, 1,  3,  350,  0),
  (2,  1, 2,  6,  25,   0),
  (3,  1, 3,  2,  75,   0),
  (4,  2, 1,  2,  350,  0),
  (5,  2, 5,  5,  60,   0),
  (6,  3, 4,  1,  1850, 0.1),
  (7,  3, 7,  1,  1250, 0),
  (8,  5, 1,  3,  350,  0),
  (9,  5, 2,  10, 25,   0),
  (10, 5, 6,  1,  180,  0),
  (11, 7, 1,  4,  350,  0),
  (12, 7, 3,  3,  75,   0),
  (13, 8, 4,  1,  1850, 0),
  (14, 8, 7,  1,  1250, 0.05);

INSERT INTO orden_servicio (orden_servicio_id, orden_pago_id, servicio_academico_id, precio_unitario, descuento) VALUES
  (1,  1, 1, 12000, 0),
  (2,  1, 2,  8500, 0),
  (3,  2, 1, 12000, 0),
  (4,  2, 3,  2500, 0),
  (5,  3, 1, 12000, 0.25),
  (6,  4, 1, 12000, 0),
  (7,  5, 1, 12000, 0),
  (8,  5, 7,  1100, 0),
  (9,  6, 1, 12000, 0.5),
  (10, 7, 2,  8500, 0),
  (11, 8, 1, 12000, 0),
  (12, 8, 4,  1800, 0);

INSERT INTO pagos (pago_id, cliente_id, orden_pago_id, monto_pagado, metodo_pago_id) VALUES
  (1, 6,  1, 23400, 1),
  (2, 7,  2, 15500, 2),
  (3, 8,  3, 10500, 3),
  (4, 12, 5, 14650, 2),
  (5, 17, 6,  6000, 1),
  (6, 26, 7,  8500, 1),
  (7, 30, 8, 14425, 3),
  (8, 10, 4, 12000, 1),
  (9, 26, 7,  2100, 1),
  (10, 12, 5,  1000, 3);

-- ---------------------------------------------------------------------------
-- 14. Sincronizar las 25 secuencias del esquema original
--     Las columnas generadas (subtotal/total) NO son identidades, asi que
--     PostgreSQL no las ajusta solo tras un INSERT con id explicito.
--     Este bloque es idempotente: setval con is_called=false deja la
--     secuencia en el ultimo id usado, de modo el proximo INSERT da id+1.
-- -------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('clientes', 'cliente_id') AS seq,
                 (SELECT max(cliente_id) FROM clientes) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('usuarios', 'usuario_id') AS seq,
                 (SELECT max(usuario_id) FROM usuarios) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('monedas', 'moneda_id') AS seq,
                 (SELECT max(moneda_id) FROM monedas) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('metodo_pago', 'metodo_pago_id') AS seq,
                 (SELECT max(metodo_pago_id) FROM metodo_pago) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('nivel_academico', 'nivel_academico_id') AS seq,
                 (SELECT max(nivel_academico_id) FROM nivel_academico) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('ubicacion_academica', 'ubicacion_academica_id') AS seq,
                 (SELECT max(ubicacion_academica_id) FROM ubicacion_academica) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('periodo_academico', 'periodo_academico_id') AS seq,
                 (SELECT max(periodo_academico_id) FROM periodo_academico) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('grupo_academico', 'grupo_academico_id') AS seq,
                 (SELECT max(grupo_academico_id) FROM grupo_academico) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('programa_academico', 'programa_academico_id') AS seq,
                 (SELECT max(programa_academico_id) FROM programa_academico) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('asignaturas', 'asignatura_id') AS seq,
                 (SELECT max(asignatura_id) FROM asignaturas) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('horario_asignatura', 'horario_asignatura_id') AS seq,
                 (SELECT max(horario_asignatura_id) FROM horario_asignatura) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('empleados', 'empleado_id') AS seq,
                 (SELECT max(empleado_id) FROM empleados) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('docentes', 'empleado_id') AS seq,
                 (SELECT max(empleado_id) FROM docentes) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('secretarias', 'empleado_id') AS seq,
                 (SELECT max(empleado_id) FROM secretarias) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('tutores', 'tutor_id') AS seq,
                 (SELECT max(tutor_id) FROM tutores) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('estudiantes', 'estudiante_id') AS seq,
                 (SELECT max(estudiante_id) FROM estudiantes) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('tutor_estudiante', 'estudiante_id') AS seq,
                 (SELECT max(estudiante_id) FROM tutor_estudiante) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('matriculas', 'matricula_id') AS seq,
                 (SELECT max(matricula_id) FROM matriculas) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('evaluaciones', 'evaluacion_id') AS seq,
                 (SELECT max(evaluacion_id) FROM evaluaciones) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('nota', 'nota_id') AS seq,
                 (SELECT max(nota_id) FROM nota) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('servicio_academico', 'servicio_academico_id') AS seq,
                 (SELECT max(servicio_academico_id) FROM servicio_academico) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('pension_academica', 'pension_academica_id') AS seq,
                 (SELECT max(pension_academica_id) FROM pension_academica) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('productos', 'producto_id') AS seq,
                 (SELECT max(producto_id) FROM productos) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('orden_pago', 'orden_pago_id') AS seq,
                 (SELECT max(orden_pago_id) FROM orden_pago) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('orden_producto', 'orden_producto_id') AS seq,
                 (SELECT max(orden_producto_id) FROM orden_producto) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('orden_servicio', 'orden_servicio_id') AS seq,
                 (SELECT max(orden_servicio_id) FROM orden_servicio) AS max_id) s
   WHERE seq IS NOT NULL;
  PERFORM setval(seq, GREATEST(COALESCE(max_id, 0), 1))
    FROM (SELECT pg_get_serial_sequence('pagos', 'pago_id') AS seq,
                 (SELECT max(pago_id) FROM pagos) AS max_id) s
   WHERE seq IS NOT NULL;
END $$;

COMMIT;