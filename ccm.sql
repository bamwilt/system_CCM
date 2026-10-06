--
-- PostgreSQL database dump
--

\restrict rP0rHqAxNg3YfiT0WlOOzWAgs91ufHOR9cKfBT7XfmCsmrMgTUAAIBKkELY5hai

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

-- Started on 2025-11-05 00:22:55

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 257 (class 1259 OID 24922)
-- Name: asignaturas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asignaturas (
    asignatura_id integer NOT NULL,
    programa_academico_id integer NOT NULL,
    nombre_asignatura character varying(30) NOT NULL,
    codigo smallint NOT NULL,
    horas_semana smallint,
    descripcion character varying(30)
);


ALTER TABLE public.asignaturas OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 24921)
-- Name: asignaturas_asignatura_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.asignaturas_asignatura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.asignaturas_asignatura_id_seq OWNER TO postgres;

--
-- TOC entry 5324 (class 0 OID 0)
-- Dependencies: 256
-- Name: asignaturas_asignatura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.asignaturas_asignatura_id_seq OWNED BY public.asignaturas.asignatura_id;


--
-- TOC entry 220 (class 1259 OID 24578)
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clientes (
    cliente_id integer NOT NULL,
    nombre character varying(40) NOT NULL,
    telefono character varying(12),
    email character varying(60),
    cliente_tipo character varying(10)
);


ALTER TABLE public.clientes OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 24577)
-- Name: clientes_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clientes_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clientes_cliente_id_seq OWNER TO postgres;

--
-- TOC entry 5325 (class 0 OID 0)
-- Dependencies: 219
-- Name: clientes_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clientes_cliente_id_seq OWNED BY public.clientes.cliente_id;


--
-- TOC entry 271 (class 1259 OID 25059)
-- Name: docente_asignatura; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.docente_asignatura (
    docente_codigo integer NOT NULL,
    asignatura_id integer NOT NULL
);


ALTER TABLE public.docente_asignatura OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 25023)
-- Name: docentes; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.docentes OWNER TO postgres;

--
-- TOC entry 268 (class 1259 OID 25022)
-- Name: docentes_docente_codigo_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.docentes_docente_codigo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.docentes_docente_codigo_seq OWNER TO postgres;

--
-- TOC entry 5326 (class 0 OID 0)
-- Dependencies: 268
-- Name: docentes_docente_codigo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.docentes_docente_codigo_seq OWNED BY public.docentes.docente_codigo;


--
-- TOC entry 267 (class 1259 OID 25006)
-- Name: empleados; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.empleados OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 25005)
-- Name: empleados_empleado_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.empleados_empleado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.empleados_empleado_id_seq OWNER TO postgres;

--
-- TOC entry 5327 (class 0 OID 0)
-- Dependencies: 266
-- Name: empleados_empleado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.empleados_empleado_id_seq OWNED BY public.empleados.empleado_id;


--
-- TOC entry 222 (class 1259 OID 24589)
-- Name: estudiantes; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.estudiantes OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 24588)
-- Name: estudiantes_estudiante_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.estudiantes_estudiante_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estudiantes_estudiante_id_seq OWNER TO postgres;

--
-- TOC entry 5328 (class 0 OID 0)
-- Dependencies: 221
-- Name: estudiantes_estudiante_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estudiantes_estudiante_id_seq OWNED BY public.estudiantes.estudiante_id;


--
-- TOC entry 259 (class 1259 OID 24941)
-- Name: evaluaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.evaluaciones (
    evaluacion_id integer NOT NULL,
    asignatura_id integer NOT NULL,
    evaluacion_nombre character varying(30),
    nota_total smallint NOT NULL
);


ALTER TABLE public.evaluaciones OWNER TO postgres;

--
-- TOC entry 258 (class 1259 OID 24940)
-- Name: evaluaciones_evaluacion_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.evaluaciones_evaluacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.evaluaciones_evaluacion_id_seq OWNER TO postgres;

--
-- TOC entry 5329 (class 0 OID 0)
-- Dependencies: 258
-- Name: evaluaciones_evaluacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.evaluaciones_evaluacion_id_seq OWNED BY public.evaluaciones.evaluacion_id;


--
-- TOC entry 243 (class 1259 OID 24801)
-- Name: grupo_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grupo_academico (
    grupo_academico_id integer NOT NULL,
    nivel_academico_id integer NOT NULL,
    grupo_nombre character varying(20) NOT NULL,
    turno character varying(30)
);


ALTER TABLE public.grupo_academico OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 24800)
-- Name: grupo_academico_grupo_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.grupo_academico_grupo_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.grupo_academico_grupo_academico_id_seq OWNER TO postgres;

--
-- TOC entry 5330 (class 0 OID 0)
-- Dependencies: 242
-- Name: grupo_academico_grupo_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.grupo_academico_grupo_academico_id_seq OWNED BY public.grupo_academico.grupo_academico_id;


--
-- TOC entry 265 (class 1259 OID 24986)
-- Name: horario_asignatura; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.horario_asignatura (
    horario_asignatura_id integer NOT NULL,
    asignatura_id integer NOT NULL,
    ubicacion_academica_id integer NOT NULL,
    hora_inicio time without time zone,
    hora_fin time without time zone,
    aula character varying(20)
);


ALTER TABLE public.horario_asignatura OWNER TO postgres;

--
-- TOC entry 264 (class 1259 OID 24985)
-- Name: horario_asignatura_horario_asignatura_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.horario_asignatura_horario_asignatura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.horario_asignatura_horario_asignatura_id_seq OWNER TO postgres;

--
-- TOC entry 5331 (class 0 OID 0)
-- Dependencies: 264
-- Name: horario_asignatura_horario_asignatura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.horario_asignatura_horario_asignatura_id_seq OWNED BY public.horario_asignatura.horario_asignatura_id;


