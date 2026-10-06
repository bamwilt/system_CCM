-- ============================================================================
--  CCM - Esquema de la base de datos
--  Generado con pg_dump desde el esquema original (ccm.sql).
--
--  NOTA DE COMPATIBILIDAD
--  El dump original ccm.sql fue generado con PostgreSQL 18. Esta base corre
--  en PostgreSQL 16, por lo que se aplicaron dos correcciones de sintaxis:
--    1. Se elimino 'SET transaction_timeout = 0'  (parametro inexistente en PG16)
--    2. Se agrego el keyword STORED a las 2 columnas generadas
--       (opcional en PG18, obligatorio en PG16)
--  Ninguna de las dos altera la semantica del modelo.
--
--  IMPORTANTE
--  Este archivo NO es el punto de entrada. Usar db/reset-db.sh, que ademas
--  aplica las migraciones y carga los datos de demostracion.
-- ============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-1.pgdg24.04+2)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
\o /dev/null
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
\o

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: asignaturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaturas (
    asignatura_id integer NOT NULL,
    programa_academico_id integer NOT NULL,
    nombre_asignatura character varying(30) NOT NULL,
    codigo smallint NOT NULL,
    horas_semana smallint,
    descripcion character varying(30)
);


--
-- Name: asignaturas_asignatura_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaturas_asignatura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaturas_asignatura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaturas_asignatura_id_seq OWNED BY public.asignaturas.asignatura_id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    cliente_id integer NOT NULL,
    nombre character varying(40) NOT NULL,
    telefono character varying(12),
    email character varying(60),
    cliente_tipo character varying(10)
);


--
-- Name: clientes_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_cliente_id_seq OWNED BY public.clientes.cliente_id;


--
-- Name: docente_asignatura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.docente_asignatura (
    docente_codigo integer NOT NULL,
    asignatura_id integer NOT NULL
);


--
-- Name: docentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.docentes (
    empleado_id integer NOT NULL,
    docente_codigo integer NOT NULL,
    titulo_profesional character varying(50),
    especialidad character varying(50),
    nivel_formacion character varying(50),
    experiencia_docente character varying(20),
    fecha_ingreso date,
    categorioa_docente character varying(50),
    dedicacion character varying(50),
    estado boolean DEFAULT true
);


--
-- Name: docentes_docente_codigo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.docentes_docente_codigo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: docentes_docente_codigo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.docentes_docente_codigo_seq OWNED BY public.docentes.docente_codigo;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    empleado_id integer NOT NULL,
    primer_nombre character varying(20) NOT NULL,
    primer_apellido character varying(20) NOT NULL,
    cedula character varying(30) NOT NULL,
    direccion character varying(30),
    telefono character varying(12),
    email character varying(90),
    fecha_contratacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    salario integer,
    estado boolean DEFAULT true
);


--
-- Name: empleados_empleado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empleados_empleado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empleados_empleado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empleados_empleado_id_seq OWNED BY public.empleados.empleado_id;


--
-- Name: estudiantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estudiantes (
    estudiante_id integer NOT NULL,
    cliente_id integer,
    primer_nombre character varying(20) NOT NULL,
    primer_apellido character varying(20) NOT NULL,
    direccion character varying(90),
    nacimiento date NOT NULL,
    telefono character varying(12),
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estado boolean DEFAULT true
);


--
-- Name: estudiantes_estudiante_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estudiantes_estudiante_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estudiantes_estudiante_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estudiantes_estudiante_id_seq OWNED BY public.estudiantes.estudiante_id;


--
-- Name: evaluaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluaciones (
    evaluacion_id integer NOT NULL,
    asignatura_id integer NOT NULL,
    evaluacion_nombre character varying(30),
    nota_total smallint NOT NULL
);


--
-- Name: evaluaciones_evaluacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluaciones_evaluacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluaciones_evaluacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluaciones_evaluacion_id_seq OWNED BY public.evaluaciones.evaluacion_id;


