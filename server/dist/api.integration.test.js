import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { crearApp } from './app.js';
import { activarMensajesEnEspanol } from './lib/zod-es.js';
import { closePool } from './db/pool.js';
/**
 * Pruebas de integración de la API.
 *
 * Necesitan PostgreSQL con el esquema y el seed cargados (`db/reset-db.sh`).
 *
 * Regla de la casa: estas pruebas NO borran ni modifican registros del seed.
 * Todo lo que necesitan lo crean ellas mismas y lo limpian en `afterAll`, de
 * forma que se puedan repetir tantas veces como se quiera sin dejar basura ni
 * romper los datos de demostración.
 */
// El `.env` lo carga `src/test.env.ts` (setupFile de Vitest), que corre antes
// que cualquier import.
activarMensajesEnEspanol();
const CUENTAS = {
    admin: { email: 'admin@ccm.edu.do', password: 'Admin123!' },
    secretaria: { email: 'secretaria@ccm.edu.do', password: 'Secretaria123!' },
    docente: { email: 'docente@ccm.edu.do', password: 'Docente123!' },
    consulta: { email: 'consulta@ccm.edu.do', password: 'Consulta123!' },
};
let app;
const token = {};
/**
 * Registros creados por las pruebas, para borrarlos al final.
 *
 * `nivel` está en 'cascade' porque al borrar un padre PostgreSQL ya se lleva
 * los hijos; borrar el hijo explícitamente no hace falta y, si queda algún
 * dato huérfano, conviene que la base lo refleje.
 */