--
-- TOC entry 245 (class 1259 OID 24816)
-- Name: matriculas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matriculas (
    matricula_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    grupo_academico_id integer NOT NULL,
    matricula_fecha date NOT NULL,
    observaciones character varying(30)
);


ALTER TABLE public.matriculas OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 24815)
-- Name: matriculas_matricula_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matriculas_matricula_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matriculas_matricula_id_seq OWNER TO postgres;

--
-- TOC entry 5332 (class 0 OID 0)
-- Dependencies: 244
-- Name: matriculas_matricula_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matriculas_matricula_id_seq OWNED BY public.matriculas.matricula_id;


--
-- TOC entry 231 (class 1259 OID 24685)
-- Name: metodo_pago; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.metodo_pago (
    metodo_pago_id integer NOT NULL,
    nombre_metodo character varying(30),
    descripcion character varying(40)
);


ALTER TABLE public.metodo_pago OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 24684)
-- Name: metodo_pago_metodo_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.metodo_pago_metodo_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.metodo_pago_metodo_pago_id_seq OWNER TO postgres;

--
-- TOC entry 5333 (class 0 OID 0)
-- Dependencies: 230
-- Name: metodo_pago_metodo_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.metodo_pago_metodo_pago_id_seq OWNED BY public.metodo_pago.metodo_pago_id;


--
-- TOC entry 233 (class 1259 OID 24693)
-- Name: monedas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.monedas (
    moneda_id integer CONSTRAINT monedas_modnea_id_not_null NOT NULL,
    nombre_moneda character varying(15),
    simbolo character varying(5),
    tipo_cambio smallint
);


ALTER TABLE public.monedas OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 24692)
-- Name: monedas_modnea_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.monedas_modnea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.monedas_modnea_id_seq OWNER TO postgres;

--
-- TOC entry 5334 (class 0 OID 0)
-- Dependencies: 232
-- Name: monedas_modnea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.monedas_modnea_id_seq OWNED BY public.monedas.moneda_id;


--
-- TOC entry 241 (class 1259 OID 24792)
-- Name: nivel_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nivel_academico (
    nivel_academico_id integer NOT NULL,
    nivel_nombre character varying(20) NOT NULL,
    descripcion character varying(30),
    edad_min smallint,
    edad_max smallint
);


ALTER TABLE public.nivel_academico OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 24791)
-- Name: nivel_academico_nivel_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.nivel_academico_nivel_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nivel_academico_nivel_academico_id_seq OWNER TO postgres;

--
-- TOC entry 5335 (class 0 OID 0)
-- Dependencies: 240
-- Name: nivel_academico_nivel_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.nivel_academico_nivel_academico_id_seq OWNED BY public.nivel_academico.nivel_academico_id;


--
-- TOC entry 261 (class 1259 OID 24956)
-- Name: nota; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nota (
    nota_id integer NOT NULL,
    evaluacion_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    puntaje smallint NOT NULL,
    fecha_registro date
);


ALTER TABLE public.nota OWNER TO postgres;

--
-- TOC entry 260 (class 1259 OID 24955)
-- Name: nota_nota_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.nota_nota_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nota_nota_id_seq OWNER TO postgres;

--
-- TOC entry 5336 (class 0 OID 0)
-- Dependencies: 260
-- Name: nota_nota_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.nota_nota_id_seq OWNED BY public.nota.nota_id;


--
-- TOC entry 229 (class 1259 OID 24664)
-- Name: orden_pago; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orden_pago (
    orden_pago_id integer NOT NULL,
    cliente_id integer NOT NULL,
    usuario_id integer NOT NULL,
    fecha_emision timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_finalizacion date
);


ALTER TABLE public.orden_pago OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 24663)
-- Name: orden_pago_orden_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orden_pago_orden_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orden_pago_orden_pago_id_seq OWNER TO postgres;

--
-- TOC entry 5337 (class 0 OID 0)
-- Dependencies: 228
-- Name: orden_pago_orden_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orden_pago_orden_pago_id_seq OWNED BY public.orden_pago.orden_pago_id;


--
-- TOC entry 239 (class 1259 OID 24769)
-- Name: orden_producto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orden_producto (
    orden_producto_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    producto_id integer NOT NULL,
    cantidad smallint NOT NULL,
    precio_unitario smallint NOT NULL,
    descuento smallint,
    subtotal smallint GENERATED ALWAYS AS (((cantidad * precio_unitario) * (1 - descuento)))
);


ALTER TABLE public.orden_producto OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 24768)
-- Name: orden_producto_orden_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orden_producto_orden_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orden_producto_orden_producto_id_seq OWNER TO postgres;

--
-- TOC entry 5338 (class 0 OID 0)
-- Dependencies: 238
-- Name: orden_producto_orden_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orden_producto_orden_producto_id_seq OWNED BY public.orden_producto.orden_producto_id;


--
-- TOC entry 251 (class 1259 OID 24866)
-- Name: orden_servicio; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orden_servicio (
    orden_servicio_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    servicio_academico_id integer NOT NULL,
    precio_unitario smallint NOT NULL,
    descuento smallint,
    total smallint GENERATED ALWAYS AS ((precio_unitario * (1 - descuento)))
);


ALTER TABLE public.orden_servicio OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 24865)
-- Name: orden_servicio_orden_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orden_servicio_orden_servicio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orden_servicio_orden_servicio_id_seq OWNER TO postgres;

--
-- TOC entry 5339 (class 0 OID 0)
-- Dependencies: 250
-- Name: orden_servicio_orden_servicio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orden_servicio_orden_servicio_id_seq OWNED BY public.orden_servicio.orden_servicio_id;


--
-- TOC entry 235 (class 1259 OID 24701)
-- Name: pagos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagos (
    pago_id integer NOT NULL,
    cliente_id integer NOT NULL,
    orden_pago_id integer NOT NULL,
    monto_pagado integer NOT NULL,
    metodo_pago_id integer NOT NULL
);