--
-- Name: grupo_academico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupo_academico (
    grupo_academico_id integer NOT NULL,
    nivel_academico_id integer NOT NULL,
    grupo_nombre character varying(20) NOT NULL,
    turno character varying(30)
);


--
-- Name: grupo_academico_grupo_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grupo_academico_grupo_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grupo_academico_grupo_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grupo_academico_grupo_academico_id_seq OWNED BY public.grupo_academico.grupo_academico_id;


--
-- Name: horario_asignatura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horario_asignatura (
    horario_asignatura_id integer NOT NULL,
    asignatura_id integer NOT NULL,
    ubicacion_academica_id integer NOT NULL,
    hora_inicio time without time zone,
    hora_fin time without time zone,
    aula character varying(20)
);


--
-- Name: horario_asignatura_horario_asignatura_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.horario_asignatura_horario_asignatura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: horario_asignatura_horario_asignatura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.horario_asignatura_horario_asignatura_id_seq OWNED BY public.horario_asignatura.horario_asignatura_id;


--
-- Name: matriculas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matriculas (
    matricula_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    grupo_academico_id integer NOT NULL,
    matricula_fecha date NOT NULL,
    observaciones character varying(30)
);


--
-- Name: matriculas_matricula_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.matriculas_matricula_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matriculas_matricula_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.matriculas_matricula_id_seq OWNED BY public.matriculas.matricula_id;


--
-- Name: metodo_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metodo_pago (
    metodo_pago_id integer NOT NULL,
    nombre_metodo character varying(30),
    descripcion character varying(40)
);


--
-- Name: metodo_pago_metodo_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.metodo_pago_metodo_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: metodo_pago_metodo_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.metodo_pago_metodo_pago_id_seq OWNED BY public.metodo_pago.metodo_pago_id;


--
-- Name: monedas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monedas (
    moneda_id integer NOT NULL,
    nombre_moneda character varying(15),
    simbolo character varying(5),
    tipo_cambio smallint
);


--
-- Name: monedas_modnea_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.monedas_modnea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monedas_modnea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.monedas_modnea_id_seq OWNED BY public.monedas.moneda_id;


--
-- Name: nivel_academico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nivel_academico (
    nivel_academico_id integer NOT NULL,
    nivel_nombre character varying(20) NOT NULL,
    descripcion character varying(30),
    edad_min smallint,
    edad_max smallint
);


--
-- Name: nivel_academico_nivel_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nivel_academico_nivel_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nivel_academico_nivel_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nivel_academico_nivel_academico_id_seq OWNED BY public.nivel_academico.nivel_academico_id;


--
-- Name: nota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nota (
    nota_id integer NOT NULL,
    evaluacion_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    puntaje smallint NOT NULL,
    fecha_registro date
);


--
-- Name: nota_nota_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nota_nota_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nota_nota_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nota_nota_id_seq OWNED BY public.nota.nota_id;


--
-- Name: orden_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_pago (
    orden_pago_id integer NOT NULL,
    cliente_id integer NOT NULL,
    usuario_id integer NOT NULL,
    fecha_emision timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_finalizacion date
);


--
-- Name: orden_pago_orden_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_pago_orden_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_pago_orden_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_pago_orden_pago_id_seq OWNED BY public.orden_pago.orden_pago_id;


--
-- Name: orden_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_producto (
    orden_producto_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    producto_id integer NOT NULL,
    cantidad smallint NOT NULL,
    precio_unitario smallint NOT NULL,
    descuento smallint,
    subtotal smallint GENERATED ALWAYS AS (((cantidad * precio_unitario) * (1 - descuento))) STORED
);


--
-- Name: orden_producto_orden_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_producto_orden_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_producto_orden_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_producto_orden_producto_id_seq OWNED BY public.orden_producto.orden_producto_id;


--
-- Name: orden_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_servicio (
    orden_servicio_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    servicio_academico_id integer NOT NULL,
    precio_unitario smallint NOT NULL,
    descuento smallint,
    total smallint GENERATED ALWAYS AS ((precio_unitario * (1 - descuento))) STORED
);