const creados = [];
function programarLimpieza(url, nivel = 'simple') {
    creados.push({ url, nivel });
}
function auth(rol) {
    return { Authorization: `Bearer ${token[rol]}` };
}
let contador = 0;
/** Nombre único por ejecución: las pruebas pueden repetirse sin colisionar. */
function nombreUnico(base) {
    contador += 1;
    return `${base} ${contador} ${process.pid}`;
}
async function crearCliente(extra = {}) {
    const nombre = nombreUnico('Cliente Prueba');
    const r = await request(app)
        .post('/api/clientes')
        .set(auth('admin'))
        .send({ nombre, telefono: '8090000000', cliente_tipo: 'Padre', ...extra })
        .expect(201);
    programarLimpieza(`/api/clientes/${r.body.data.cliente_id}`);
    return r.body.data.cliente_id;
}
async function crearEstudiante(clienteId, extra = {}) {
    const r = await request(app)
        .post('/api/estudiantes')
        .set(auth('admin'))
        .send({
        cliente_id: clienteId,
        primer_nombre: 'Estudiante',
        primer_apellido: nombreUnico('Apellido'),
        nacimiento: '2015-05-04',
        ...extra,
    })
        .expect(201);
    programarLimpieza(`/api/estudiantes/${r.body.data.estudiante_id}`, 'cascade');
    return r.body.data.estudiante_id;
}
/** Un grupo del seed, para poder matricular sin crear catálogos. */
async function unGrupoId() {
    const r = await request(app).get('/api/catalogos').set(auth('admin')).expect(200);
    return r.body.data.grupos[0].id;
}
beforeAll(async () => {
    app = crearApp();
    for (const [rol, cuenta] of Object.entries(CUENTAS)) {
        const r = await request(app).post('/api/auth/login').send(cuenta).expect(200);
        token[rol] = r.body.data.token;
    }
});
afterAll(async () => {
    // Primero los hijos: si un padre ya no existe, el hijo no se puede borrar.
    for (const c of [...creados].reverse()) {
        const r = await request(app)
            .delete(c.nivel === 'cascade' ? `${c.url}?cascade=1` : c.url)
            .set(auth('admin'));
        if (r.status !== 204) {
            // No debe abortar la suite: se avisa y se sigue limpiando.
            console.warn(`[limpieza] ${c.url} respondió ${r.status}`);
        }
    }
    await closePool();
});
describe('salud', () => {
    it('informa que la base está conectada', async () => {
        const r = await request(app).get('/api/health').expect(200);
        expect(r.body.status).toBe('ok');
        expect(r.body.baseDeDatos).toBe('conectada');
    });
});
describe('autenticación', () => {
    it('rechaza credenciales incorrectas con 401 y un código estable', async () => {
        const r = await request(app)
            .post('/api/auth/login')
            .send({ email: CUENTAS.admin.email, password: 'incorrecta' })
            .expect(401);
        expect(r.body.error.code).toBe('BAD_CREDENTIALS');
        expect(r.body.error.message).toMatch(/incorrect/i);
    });
    it('devuelve el usuario con su token, sinfiltrar el hash', async () => {
        const r = await request(app).post('/api/auth/login').send(CUENTAS.admin).expect(200);
        expect(r.body.data.token).toEqual(expect.any(String));
        expect(r.body.data.usuario.rol).toBe('admin');
        expect(JSON.stringify(r.body)).not.toContain('password_hash');
        expect(JSON.stringify(r.body)).not.toContain('$2b$');
    });
    it('valida el formato del correo antes de tocar la base', async () => {
        const r = await request(app)
            .post('/api/auth/login')
            .send({ email: 'no-es-email', password: 'x' })
            .expect(422);
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
        expect(r.body.error.details.email).toMatch(/email/i);
    });
    it('exige un token válido en las rutas protegidas', async () => {
        await request(app).get('/api/estudiantes').expect(401);
        const r = await request(app)
            .get('/api/estudiantes')
            .set('Authorization', 'Bearer inventado')
            .expect(401);
        expect(r.body.error.message).toBeTruthy();
    });
    it('/auth/yo devuelve el usuario del token', async () => {
        const r = await request(app).get('/api/auth/yo').set(auth('docente')).expect(200);
        expect(r.body.data.email).toBe(CUENTAS.docente.email);
        expect(r.body.data.rol).toBe('docente');
    });
});
describe('permisos por rol', () => {
    it('el docente lee', async () => {
        await request(app).get('/api/estudiantes').set(auth('docente')).expect(200);
    });
    it('el docente no escribe', async () => {
        const r = await request(app)
            .post('/api/clientes')
            .set(auth('docente'))
            .send({ nombre: 'No permitido' })
            .expect(403);
        expect(r.body.error.code).toBe('FORBIDDEN');
    });
    it('solo lectura no escribe', async () => {
        const r = await request(app)
            .patch('/api/clientes/1')
            .set(auth('consulta'))
            .send({ nombre: 'No permitido' })
            .expect(403);
        expect(r.body.error.code).toBe('FORBIDDEN');
    });
    it('la secretaría sí escribe', async () => {
        const id = await crearCliente();
        const r = await request(app)
            .patch(`/api/clientes/${id}`)
            .set(auth('secretaria'))
            .send({ telefono: '8091112222' })
            .expect(200);
        expect(r.body.data.telefono).toBe('8091112222');
    });
});
describe('ciclo CRUD completo', () => {
    it('crea, lee, edita y borra', async () => {
        const id = await crearCliente();
        const nombre = nombreUnico('Original');
        await request(app).patch(`/api/clientes/${id}`).set(auth('admin')).send({ nombre }).expect(200);
        const uno = await request(app).get(`/api/clientes/${id}`).set(auth('admin')).expect(200);
        expect(uno.body.data.nombre).toBe(nombre);
        // El PATCH es parcial: lo no enviado no se toca.
        await request(app)
            .patch(`/api/clientes/${id}`)
            .set(auth('admin'))
            .send({ telefono: '8093334444' })
            .expect(200);
        const editado = await request(app).get(`/api/clientes/${id}`).set(auth('admin')).expect(200);
        expect(editado.body.data.telefono).toBe('8093334444');
        expect(editado.body.data.nombre).toBe(nombre);
        await request(app).delete(`/api/clientes/${id}`).set(auth('admin')).expect(204);
        await request(app).get(`/api/clientes/${id}`).set(auth('admin')).expect(404);
    });
    it('el POST devuelve la misma forma de fila que el GET', async () => {
        const nombre = nombreUnico('Formato');
        const r = await request(app)
            .post('/api/clientes')
            .set(auth('admin'))
            .send({ nombre, cliente_tipo: 'Madre' })
            .expect(201);
        const id = r.body.data.cliente_id;
        programarLimpieza(`/api/clientes/${id}`);
        const porId = await request(app).get(`/api/clientes/${id}`).set(auth('admin')).expect(200);
        // Si difieren, el cliente recibe una fila con columnas distintas según si
        // acaba de crear o si está editando.
        expect(Object.keys(r.body.data).sort()).toEqual(Object.keys(porId.body.data).sort());
        expect(r.body.meta.id).toBe(id);
    });
    it('devuelve 422 en español cuando falta un campo obligatorio', async () => {
        const r = await request(app)
            .post('/api/clientes')
            .set(auth('admin'))
            .send({ telefono: '8090000000' })
            .expect(422);
        expect(r.body.error.message).toMatch(/inválidos en body/);
        expect(r.body.error.details.nombre).toMatch(/obligatorio/i);
        // El mensaje tiene que ser entendible: nada de 'required' ni 'expected'.
        expect(r.body.error.details.nombre).not.toMatch(/required|expected|received/i);
    });
    it('devuelve 409 cuando se repite el email, que es UNIQUE en la base', async () => {
        const email = `${nombreUnico('dup').replaceAll(' ', '.')}@prueba.do`;
        const id = await crearCliente({ email });
        const r = await request(app)
            .post('/api/clientes')
            .set(auth('admin'))
            .send({ nombre: nombreUnico('Otro'), email })
            .expect(409);
        expect(r.body.error.message).toMatch(/existe|duplicad/i);
        // Se limpia aquí porque el alta falló y nunca se registró.
        await request(app).delete(`/api/clientes/${id}`).set(auth('admin')).expect(204);
        creados.splice(creados.findIndex((c) => c.url === `/api/clientes/${id}`), 1);
    });
    it('rechaza un PATCH vacío en lugar de responder 200 sin hacer nada', async () => {
        const id = await crearCliente();
        await request(app).patch(`/api/clientes/${id}`).set(auth('admin')).send({}).expect(400);
    });
    it('devuelve 404 al editar un id que no existe', async () => {
        await request(app)
            .patch('/api/clientes/99999999')
            .set(auth('admin'))
            .send({ nombre: 'Fantasma' })
            .expect(404);
    });
});
describe('listado, filtros y orden', () => {
    it('pagina con metadatos consistentes', async () => {
        const r = await request(app)
            .get('/api/estudiantes?page=1&pageSize=5')
            .set(auth('admin'))
            .expect(200);
        expect(r.body.data.length).toBeLessThanOrEqual(5);
        expect(r.body.meta).toMatchObject({ page: 1, pageSize: 5 });
        expect(r.body.meta.total).toBeGreaterThan(5);
        expect(r.body.meta.totalPages).toBe(Math.ceil(r.body.meta.total / 5));
    });
    it('devuelve vacío más allá de la última página, sin error', async () => {
        const r = await request(app).get('/api/estudiantes?page=9999').set(auth('admin')).expect(200);
        expect(r.body.data).toEqual([]);
        expect(r.body.meta.total).toBeGreaterThan(0);
    });
    it('busca sin distinguir mayúsculas y solo devuelve coincidencias', async () => {
        const apellido = nombreUnico('Buscador');
        await crearEstudiante(await crearCliente(), { primer_apellido: apellido });
        const r = await request(app)
            .get(`/api/estudiantes?q=${encodeURIComponent(apellido.toUpperCase())}`)
            .set(auth('admin'))
            .expect(200);
        expect(r.body.data.length).toBeGreaterThan(0);
        for (const fila of r.body.data) {
            expect(`${fila.primer_nombre} ${fila.primer_apellido}`.toLowerCase()).toContain(apellido.toLowerCase());
        }
    });
    it('ordena por id de forma estricta en ambos sentidos', async () => {
        const asc = await request(app)
            .get('/api/estudiantes?orderBy=id&sort=asc&pageSize=200')
            .set(auth('admin'))
            .expect(200);
        const ids = asc.body.data.map((f) => f.estudiante_id);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
        const desc = await request(app)
            .get('/api/estudiantes?orderBy=id&sort=desc&pageSize=200')
            .set(auth('admin'))
            .expect(200);
        const idsDesc = desc.body.data.map((f) => f.estudiante_id);
        expect(idsDesc).toEqual([...ids].reverse());
    });
    it('ordena por una clave semántica sin desordenar', async () => {
        const r = await request(app)
            .get('/api/estudiantes?orderBy=apellido&sort=asc&pageSize=200')
            .set(auth('admin'))
            .expect(200);
        const apellidos = r.body.data.map((f) => f.primer_apellido);
        expect([...apellidos].sort()).toEqual(apellidos);
    });
    it('ignora una columna de orden que no está en la lista blanca', async () => {
        // El nombre de la columna NUNCA se interpola en el SQL: si no está
        // autorizada, se usa el orden por defecto en lugar de romper la consulta.
        const r = await request(app)
            .get('/api/estudiantes?orderBy=password_hash&pageSize=3')
            .set(auth('admin'))
            .expect(200);
        expect(r.body.data).toHaveLength(3);
    });
    it('filtra por un campo exacto', async () => {
        const tipo = 'Padre';
        await crearCliente({ cliente_tipo: tipo });
        const r = await request(app)
            .get(`/api/clientes?cliente_tipo=${tipo}&pageSize=200`)
            .set(auth('admin'))
            .expect(200);
        expect(r.body.data.length).toBeGreaterThan(0);
        for (const fila of r.body.data)
            expect(fila.cliente_tipo).toBe(tipo);
    });
    it('combina búsqueda, filtro y orden sin perder filas válidas', async () => {
        const r = await request(app)
            .get('/api/estudiantes?q=a&orderBy=nombre&sort=asc&pageSize=10')
            .set(auth('admin'))
            .expect(200);
        expect(r.body.data.length).toBeLessThanOrEqual(10);
    });
    it('rechaza un pageSize fuera de rango', async () => {
        await request(app).get('/api/estudiantes?pageSize=5000').set(auth('admin')).expect(422);
    });
});
describe('inyección de SQL', () => {
    it('no se puede inyectar en la búsqueda', async () => {
        const r = await request(app)
            .get(`/api/estudiantes?q=${encodeURIComponent("' OR '1'='1")}`)
            .set(auth('admin'))
            .expect(200);
        // La comilla se trata como texto: no devuelve "todo".
        const total = r.body.meta.total;
        const todos = await request(app)
            .get('/api/estudiantes?pageSize=1')
            .set(auth('admin'))
            .expect(200);
        expect(total).toBeLessThan(todos.body.meta.total);
    });
    it('no se puede inyectar en el orden ni ejecutar SQL', async () => {
        await request(app)
            .get('/api/estudiantes?orderBy=1;DROP TABLE estudiantes')
            .set(auth('admin'))
            .expect(200);
        // Si la tabla hubiera caído, esto fallaría.
        await request(app).get('/api/estudiantes?pageSize=1').set(auth('admin')).expect(200);
    });
    it('rechaza un id que no es un entero', async () => {
        await request(app)
            .get(`/api/estudiantes/${encodeURIComponent('1 OR 1=1')}`)
            .set(auth('admin'))
            .expect(422);
    });
    it('rechaza un id negativo o cero', async () => {
        await request(app).get('/api/estudiantes/-1').set(auth('admin')).expect(422);
        await request(app).get('/api/estudiantes/0').set(auth('admin')).expect(422);
    });
});
describe('borrado protegido', () => {
    it('bloquea el borrado de un cliente con estudiantes y explica cómo seguir', async () => {
        const clienteId = await crearCliente();
        await crearEstudiante(clienteId);
        const r = await request(app)
            .delete(`/api/clientes/${clienteId}`)
            .set(auth('admin'))
            .expect(409);
        expect(r.body.error.code).toBe('CONFLICT');
        expect(r.body.error.message).toMatch(/no se puede eliminar/i);
        // El detalle dice cuántos y por cada tipo, y ofrece la salida.
        expect(r.body.error.details.dependientes.estudiantes).toBe(1);
        expect(r.body.error.details.sugerencia).toMatch(/cascade=1/);
    });
    it('bloquea el borrado de un estudiante matriculado', async () => {
        const clienteId = await crearCliente();
        const estudianteId = await crearEstudiante(clienteId);
        await request(app)
            .post('/api/matriculas')
            .set(auth('admin'))
            .send({
            estudiante_id: estudianteId,
            grupo_academico_id: await unGrupoId(),
            matricula_fecha: '2026-02-02',
        })
            .expect(201);
        const r = await request(app)
            .delete(`/api/estudiantes/${estudianteId}`)
            .set(auth('admin'))
            .expect(409);
        expect(r.body.error.details.dependientes.matrículas ??
            r.body.error.details.dependientes['matrículas']).toBe(1);
    });
    it('borrar en cascada se lleva también a los dependientes', async () => {
        const clienteId = await crearCliente();
        const estudianteId = await crearEstudiante(clienteId);
        const matricula = await request(app)
            .post('/api/matriculas')
            .set(auth('admin'))
            .send({
            estudiante_id: estudianteId,
            grupo_academico_id: await unGrupoId(),
            matricula_fecha: '2026-03-03',
        })
            .expect(201);
        const matriculaId = matricula.body.data.matricula_id;
        await request(app)
            .delete(`/api/estudiantes/${estudianteId}?cascade=1`)
            .set(auth('admin'))
            .expect(204);
        // La matrícula no quedó colgando de un padre que ya no existe.
        await request(app).get(`/api/matriculas/${matriculaId}`).set(auth('admin')).expect(404);
        await request(app).get(`/api/estudiantes/${estudianteId}`).set(auth('admin')).expect(404);
    });
    it('un cliente sin dependientes se borra sin cascade', async () => {
        const id = await crearCliente();
        await request(app).delete(`/api/clientes/${id}`).set(auth('admin')).expect(204);
        creados.splice(creados.findIndex((c) => c.url === `/api/clientes/${id}`), 1);
    });
    it('devuelve 404 al borrar algo que no existe, no un error de SQL', async () => {
        await request(app).delete('/api/clientes/99999999').set(auth('admin')).expect(404);
    });
});
describe('docentes · escritura en dos tablas', () => {
    it('crea empleado + docente, edita repartiendo campos y borra ambos', async () => {
        const empleadoId = 90_000 + (process.pid % 1000);
        // Se registra la limpieza ANTES de crear: si una aserción falla a mitad de
        // camino, el empleado huérfano se borra igual en `afterAll`.
        programarLimpieza(`/api/docentes/${empleadoId}`, 'cascade');
        const alta = await request(app)
            .post('/api/docentes')
            .set(auth('admin'))
            .send({
            empleado_id: empleadoId,
            docente_codigo: empleadoId,
            primer_nombre: 'Docente',
            primer_apellido: nombreUnico('Prueba'),
            cedula: `${empleadoId}-0-0000-0`,
            email: `docente.${empleadoId}@prueba.do`,
            especialidad: 'Pruebas',
            categoria_docente: 'Titular',
        })
            .expect(201);
        // El nombre vive en `empleados`, pero el cliente no debe enterarse.
        expect(alta.body.data.empleado_id).toBe(empleadoId);
        expect(alta.body.data.nombre_completo).toMatch(/^Docente /);
        expect(alta.body.data.email).toBe(`docente.${empleadoId}@prueba.do`);
        // El typo del esquema se expone con el nombre correcto.
        expect(alta.body.data.categoria_docente).toBe('Titular');
        expect(alta.body.data).not.toHaveProperty('categorioa_docente');
        await request(app)
            .patch(`/api/docentes/${empleadoId}`)
            .set(auth('admin'))
            .send({ primer_apellido: 'Corregido', categoria_docente: 'Asociado' })
            .expect(200);
        const leido = await request(app)
            .get(`/api/docentes/${empleadoId}`)
            .set(auth('admin'))
            .expect(200);
        expect(leido.body.data.nombre_completo).toBe('Docente Corregido');
        expect(leido.body.data.categoria_docente).toBe('Asociado');
        await request(app).delete(`/api/docentes/${empleadoId}`).set(auth('admin')).expect(204);
        await request(app).get(`/api/docentes/${empleadoId}`).set(auth('admin')).expect(404);
        // Sin huérfanos: el empleado tampoco debe quedar.
        const empleados = await request(app)
            .get(`/api/empleados/${empleadoId}`)
            .set(auth('admin'))
            .expect(404);
        expect(empleados.body.error.code).toBe('NOT_FOUND');
    });
    it('exige la cédula, que es NOT NULL en la base', async () => {
        const r = await request(app)
            .post('/api/docentes')
            .set(auth('admin'))
            .send({
            empleado_id: 95_001,
            docente_codigo: 95_001,
            primer_nombre: 'Sin',
            primer_apellido: 'Cédula',
        })
            .expect(422);
        expect(r.body.error.details.cedula).toBeTruthy();
    });
    it('rechaza una cédula que ya existe sin dejar filas a medias', async () => {
        const cedula = `9${process.pid % 10000}-0-1111-1`;
        const cuerpo = {
            empleado_id: 95_002,
            docente_codigo: 95_002,
            primer_nombre: 'Docente',
            primer_apellido: 'Repetido',
            cedula,
            email: `docente.repetido.${process.pid}@prueba.do`,
        };
        // El primer alta deja el empleado ocupado.
        programarLimpieza('/api/docentes/95002', 'cascade');
        const primero = await request(app)
            .post('/api/docentes')
            .set(auth('admin'))
            .send({ ...cuerpo, empleado_id: 95_002, docente_codigo: 95_002 })
            .expect(201);
        const repetido = await request(app)
            .post('/api/docentes')
            .set(auth('admin'))
            .send({ ...cuerpo, empleado_id: 95_003, docente_codigo: 95_003, email: 'otro@prueba.do' })
            .expect(409);
        expect(repetido.body.error.message).toMatch(/existe|duplicad/i);
        // La transacción se revirtió entera: no quedó ni empleado ni docente.
        await request(app).get(`/api/empleados/${95003}`).set(auth('admin')).expect(404);
        await request(app)
            .delete(`/api/docentes/${primero.body.data.empleado_id}`)
            .set(auth('admin'))
            .expect(204);
        creados.splice(creados.findIndex((c) => c.url === '/api/docentes/95002'), 1);
    });
});
describe('catálogos', () => {
    it('devuelve en una sola petición todas las listas de los desplegables', async () => {
        const r = await request(app).get('/api/catalogos').set(auth('admin')).expect(200);
        for (const clave of [
            'niveles',
            'grupos',
            'programas',
            'asignaturas',
            'estudiantes',
            'clientes',
            'docentes',
            'evaluaciones',
            'usuarios',
            'metodosPago',
        ]) {
            expect(Array.isArray(r.body.data[clave]), `${clave} no es una lista`).toBe(true);
            expect(r.body.data[clave].length, `${clave} está vacía`).toBeGreaterThan(0);
        }
    });
    it('cada ítem trae id y etiqueta, que es lo que necesita el select', async () => {
        const r = await request(app).get('/api/catalogos').set(auth('admin')).expect(200);
        for (const clave of ['niveles', 'grupos', 'clientes', 'estudiantes']) {
            for (const item of r.body.data[clave]) {
                expect(item).toHaveProperty('id');
                expect(typeof item.etiqueta).toBe('string');
                expect(item.etiqueta.length).toBeGreaterThan(0);
            }
        }
    });
    it('las evaluaciones traen el puntaje máximo, para validar la nota', async () => {
        const r = await request(app).get('/api/catalogos').set(auth('admin')).expect(200);
        for (const ev of r.body.data.evaluaciones) {
            expect(ev.nota_total).toBeGreaterThan(0);
            expect(ev.asignatura).toEqual(expect.any(String));
        }
    });
    it('los usuarios del catálogo son solo los activos', async () => {
        const r = await request(app).get('/api/catalogos').set(auth('admin')).expect(200);
        expect(r.body.data.usuarios.every((u) => typeof u.extra === 'string')).toBe(true);
    });
});
describe('dashboard', () => {
    it('devuelve las tarjetas con números del seed, no ceros inventados', async () => {
        const r = await request(app).get('/api/dashboard').set(auth('admin')).expect(200);
        const t = r.body.data.tarjetas;
        expect(t.estudiantes).toBeGreaterThan(0);
        expect(t.docentes).toBeGreaterThan(0);
        expect(t.empleados).toBeGreaterThan(0);
        expect(t.asignaturas).toBeGreaterThan(0);
        expect(t.matriculas).toBeGreaterThan(0);
        // El promedio viene de nota / nota_total: tiene que estar en 0..100.
        expect(t.promedioGeneral).toBeGreaterThanOrEqual(0);
        expect(t.promedioGeneral).toBeLessThanOrEqual(100);
    });
    it('los alumnos matriculados no superan el total de estudiantes', async () => {
        const r = await request(app).get('/api/dashboard').set(auth('admin')).expect(200);
        expect(r.body.data.tarjetas.alumnosMatriculados).toBeLessThanOrEqual(r.body.data.tarjetas.estudiantes);
    });
    it('trae las series que usa el panel', async () => {
        const r = await request(app).get('/api/dashboard').set(auth('admin')).expect(200);
        expect(Array.isArray(r.body.data.porNivel)).toBe(true);
        expect(Array.isArray(r.body.data.porAsignatura)).toBe(true);
        expect(Array.isArray(r.body.data.topEstudiantes)).toBe(true);
        expect(Array.isArray(r.body.data.ultimasMatriculas)).toBe(true);
        expect(Array.isArray(r.body.data.ingresos)).toBe(true);
        expect(r.body.data.estadoPagos.total).toBeGreaterThanOrEqual(0);
    });
    it('los ingresos se agrupan por mes YYYY-MM y con orden_pago', async () => {
        const r = await request(app).get('/api/dashboard').set(auth('admin')).expect(200);
        for (const mes of r.body.data.ingresos) {
            expect(mes.mes).toMatch(/^\d{4}-\d{2}$/);
            expect(mes.ordenes).toBeGreaterThan(0);
        }
    });
    it('el promedio por asignatura es un porcentaje, no el puntaje crudo', async () => {
        const r = await request(app).get('/api/dashboard').set(auth('admin')).expect(200);
        for (const fila of r.body.data.porAsignatura) {
            expect(fila.promedio).toBeLessThanOrEqual(100);
            expect(fila.promedio).toBeGreaterThanOrEqual(0);
        }
    });
});
describe('rutas inexistentes', () => {
    it('responde 404 en JSON, no la página de HTML de Express', async () => {
        const r = await request(app).get('/api/no-existe').set(auth('admin')).expect(404);
        expect(r.headers['content-type']).toMatch(/application\/json/);
        expect(r.body.error.code).toBe('NOT_FOUND');
    });
});
//# sourceMappingURL=api.integration.test.js.map