ALTER TABLE public.pagos OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 24700)
-- Name: pagos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagos_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagos_pago_id_seq OWNER TO postgres;

--
-- TOC entry 5340 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagos_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagos_pago_id_seq OWNED BY public.pagos.pago_id;


--
-- TOC entry 249 (class 1259 OID 24846)
-- Name: pension_academica; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.pension_academica OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 24845)
-- Name: pension_academica_pension_academica_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pension_academica_pension_academica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pension_academica_pension_academica_id_seq OWNER TO postgres;

--
-- TOC entry 5341 (class 0 OID 0)
-- Dependencies: 248
-- Name: pension_academica_pension_academica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pension_academica_pension_academica_id_seq OWNED BY public.pension_academica.pension_academica_id;


--
-- TOC entry 253 (class 1259 OID 24888)
-- Name: periodo_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodo_academico (
    periodo_academico_id integer NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL
);


ALTER TABLE public.periodo_academico OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 24887)
-- Name: periodo_academico_periodo_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.periodo_academico_periodo_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.periodo_academico_periodo_academico_id_seq OWNER TO postgres;

--
-- TOC entry 5342 (class 0 OID 0)
-- Dependencies: 252
-- Name: periodo_academico_periodo_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.periodo_academico_periodo_academico_id_seq OWNED BY public.periodo_academico.periodo_academico_id;


--
-- TOC entry 237 (class 1259 OID 24737)
-- Name: productos; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.productos OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 24736)
-- Name: productos_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.productos_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_producto_id_seq OWNER TO postgres;

--
-- TOC entry 5343 (class 0 OID 0)
-- Dependencies: 236
-- Name: productos_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.productos_producto_id_seq OWNED BY public.productos.producto_id;


--
-- TOC entry 255 (class 1259 OID 24898)
-- Name: programa_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.programa_academico (
    programa_academico_id integer NOT NULL,
    grupo_academico_id integer NOT NULL,
    periodo_academico_id integer NOT NULL,
    nombre_pograma character varying(30) NOT NULL,
    codigo smallint NOT NULL
);


ALTER TABLE public.programa_academico OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 24897)
-- Name: programa_academico_programa_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.programa_academico_programa_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.programa_academico_programa_academico_id_seq OWNER TO postgres;

--
-- TOC entry 5344 (class 0 OID 0)
-- Dependencies: 254
-- Name: programa_academico_programa_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.programa_academico_programa_academico_id_seq OWNED BY public.programa_academico.programa_academico_id;


--
-- TOC entry 270 (class 1259 OID 25035)
-- Name: secretarias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.secretarias (
    empleado_id integer NOT NULL,
    area character varying(30),
    fecha_ingreso date,
    estado boolean DEFAULT true
);


ALTER TABLE public.secretarias OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 24837)
-- Name: servicio_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.servicio_academico (
    servicio_academico_id integer NOT NULL,
    nombre_servicio character varying(30) NOT NULL,
    descripcion character varying(30),
    precio_unitario smallint,
    estado boolean,
    servicio_tipo character varying(30)
);


ALTER TABLE public.servicio_academico OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 24836)
-- Name: servicio_academico_servicio_academico_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.servicio_academico_servicio_academico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.servicio_academico_servicio_academico_id_seq OWNER TO postgres;

--
-- TOC entry 5345 (class 0 OID 0)
-- Dependencies: 246
-- Name: servicio_academico_servicio_academico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.servicio_academico_servicio_academico_id_seq OWNED BY public.servicio_academico.servicio_academico_id;


--
-- TOC entry 225 (class 1259 OID 24621)
-- Name: tutor_estudiante; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tutor_estudiante (
    tutor_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    fecha_asignacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tutor_estudiante OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 24607)
-- Name: tutores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tutores (
    tutor_id integer NOT NULL,
    cliente_id integer,
    primer_nombre character varying(20) NOT NULL,
    primer_apellido character varying(20) NOT NULL,
    direccion character varying(90),
    telefono character varying(12)
);


ALTER TABLE public.tutores OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 24606)
-- Name: tutores_tutor_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tutores_tutor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tutores_tutor_id_seq OWNER TO postgres;

--
-- TOC entry 5346 (class 0 OID 0)
-- Dependencies: 223
-- Name: tutores_tutor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tutores_tutor_id_seq OWNED BY public.tutores.tutor_id;


--
-- TOC entry 263 (class 1259 OID 24977)
-- Name: ubicacion_academica; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ubicacion_academica (
    ubicacion_academica_id integer NOT NULL,
    nombre character varying(30),
    capacidad smallint,
    ubicacion_tipo character varying(20),
    estado boolean DEFAULT true
);


ALTER TABLE public.ubicacion_academica OWNER TO postgres;

--
-- TOC entry 262 (class 1259 OID 24976)
-- Name: ubicacion_academica_ubicacion_academica_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ubicacion_academica_ubicacion_academica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ubicacion_academica_ubicacion_academica_id_seq OWNER TO postgres;

--
-- TOC entry 5347 (class 0 OID 0)
-- Dependencies: 262
-- Name: ubicacion_academica_ubicacion_academica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ubicacion_academica_ubicacion_academica_id_seq OWNED BY public.ubicacion_academica.ubicacion_academica_id;


--
-- TOC entry 227 (class 1259 OID 24640)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    usuario_id integer NOT NULL,
    nombre character varying(40) NOT NULL
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 24639)
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_usuario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_usuario_id_seq OWNER TO postgres;

--
-- TOC entry 5348 (class 0 OID 0)
-- Dependencies: 226
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_usuario_id_seq OWNED BY public.usuarios.usuario_id;


--
-- TOC entry 5012 (class 2604 OID 24925)
-- Name: asignaturas asignatura_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaturas ALTER COLUMN asignatura_id SET DEFAULT nextval('public.asignaturas_asignatura_id_seq'::regclass);