--
-- Name: orden_servicio_orden_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_servicio_orden_servicio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_servicio_orden_servicio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_servicio_orden_servicio_id_seq OWNED BY public.orden_servicio.orden_servicio_id;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    pago_id integer NOT NULL,
    cliente_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    monto_pagado integer NOT NULL,
    metodo_pago_id integer NOT NULL
);


--
-- Name: pagos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_pago_id_seq OWNED BY public.pagos.pago_id;


--
-- Name: pension_academica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pension_academica (
    pension_academica_id integer NOT NULL,
    matricula_id integer NOT NULL,
    servicio_academico_id integer NOT NULL,
    monto smallint,
    descripcion character varying(30),
    fecha_vencimiento date,
    estado boolean
);


--
-- Name: pension_academica_pension_academica_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pension_academica_pension_academica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pension_academica_pension_academica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pension_academica_pension_academica_id_seq OWNED BY public.pension_academica.pension_academica_id;


--
-- Name: periodo_academico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periodo_academico (
    periodo_academico_id integer NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL
);


--
-- Name: periodo_academico_periodo_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.periodo_academico_periodo_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: periodo_academico_periodo_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.periodo_academico_periodo_academico_id_seq OWNED BY public.periodo_academico.periodo_academico_id;


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    producto_id integer NOT NULL,
    producto_nombre character varying(30),
    descripcion character varying(30),
    precio_unitario smallint,
    stock smallint,
    producto_tip character varying(30),
    moneda_id integer NOT NULL
);


--
-- Name: productos_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.productos_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: productos_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.productos_producto_id_seq OWNED BY public.productos.producto_id;


--
-- Name: programa_academico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programa_academico (
    programa_academico_id integer NOT NULL,
    grupo_academico_id integer NOT NULL,
    periodo_academico_id integer NOT NULL,
    nombre_pograma character varying(30) NOT NULL,
    codigo smallint NOT NULL
);


--
-- Name: programa_academico_programa_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programa_academico_programa_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programa_academico_programa_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programa_academico_programa_academico_id_seq OWNED BY public.programa_academico.programa_academico_id;


--
-- Name: secretarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secretarias (
    empleado_id integer NOT NULL,
    area character varying(30),
    fecha_ingreso date,
    estado boolean DEFAULT true
);


--
-- Name: servicio_academico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicio_academico (
    servicio_academico_id integer NOT NULL,
    nombre_servicio character varying(30) NOT NULL,
    descripcion character varying(30),
    precio_unitario smallint,
    estado boolean,
    servicio_tipo character varying(30)
);


--
-- Name: servicio_academico_servicio_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicio_academico_servicio_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicio_academico_servicio_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicio_academico_servicio_academico_id_seq OWNED BY public.servicio_academico.servicio_academico_id;


--
-- Name: tutor_estudiante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutor_estudiante (
    tutor_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    fecha_asignacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tutores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutores (
    tutor_id integer NOT NULL,
    cliente_id integer,
    primer_nombre character varying(20) NOT NULL,
    primer_apellido character varying(20) NOT NULL,
    direccion character varying(90),
    telefono character varying(12)
);


--
-- Name: tutores_tutor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tutores_tutor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tutores_tutor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tutores_tutor_id_seq OWNED BY public.tutores.tutor_id;


--
-- Name: ubicacion_academica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ubicacion_academica (
    ubicacion_academica_id integer NOT NULL,
    nombre character varying(30),
    capacidad smallint,
    ubicacion_tipo character varying(20),
    estado boolean DEFAULT true
);


--
-- Name: ubicacion_academica_ubicacion_academica_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ubicacion_academica_ubicacion_academica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ubicacion_academica_ubicacion_academica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ubicacion_academica_ubicacion_academica_id_seq OWNED BY public.ubicacion_academica.ubicacion_academica_id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    usuario_id integer NOT NULL,
    nombre character varying(40) NOT NULL
);


--
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_usuario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_usuario_id_seq OWNED BY public.usuarios.usuario_id;


--
-- Name: asignaturas asignatura_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaturas ALTER COLUMN asignatura_id SET DEFAULT nextval('public.asignaturas_asignatura_id_seq'::regclass);


--
-- Name: clientes cliente_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN cliente_id SET DEFAULT nextval('public.clientes_cliente_id_seq'::regclass);


--
-- Name: docentes docente_codigo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes ALTER COLUMN docente_codigo SET DEFAULT nextval('public.docentes_docente_codigo_seq'::regclass);


--
-- Name: empleados empleado_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados ALTER COLUMN empleado_id SET DEFAULT nextval('public.empleados_empleado_id_seq'::regclass);


--
-- Name: estudiantes estudiante_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes ALTER COLUMN estudiante_id SET DEFAULT nextval('public.estudiantes_estudiante_id_seq'::regclass);


--
-- Name: evaluaciones evaluacion_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones ALTER COLUMN evaluacion_id SET DEFAULT nextval('public.evaluaciones_evaluacion_id_seq'::regclass);


--
-- Name: grupo_academico grupo_academico_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_academico ALTER COLUMN grupo_academico_id SET DEFAULT nextval('public.grupo_academico_grupo_academico_id_seq'::regclass);


--
-- Name: horario_asignatura horario_asignatura_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_asignatura ALTER COLUMN horario_asignatura_id SET DEFAULT nextval('public.horario_asignatura_horario_asignatura_id_seq'::regclass);


--
-- Name: matriculas matricula_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matriculas ALTER COLUMN matricula_id SET DEFAULT nextval('public.matriculas_matricula_id_seq'::regclass);


--
-- Name: metodo_pago metodo_pago_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodo_pago ALTER COLUMN metodo_pago_id SET DEFAULT nextval('public.metodo_pago_metodo_pago_id_seq'::regclass);


--
-- Name: monedas moneda_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monedas ALTER COLUMN moneda_id SET DEFAULT nextval('public.monedas_modnea_id_seq'::regclass);


--
-- Name: nivel_academico nivel_academico_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nivel_academico ALTER COLUMN nivel_academico_id SET DEFAULT nextval('public.nivel_academico_nivel_academico_id_seq'::regclass);


--
-- Name: nota nota_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota ALTER COLUMN nota_id SET DEFAULT nextval('public.nota_nota_id_seq'::regclass);


--
-- Name: orden_pago orden_pago_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_pago ALTER COLUMN orden_pago_id SET DEFAULT nextval('public.orden_pago_orden_pago_id_seq'::regclass);


--
-- Name: orden_producto orden_producto_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_producto ALTER COLUMN orden_producto_id SET DEFAULT nextval('public.orden_producto_orden_producto_id_seq'::regclass);


--
-- Name: orden_servicio orden_servicio_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio ALTER COLUMN orden_servicio_id SET DEFAULT nextval('public.orden_servicio_orden_servicio_id_seq'::regclass);


--
-- Name: pagos pago_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_pago_id_seq'::regclass);


--
-- Name: pension_academica pension_academica_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pension_academica ALTER COLUMN pension_academica_id SET DEFAULT nextval('public.pension_academica_pension_academica_id_seq'::regclass);


--
-- Name: periodo_academico periodo_academico_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodo_academico ALTER COLUMN periodo_academico_id SET DEFAULT nextval('public.periodo_academico_periodo_academico_id_seq'::regclass);


--
-- Name: productos producto_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos ALTER COLUMN producto_id SET DEFAULT nextval('public.productos_producto_id_seq'::regclass);


--
-- Name: programa_academico programa_academico_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_academico ALTER COLUMN programa_academico_id SET DEFAULT nextval('public.programa_academico_programa_academico_id_seq'::regclass);