--
-- TOC entry 4988 (class 2604 OID 24581)
-- Name: clientes cliente_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes ALTER COLUMN cliente_id SET DEFAULT nextval('public.clientes_cliente_id_seq'::regclass);


--
-- TOC entry 5021 (class 2604 OID 25026)
-- Name: docentes docente_codigo; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes ALTER COLUMN docente_codigo SET DEFAULT nextval('public.docentes_docente_codigo_seq'::regclass);


--
-- TOC entry 5018 (class 2604 OID 25009)
-- Name: empleados empleado_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empleados ALTER COLUMN empleado_id SET DEFAULT nextval('public.empleados_empleado_id_seq'::regclass);


--
-- TOC entry 4989 (class 2604 OID 24592)
-- Name: estudiantes estudiante_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes ALTER COLUMN estudiante_id SET DEFAULT nextval('public.estudiantes_estudiante_id_seq'::regclass);


--
-- TOC entry 5013 (class 2604 OID 24944)
-- Name: evaluaciones evaluacion_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluaciones ALTER COLUMN evaluacion_id SET DEFAULT nextval('public.evaluaciones_evaluacion_id_seq'::regclass);


--
-- TOC entry 5004 (class 2604 OID 24804)
-- Name: grupo_academico grupo_academico_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupo_academico ALTER COLUMN grupo_academico_id SET DEFAULT nextval('public.grupo_academico_grupo_academico_id_seq'::regclass);


--
-- TOC entry 5017 (class 2604 OID 24989)
-- Name: horario_asignatura horario_asignatura_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horario_asignatura ALTER COLUMN horario_asignatura_id SET DEFAULT nextval('public.horario_asignatura_horario_asignatura_id_seq'::regclass);


--
-- TOC entry 5005 (class 2604 OID 24819)
-- Name: matriculas matricula_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matriculas ALTER COLUMN matricula_id SET DEFAULT nextval('public.matriculas_matricula_id_seq'::regclass);


--
-- TOC entry 4997 (class 2604 OID 24688)
-- Name: metodo_pago metodo_pago_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metodo_pago ALTER COLUMN metodo_pago_id SET DEFAULT nextval('public.metodo_pago_metodo_pago_id_seq'::regclass);


--
-- TOC entry 4998 (class 2604 OID 24696)
-- Name: monedas moneda_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monedas ALTER COLUMN moneda_id SET DEFAULT nextval('public.monedas_modnea_id_seq'::regclass);


--
-- TOC entry 5003 (class 2604 OID 24795)
-- Name: nivel_academico nivel_academico_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nivel_academico ALTER COLUMN nivel_academico_id SET DEFAULT nextval('public.nivel_academico_nivel_academico_id_seq'::regclass);


--
-- TOC entry 5014 (class 2604 OID 24959)
-- Name: nota nota_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nota ALTER COLUMN nota_id SET DEFAULT nextval('public.nota_nota_id_seq'::regclass);


--
-- TOC entry 4995 (class 2604 OID 24667)
-- Name: orden_pago orden_pago_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_pago ALTER COLUMN orden_pago_id SET DEFAULT nextval('public.orden_pago_orden_pago_id_seq'::regclass);


--
-- TOC entry 5001 (class 2604 OID 24772)
-- Name: orden_producto orden_producto_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_producto ALTER COLUMN orden_producto_id SET DEFAULT nextval('public.orden_producto_orden_producto_id_seq'::regclass);


--
-- TOC entry 5008 (class 2604 OID 24869)
-- Name: orden_servicio orden_servicio_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_servicio ALTER COLUMN orden_servicio_id SET DEFAULT nextval('public.orden_servicio_orden_servicio_id_seq'::regclass);


--
-- TOC entry 4999 (class 2604 OID 24704)
-- Name: pagos pago_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_pago_id_seq'::regclass);


--
-- TOC entry 5007 (class 2604 OID 24849)
-- Name: pension_academica pension_academica_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pension_academica ALTER COLUMN pension_academica_id SET DEFAULT nextval('public.pension_academica_pension_academica_id_seq'::regclass);


--
-- TOC entry 5010 (class 2604 OID 24891)
-- Name: periodo_academico periodo_academico_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_academico ALTER COLUMN periodo_academico_id SET DEFAULT nextval('public.periodo_academico_periodo_academico_id_seq'::regclass);


--
-- TOC entry 5000 (class 2604 OID 24740)
-- Name: productos producto_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos ALTER COLUMN producto_id SET DEFAULT nextval('public.productos_producto_id_seq'::regclass);


--
-- TOC entry 5011 (class 2604 OID 24901)
-- Name: programa_academico programa_academico_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.programa_academico ALTER COLUMN programa_academico_id SET DEFAULT nextval('public.programa_academico_programa_academico_id_seq'::regclass);


--
-- TOC entry 5006 (class 2604 OID 24840)
-- Name: servicio_academico servicio_academico_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servicio_academico ALTER COLUMN servicio_academico_id SET DEFAULT nextval('public.servicio_academico_servicio_academico_id_seq'::regclass);


--
-- TOC entry 4992 (class 2604 OID 24610)
-- Name: tutores tutor_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutores ALTER COLUMN tutor_id SET DEFAULT nextval('public.tutores_tutor_id_seq'::regclass);


--
-- TOC entry 5015 (class 2604 OID 24980)
-- Name: ubicacion_academica ubicacion_academica_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ubicacion_academica ALTER COLUMN ubicacion_academica_id SET DEFAULT nextval('public.ubicacion_academica_ubicacion_academica_id_seq'::regclass);


--
-- TOC entry 4994 (class 2604 OID 24643)
-- Name: usuarios usuario_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN usuario_id SET DEFAULT nextval('public.usuarios_usuario_id_seq'::regclass);


--
-- TOC entry 5304 (class 0 OID 24922)
-- Dependencies: 257
-- Data for Name: asignaturas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.asignaturas (asignatura_id, programa_academico_id, nombre_asignatura, codigo, horas_semana, descripcion) FROM stdin;
\.


--
-- TOC entry 5267 (class 0 OID 24578)
-- Dependencies: 220
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clientes (cliente_id, nombre, telefono, email, cliente_tipo) FROM stdin;
\.


--
-- TOC entry 5318 (class 0 OID 25059)
-- Dependencies: 271
-- Data for Name: docente_asignatura; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.docente_asignatura (docente_codigo, asignatura_id) FROM stdin;
\.


--
-- TOC entry 5316 (class 0 OID 25023)
-- Dependencies: 269
-- Data for Name: docentes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.docentes (empleado_id, docente_codigo, titulo_profesional, especialidad, nivel_formacion, experiencia_docente, fecha_ingreso, categorioa_docente, dedicacion, estado) FROM stdin;
\.


--
-- TOC entry 5314 (class 0 OID 25006)
-- Dependencies: 267
-- Data for Name: empleados; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.empleados (empleado_id, primer_nombre, primer_apellido, cedula, direccion, telefono, email, fecha_contratacion, salario, estado) FROM stdin;
\.


--
-- TOC entry 5269 (class 0 OID 24589)
-- Dependencies: 222
-- Data for Name: estudiantes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estudiantes (estudiante_id, cliente_id, primer_nombre, primer_apellido, direccion, nacimiento, telefono, fecha_registro, estado) FROM stdin;
\.


--
-- TOC entry 5306 (class 0 OID 24941)
-- Dependencies: 259
-- Data for Name: evaluaciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.evaluaciones (evaluacion_id, asignatura_id, evaluacion_nombre, nota_total) FROM stdin;
\.


--
-- TOC entry 5290 (class 0 OID 24801)
-- Dependencies: 243
-- Data for Name: grupo_academico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.grupo_academico (grupo_academico_id, nivel_academico_id, grupo_nombre, turno) FROM stdin;
\.


--
-- TOC entry 5312 (class 0 OID 24986)
-- Dependencies: 265
-- Data for Name: horario_asignatura; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.horario_asignatura (horario_asignatura_id, asignatura_id, ubicacion_academica_id, hora_inicio, hora_fin, aula) FROM stdin;
\.


--
-- TOC entry 5292 (class 0 OID 24816)
-- Dependencies: 245
-- Data for Name: matriculas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matriculas (matricula_id, estudiante_id, grupo_academico_id, matricula_fecha, observaciones) FROM stdin;
\.


--
-- TOC entry 5278 (class 0 OID 24685)
-- Dependencies: 231
-- Data for Name: metodo_pago; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.metodo_pago (metodo_pago_id, nombre_metodo, descripcion) FROM stdin;
\.


--
-- TOC entry 5280 (class 0 OID 24693)
-- Dependencies: 233
-- Data for Name: monedas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.monedas (moneda_id, nombre_moneda, simbolo, tipo_cambio) FROM stdin;
\.


--
-- TOC entry 5288 (class 0 OID 24792)
-- Dependencies: 241
-- Data for Name: nivel_academico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nivel_academico (nivel_academico_id, nivel_nombre, descripcion, edad_min, edad_max) FROM stdin;
\.


--
-- TOC entry 5308 (class 0 OID 24956)
-- Dependencies: 261
-- Data for Name: nota; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nota (nota_id, evaluacion_id, estudiante_id, puntaje, fecha_registro) FROM stdin;
\.


--
-- TOC entry 5276 (class 0 OID 24664)
-- Dependencies: 229
-- Data for Name: orden_pago; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orden_pago (orden_pago_id, cliente_id, usuario_id, fecha_emision, fecha_finalizacion) FROM stdin;
\.


--
-- TOC entry 5286 (class 0 OID 24769)
-- Dependencies: 239
-- Data for Name: orden_producto; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orden_producto (orden_producto_id, orden_pago_id, producto_id, cantidad, precio_unitario, descuento) FROM stdin;
\.


--
-- TOC entry 5298 (class 0 OID 24866)
-- Dependencies: 251
-- Data for Name: orden_servicio; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orden_servicio (orden_servicio_id, orden_pago_id, servicio_academico_id, precio_unitario, descuento) FROM stdin;
\.


--
-- TOC entry 5282 (class 0 OID 24701)
-- Dependencies: 235
-- Data for Name: pagos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagos (pago_id, cliente_id, orden_pago_id, monto_pagado, metodo_pago_id) FROM stdin;
\.


--
-- TOC entry 5296 (class 0 OID 24846)
-- Dependencies: 249
-- Data for Name: pension_academica; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pension_academica (pension_academica_id, matricula_id, servicio_academico_id, monto, descripcion, fecha_vencimiento, estado) FROM stdin;
\.


--
-- TOC entry 5300 (class 0 OID 24888)
-- Dependencies: 253
-- Data for Name: periodo_academico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.periodo_academico (periodo_academico_id, fecha_inicio, fecha_fin) FROM stdin;
\.


--
-- TOC entry 5284 (class 0 OID 24737)
-- Dependencies: 237
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.productos (producto_id, producto_nombre, descripcion, precio_unitario, stock, producto_tip, moneda_id) FROM stdin;
\.


--
-- TOC entry 5302 (class 0 OID 24898)
-- Dependencies: 255
-- Data for Name: programa_academico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.programa_academico (programa_academico_id, grupo_academico_id, periodo_academico_id, nombre_pograma, codigo) FROM stdin;
\.


--
-- TOC entry 5317 (class 0 OID 25035)
-- Dependencies: 270
-- Data for Name: secretarias; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.secretarias (empleado_id, area, fecha_ingreso, estado) FROM stdin;
\.