--
-- Name: servicio_academico servicio_academico_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_academico ALTER COLUMN servicio_academico_id SET DEFAULT nextval('public.servicio_academico_servicio_academico_id_seq'::regclass);


--
-- Name: tutores tutor_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutores ALTER COLUMN tutor_id SET DEFAULT nextval('public.tutores_tutor_id_seq'::regclass);


--
-- Name: ubicacion_academica ubicacion_academica_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicacion_academica ALTER COLUMN ubicacion_academica_id SET DEFAULT nextval('public.ubicacion_academica_ubicacion_academica_id_seq'::regclass);


--
-- Name: usuarios usuario_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN usuario_id SET DEFAULT nextval('public.usuarios_usuario_id_seq'::regclass);


--
-- Name: asignaturas asignaturas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_codigo_key UNIQUE (codigo);


--
-- Name: asignaturas asignaturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_pkey PRIMARY KEY (asignatura_id);


--
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (cliente_id);


--
-- Name: docente_asignatura docente_asignatura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_pkey PRIMARY KEY (docente_codigo, asignatura_id);


--
-- Name: docentes docente_codigo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docente_codigo UNIQUE (docente_codigo);


--
-- Name: empleados empleados_cedula_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_cedula_key UNIQUE (cedula);


--
-- Name: empleados empleados_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_email_key UNIQUE (email);


--
-- Name: empleados empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_pkey PRIMARY KEY (empleado_id);


--
-- Name: estudiantes estudiantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_pkey PRIMARY KEY (estudiante_id);


--
-- Name: evaluaciones evaluaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_pkey PRIMARY KEY (evaluacion_id);


--
-- Name: grupo_academico grupo_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_academico
    ADD CONSTRAINT grupo_academico_pkey PRIMARY KEY (grupo_academico_id);


--
-- Name: horario_asignatura horario_asignatura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_pkey PRIMARY KEY (horario_asignatura_id);


--
-- Name: matriculas matriculas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_pkey PRIMARY KEY (matricula_id);


--
-- Name: metodo_pago metodo_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodo_pago
    ADD CONSTRAINT metodo_pago_pkey PRIMARY KEY (metodo_pago_id);


--
-- Name: monedas monedas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monedas
    ADD CONSTRAINT monedas_pkey PRIMARY KEY (moneda_id);


--
-- Name: nivel_academico nivel_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nivel_academico
    ADD CONSTRAINT nivel_academico_pkey PRIMARY KEY (nivel_academico_id);


--
-- Name: nota nota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_pkey PRIMARY KEY (nota_id);


--
-- Name: orden_pago orden_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_pkey PRIMARY KEY (orden_pago_id);


--
-- Name: orden_producto orden_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_pkey PRIMARY KEY (orden_producto_id);