--
-- TOC entry 5294 (class 0 OID 24837)
-- Dependencies: 247
-- Data for Name: servicio_academico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.servicio_academico (servicio_academico_id, nombre_servicio, descripcion, precio_unitario, estado, servicio_tipo) FROM stdin;
\.


--
-- TOC entry 5272 (class 0 OID 24621)
-- Dependencies: 225
-- Data for Name: tutor_estudiante; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tutor_estudiante (tutor_id, estudiante_id, fecha_asignacion) FROM stdin;
\.


--
-- TOC entry 5271 (class 0 OID 24607)
-- Dependencies: 224
-- Data for Name: tutores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tutores (tutor_id, cliente_id, primer_nombre, primer_apellido, direccion, telefono) FROM stdin;
\.


--
-- TOC entry 5310 (class 0 OID 24977)
-- Dependencies: 263
-- Data for Name: ubicacion_academica; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ubicacion_academica (ubicacion_academica_id, nombre, capacidad, ubicacion_tipo, estado) FROM stdin;
\.


--
-- TOC entry 5274 (class 0 OID 24640)
-- Dependencies: 227
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (usuario_id, nombre) FROM stdin;
\.


--
-- TOC entry 5349 (class 0 OID 0)
-- Dependencies: 256
-- Name: asignaturas_asignatura_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.asignaturas_asignatura_id_seq', 1, false);


--
-- TOC entry 5350 (class 0 OID 0)
-- Dependencies: 219
-- Name: clientes_cliente_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clientes_cliente_id_seq', 1, false);


--
-- TOC entry 5351 (class 0 OID 0)
-- Dependencies: 268
-- Name: docentes_docente_codigo_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.docentes_docente_codigo_seq', 1, false);


--
-- TOC entry 5352 (class 0 OID 0)
-- Dependencies: 266
-- Name: empleados_empleado_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.empleados_empleado_id_seq', 1, false);


--
-- TOC entry 5353 (class 0 OID 0)
-- Dependencies: 221
-- Name: estudiantes_estudiante_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estudiantes_estudiante_id_seq', 1, false);


--
-- TOC entry 5354 (class 0 OID 0)
-- Dependencies: 258
-- Name: evaluaciones_evaluacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.evaluaciones_evaluacion_id_seq', 1, false);


--
-- TOC entry 5355 (class 0 OID 0)
-- Dependencies: 242
-- Name: grupo_academico_grupo_academico_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.grupo_academico_grupo_academico_id_seq', 1, false);


--
-- TOC entry 5356 (class 0 OID 0)
-- Dependencies: 264
-- Name: horario_asignatura_horario_asignatura_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.horario_asignatura_horario_asignatura_id_seq', 1, false);


--
-- TOC entry 5357 (class 0 OID 0)
-- Dependencies: 244
-- Name: matriculas_matricula_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matriculas_matricula_id_seq', 1, false);


--
-- TOC entry 5358 (class 0 OID 0)
-- Dependencies: 230
-- Name: metodo_pago_metodo_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.metodo_pago_metodo_pago_id_seq', 1, false);


--
-- TOC entry 5359 (class 0 OID 0)
-- Dependencies: 232
-- Name: monedas_modnea_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.monedas_modnea_id_seq', 1, false);


--
-- TOC entry 5360 (class 0 OID 0)
-- Dependencies: 240
-- Name: nivel_academico_nivel_academico_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.nivel_academico_nivel_academico_id_seq', 1, false);


--
-- TOC entry 5361 (class 0 OID 0)
-- Dependencies: 260
-- Name: nota_nota_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.nota_nota_id_seq', 1, false);


--
-- TOC entry 5362 (class 0 OID 0)
-- Dependencies: 228
-- Name: orden_pago_orden_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orden_pago_orden_pago_id_seq', 1, false);


--
-- TOC entry 5363 (class 0 OID 0)
-- Dependencies: 238
-- Name: orden_producto_orden_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orden_producto_orden_producto_id_seq', 1, false);


--
-- TOC entry 5364 (class 0 OID 0)
-- Dependencies: 250
-- Name: orden_servicio_orden_servicio_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orden_servicio_orden_servicio_id_seq', 1, false);


--
-- TOC entry 5365 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagos_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagos_pago_id_seq', 1, false);


--
-- TOC entry 5366 (class 0 OID 0)
-- Dependencies: 248
-- Name: pension_academica_pension_academica_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pension_academica_pension_academica_id_seq', 1, false);


--
-- TOC entry 5367 (class 0 OID 0)
-- Dependencies: 252
-- Name: periodo_academico_periodo_academico_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.periodo_academico_periodo_academico_id_seq', 1, false);


--
-- TOC entry 5368 (class 0 OID 0)
-- Dependencies: 236
-- Name: productos_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.productos_producto_id_seq', 1, false);


--
-- TOC entry 5369 (class 0 OID 0)
-- Dependencies: 254
-- Name: programa_academico_programa_academico_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.programa_academico_programa_academico_id_seq', 1, false);


--
-- TOC entry 5370 (class 0 OID 0)
-- Dependencies: 246
-- Name: servicio_academico_servicio_academico_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.servicio_academico_servicio_academico_id_seq', 1, false);


--
-- TOC entry 5371 (class 0 OID 0)
-- Dependencies: 223
-- Name: tutores_tutor_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tutores_tutor_id_seq', 1, false);


--
-- TOC entry 5372 (class 0 OID 0)
-- Dependencies: 262
-- Name: ubicacion_academica_ubicacion_academica_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ubicacion_academica_ubicacion_academica_id_seq', 1, false);


--
-- TOC entry 5373 (class 0 OID 0)
-- Dependencies: 226
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_usuario_id_seq', 1, false);


--
-- TOC entry 5067 (class 2606 OID 24933)
-- Name: asignaturas asignaturas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_codigo_key UNIQUE (codigo);


--
-- TOC entry 5069 (class 2606 OID 24931)
-- Name: asignaturas asignaturas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_pkey PRIMARY KEY (asignatura_id);


--
-- TOC entry 5025 (class 2606 OID 24587)
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- TOC entry 5027 (class 2606 OID 24585)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (cliente_id);


--
-- TOC entry 5087 (class 2606 OID 25065)
-- Name: docente_asignatura docente_asignatura_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_pkey PRIMARY KEY (docente_codigo, asignatura_id);


--
-- TOC entry 5085 (class 2606 OID 25058)
-- Name: docentes docente_codigo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docente_codigo UNIQUE (docente_codigo);


--
-- TOC entry 5079 (class 2606 OID 25019)
-- Name: empleados empleados_cedula_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_cedula_key UNIQUE (cedula);


--
-- TOC entry 5081 (class 2606 OID 25021)
-- Name: empleados empleados_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_email_key UNIQUE (email);


--
-- TOC entry 5083 (class 2606 OID 25017)
-- Name: empleados empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_pkey PRIMARY KEY (empleado_id);


--
-- TOC entry 5029 (class 2606 OID 24600)
-- Name: estudiantes estudiantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_pkey PRIMARY KEY (estudiante_id);


--
-- TOC entry 5071 (class 2606 OID 24949)
-- Name: evaluaciones evaluaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_pkey PRIMARY KEY (evaluacion_id);


--
-- TOC entry 5051 (class 2606 OID 24809)
-- Name: grupo_academico grupo_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupo_academico
    ADD CONSTRAINT grupo_academico_pkey PRIMARY KEY (grupo_academico_id);


--
-- TOC entry 5077 (class 2606 OID 24994)
-- Name: horario_asignatura horario_asignatura_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_pkey PRIMARY KEY (horario_asignatura_id);


--
-- TOC entry 5053 (class 2606 OID 24825)
-- Name: matriculas matriculas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_pkey PRIMARY KEY (matricula_id);


--
-- TOC entry 5039 (class 2606 OID 24691)
-- Name: metodo_pago metodo_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metodo_pago
    ADD CONSTRAINT metodo_pago_pkey PRIMARY KEY (metodo_pago_id);


--
-- TOC entry 5041 (class 2606 OID 24699)
-- Name: monedas monedas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monedas
    ADD CONSTRAINT monedas_pkey PRIMARY KEY (moneda_id);


--
-- TOC entry 5049 (class 2606 OID 24799)
-- Name: nivel_academico nivel_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nivel_academico
    ADD CONSTRAINT nivel_academico_pkey PRIMARY KEY (nivel_academico_id);


--
-- TOC entry 5073 (class 2606 OID 24965)
-- Name: nota nota_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_pkey PRIMARY KEY (nota_id);


--
-- TOC entry 5037 (class 2606 OID 24673)
-- Name: orden_pago orden_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_pkey PRIMARY KEY (orden_pago_id);


--
-- TOC entry 5047 (class 2606 OID 24780)
-- Name: orden_producto orden_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_pkey PRIMARY KEY (orden_producto_id);


--
-- TOC entry 5059 (class 2606 OID 24876)
-- Name: orden_servicio orden_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_pkey PRIMARY KEY (orden_servicio_id);


--
-- TOC entry 5043 (class 2606 OID 24711)
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 5057 (class 2606 OID 24854)
-- Name: pension_academica pension_academica_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_pkey PRIMARY KEY (pension_academica_id);


--
-- TOC entry 5061 (class 2606 OID 24896)
-- Name: periodo_academico periodo_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_academico
    ADD CONSTRAINT periodo_academico_pkey PRIMARY KEY (periodo_academico_id);


--
-- TOC entry 5045 (class 2606 OID 24744)
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (producto_id);


--
-- TOC entry 5063 (class 2606 OID 24910)
-- Name: programa_academico programa_academico_codigo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_codigo_key UNIQUE (codigo);


--
-- TOC entry 5065 (class 2606 OID 24908)
-- Name: programa_academico programa_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_pkey PRIMARY KEY (programa_academico_id);


--
-- TOC entry 5055 (class 2606 OID 24844)
-- Name: servicio_academico servicio_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servicio_academico
    ADD CONSTRAINT servicio_academico_pkey PRIMARY KEY (servicio_academico_id);


--
-- TOC entry 5033 (class 2606 OID 24628)
-- Name: tutor_estudiante tutor_estudiante_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_pkey PRIMARY KEY (tutor_id, estudiante_id);


--
-- TOC entry 5031 (class 2606 OID 24615)
-- Name: tutores tutores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutores
    ADD CONSTRAINT tutores_pkey PRIMARY KEY (tutor_id);


--
-- TOC entry 5075 (class 2606 OID 24984)
-- Name: ubicacion_academica ubicacion_academica_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ubicacion_academica
    ADD CONSTRAINT ubicacion_academica_pkey PRIMARY KEY (ubicacion_academica_id);


--
-- TOC entry 5035 (class 2606 OID 24647)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (usuario_id);