--
-- Name: orden_servicio orden_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_pkey PRIMARY KEY (orden_servicio_id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (pago_id);


--
-- Name: pension_academica pension_academica_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_pkey PRIMARY KEY (pension_academica_id);


--
-- Name: periodo_academico periodo_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodo_academico
    ADD CONSTRAINT periodo_academico_pkey PRIMARY KEY (periodo_academico_id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (producto_id);


--
-- Name: programa_academico programa_academico_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_codigo_key UNIQUE (codigo);


--
-- Name: programa_academico programa_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_pkey PRIMARY KEY (programa_academico_id);


--
-- Name: servicio_academico servicio_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_academico
    ADD CONSTRAINT servicio_academico_pkey PRIMARY KEY (servicio_academico_id);


--
-- Name: tutor_estudiante tutor_estudiante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_pkey PRIMARY KEY (tutor_id, estudiante_id);


--
-- Name: tutores tutores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutores
    ADD CONSTRAINT tutores_pkey PRIMARY KEY (tutor_id);


--
-- Name: ubicacion_academica ubicacion_academica_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicacion_academica
    ADD CONSTRAINT ubicacion_academica_pkey PRIMARY KEY (ubicacion_academica_id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (usuario_id);


--
-- Name: asignaturas asignaturas_programa_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_programa_academico_id_fkey FOREIGN KEY (programa_academico_id) REFERENCES public.programa_academico(programa_academico_id) ON DELETE CASCADE;


--
-- Name: docente_asignatura docente_asignatura_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- Name: docente_asignatura docente_asignatura_docente_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_docente_codigo_fkey FOREIGN KEY (docente_codigo) REFERENCES public.docentes(docente_codigo) ON DELETE CASCADE;


--
-- Name: docentes docentes_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(empleado_id) ON DELETE CASCADE;


--
-- Name: estudiantes estudiantes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- Name: evaluaciones evaluaciones_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- Name: grupo_academico grupo_academico_nivel_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_academico
    ADD CONSTRAINT grupo_academico_nivel_academico_id_fkey FOREIGN KEY (nivel_academico_id) REFERENCES public.nivel_academico(nivel_academico_id) ON DELETE CASCADE;


--
-- Name: horario_asignatura horario_asignatura_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- Name: horario_asignatura horario_asignatura_ubicacion_academica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_ubicacion_academica_id_fkey FOREIGN KEY (ubicacion_academica_id) REFERENCES public.ubicacion_academica(ubicacion_academica_id) ON DELETE CASCADE;


--
-- Name: matriculas matriculas_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- Name: matriculas matriculas_grupo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_grupo_academico_id_fkey FOREIGN KEY (grupo_academico_id) REFERENCES public.grupo_academico(grupo_academico_id) ON DELETE CASCADE;


--
-- Name: nota nota_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- Name: nota nota_evaluacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_evaluacion_id_fkey FOREIGN KEY (evaluacion_id) REFERENCES public.evaluaciones(evaluacion_id) ON DELETE CASCADE;


--
-- Name: orden_pago orden_pago_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- Name: orden_pago orden_pago_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id) ON DELETE CASCADE;


--
-- Name: orden_producto orden_producto_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- Name: orden_producto orden_producto_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id) ON DELETE CASCADE;


--
-- Name: orden_servicio orden_servicio_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- Name: orden_servicio orden_servicio_servicio_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_servicio_academico_id_fkey FOREIGN KEY (servicio_academico_id) REFERENCES public.servicio_academico(servicio_academico_id) ON DELETE CASCADE;


--
-- Name: pagos pagos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- Name: pagos pagos_metodo_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_metodo_pago_id_fkey FOREIGN KEY (metodo_pago_id) REFERENCES public.metodo_pago(metodo_pago_id) ON DELETE CASCADE;


--
-- Name: pagos pagos_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- Name: pension_academica pension_academica_matricula_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES public.matriculas(matricula_id) ON DELETE CASCADE;


--
-- Name: pension_academica pension_academica_servicio_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_servicio_academico_id_fkey FOREIGN KEY (servicio_academico_id) REFERENCES public.servicio_academico(servicio_academico_id) ON DELETE CASCADE;


--
-- Name: productos productos_moneda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_moneda_id_fkey FOREIGN KEY (moneda_id) REFERENCES public.monedas(moneda_id) ON DELETE CASCADE;


--
-- Name: programa_academico programa_academico_grupo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_grupo_academico_id_fkey FOREIGN KEY (grupo_academico_id) REFERENCES public.grupo_academico(grupo_academico_id) ON DELETE CASCADE;


--
-- Name: programa_academico programa_academico_periodo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_periodo_academico_id_fkey FOREIGN KEY (periodo_academico_id) REFERENCES public.periodo_academico(periodo_academico_id) ON DELETE CASCADE;


--
-- Name: secretarias secretarias_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretarias
    ADD CONSTRAINT secretarias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(empleado_id) ON DELETE CASCADE;


--
-- Name: tutor_estudiante tutor_estudiante_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- Name: tutor_estudiante tutor_estudiante_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.tutores(tutor_id) ON DELETE CASCADE;


--
-- Name: tutores tutores_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutores
    ADD CONSTRAINT tutores_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