--
-- TOC entry 5109 (class 2606 OID 24934)
-- Name: asignaturas asignaturas_programa_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaturas
    ADD CONSTRAINT asignaturas_programa_academico_id_fkey FOREIGN KEY (programa_academico_id) REFERENCES public.programa_academico(programa_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5117 (class 2606 OID 25066)
-- Name: docente_asignatura docente_asignatura_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- TOC entry 5118 (class 2606 OID 25071)
-- Name: docente_asignatura docente_asignatura_docente_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docente_asignatura
    ADD CONSTRAINT docente_asignatura_docente_codigo_fkey FOREIGN KEY (docente_codigo) REFERENCES public.docentes(docente_codigo) ON DELETE CASCADE;


--
-- TOC entry 5115 (class 2606 OID 25030)
-- Name: docentes docentes_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(empleado_id) ON DELETE CASCADE;


--
-- TOC entry 5088 (class 2606 OID 24601)
-- Name: estudiantes estudiantes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- TOC entry 5110 (class 2606 OID 24950)
-- Name: evaluaciones evaluaciones_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- TOC entry 5100 (class 2606 OID 24810)
-- Name: grupo_academico grupo_academico_nivel_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupo_academico
    ADD CONSTRAINT grupo_academico_nivel_academico_id_fkey FOREIGN KEY (nivel_academico_id) REFERENCES public.nivel_academico(nivel_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5113 (class 2606 OID 24995)
-- Name: horario_asignatura horario_asignatura_asignatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_asignatura_id_fkey FOREIGN KEY (asignatura_id) REFERENCES public.asignaturas(asignatura_id) ON DELETE CASCADE;


--
-- TOC entry 5114 (class 2606 OID 25000)
-- Name: horario_asignatura horario_asignatura_ubicacion_academica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horario_asignatura
    ADD CONSTRAINT horario_asignatura_ubicacion_academica_id_fkey FOREIGN KEY (ubicacion_academica_id) REFERENCES public.ubicacion_academica(ubicacion_academica_id) ON DELETE CASCADE;


--
-- TOC entry 5101 (class 2606 OID 24831)
-- Name: matriculas matriculas_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- TOC entry 5102 (class 2606 OID 24826)
-- Name: matriculas matriculas_grupo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matriculas
    ADD CONSTRAINT matriculas_grupo_academico_id_fkey FOREIGN KEY (grupo_academico_id) REFERENCES public.grupo_academico(grupo_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5111 (class 2606 OID 24966)
-- Name: nota nota_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- TOC entry 5112 (class 2606 OID 24971)
-- Name: nota nota_evaluacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nota
    ADD CONSTRAINT nota_evaluacion_id_fkey FOREIGN KEY (evaluacion_id) REFERENCES public.evaluaciones(evaluacion_id) ON DELETE CASCADE;


--
-- TOC entry 5092 (class 2606 OID 24674)
-- Name: orden_pago orden_pago_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- TOC entry 5093 (class 2606 OID 24679)
-- Name: orden_pago orden_pago_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_pago
    ADD CONSTRAINT orden_pago_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id) ON DELETE CASCADE;


--
-- TOC entry 5098 (class 2606 OID 24781)
-- Name: orden_producto orden_producto_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- TOC entry 5099 (class 2606 OID 24786)
-- Name: orden_producto orden_producto_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_producto
    ADD CONSTRAINT orden_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id) ON DELETE CASCADE;


--
-- TOC entry 5105 (class 2606 OID 24882)
-- Name: orden_servicio orden_servicio_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- TOC entry 5106 (class 2606 OID 24877)
-- Name: orden_servicio orden_servicio_servicio_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_servicio
    ADD CONSTRAINT orden_servicio_servicio_academico_id_fkey FOREIGN KEY (servicio_academico_id) REFERENCES public.servicio_academico(servicio_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5094 (class 2606 OID 24712)
-- Name: pagos pagos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


--
-- TOC entry 5095 (class 2606 OID 24717)
-- Name: pagos pagos_metodo_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_metodo_pago_id_fkey FOREIGN KEY (metodo_pago_id) REFERENCES public.metodo_pago(metodo_pago_id) ON DELETE CASCADE;


--
-- TOC entry 5096 (class 2606 OID 24722)
-- Name: pagos pagos_orden_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_orden_pago_id_fkey FOREIGN KEY (orden_pago_id) REFERENCES public.orden_pago(orden_pago_id) ON DELETE CASCADE;


--
-- TOC entry 5103 (class 2606 OID 24860)
-- Name: pension_academica pension_academica_matricula_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES public.matriculas(matricula_id) ON DELETE CASCADE;


--
-- TOC entry 5104 (class 2606 OID 24855)
-- Name: pension_academica pension_academica_servicio_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pension_academica
    ADD CONSTRAINT pension_academica_servicio_academico_id_fkey FOREIGN KEY (servicio_academico_id) REFERENCES public.servicio_academico(servicio_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5097 (class 2606 OID 24745)
-- Name: productos productos_moneda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_moneda_id_fkey FOREIGN KEY (moneda_id) REFERENCES public.monedas(moneda_id) ON DELETE CASCADE;


--
-- TOC entry 5107 (class 2606 OID 24911)
-- Name: programa_academico programa_academico_grupo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_grupo_academico_id_fkey FOREIGN KEY (grupo_academico_id) REFERENCES public.grupo_academico(grupo_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5108 (class 2606 OID 24916)
-- Name: programa_academico programa_academico_periodo_academico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.programa_academico
    ADD CONSTRAINT programa_academico_periodo_academico_id_fkey FOREIGN KEY (periodo_academico_id) REFERENCES public.periodo_academico(periodo_academico_id) ON DELETE CASCADE;


--
-- TOC entry 5116 (class 2606 OID 25040)
-- Name: secretarias secretarias_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.secretarias
    ADD CONSTRAINT secretarias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(empleado_id) ON DELETE CASCADE;


--
-- TOC entry 5090 (class 2606 OID 24634)
-- Name: tutor_estudiante tutor_estudiante_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(estudiante_id) ON DELETE CASCADE;


--
-- TOC entry 5091 (class 2606 OID 24629)
-- Name: tutor_estudiante tutor_estudiante_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutor_estudiante
    ADD CONSTRAINT tutor_estudiante_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.tutores(tutor_id) ON DELETE CASCADE;


--
-- TOC entry 5089 (class 2606 OID 24616)
-- Name: tutores tutores_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tutores
    ADD CONSTRAINT tutores_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON DELETE CASCADE;


-- Completed on 2025-11-05 00:22:56

--
-- PostgreSQL database dump complete
--

\unrestrict rP0rHqAxNg3YfiT0WlOOzWAgs91ufHOR9cKfBT7XfmCsmrMgTUAAIBKkELY5hai

