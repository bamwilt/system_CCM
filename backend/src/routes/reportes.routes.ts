import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import {
  requirePermission,
  AUTH_PERMISSIONS,
} from '../authorization/permissions';
import { reportesService } from '../services/reportes.service';

/**
 * ============================================================================
 * REPORTES Y CONSULTAS (FASE 8) — RUTAS DE SOLO LECTURA
 * ============================================================================
 *
 * Los ocho reportes candidatos del PM, verificados contra los requisitos:
 *   pagos por periodo, matriculas registradas, estudiantes con saldos
 *   pendientes, morosidad, recaudacion, historial individual (estado de
 *   cuenta), operaciones anuladas y movimientos por cajero.
 *
 * Todos son GET: esta fase no escribe. No hay exportacion: DEC-13 (formato,
 * campos personales, paginacion, corte horario, cierre) sigue PENDIENTE, y el
 * PM la condiciona a "cuando los requisitos lo contemplen".
 *
 * Todas las cifras vienen de registros almacenados; no se recalcula ningun
 * importe. Las operaciones anuladas se informan aparte, nunca se ocultan.
 */

const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/** Reportes: solo lectura. Exigen el permiso tecnico de lectura de reportes. */
const PERMISO = AUTH_PERMISSIONS.REPORTES_READ;

function errorDeConsulta(error: unknown, next: NextFunction): void {
  next(error);
}

// GET /api/reportes/pagos-por-periodo
router.get(
  '/pagos-por-periodo',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.pagosPorPeriodo({
        desde: req.query.desde,
        hasta: req.query.hasta,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/recaudacion?desde=&hasta=
router.get(
  '/recaudacion',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.recaudacionPorPeriodo({
        desde: req.query.desde,
        hasta: req.query.hasta,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/morosidad?fecha_corte=YYYY-MM-DD
router.get(
  '/morosidad',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sin fecha_corte NO se usa el reloj del servidor: se rechaza.
      const resultado = await reportesService.cuotasMorosas({
        fechaCorte: req.query.fecha_corte,
        moneda: req.query.moneda,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/estudiantes-pendientes?moneda=
router.get(
  '/estudiantes-pendientes',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.estudiantesConSaldosPendientes({
        moneda: req.query.moneda,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/movimientos-por-cajero?desde=&hasta=
router.get(
  '/movimientos-por-cajero',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.movimientosPorCajero({
        desde: req.query.desde,
        hasta: req.query.hasta,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/medios?desde=&hasta=
router.get(
  '/medios',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.desglosePorMedio({
        desde: req.query.desde,
        hasta: req.query.hasta,
      });
      res.status(200).json({ medios: resultado });
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/operaciones-anuladas?desde=&hasta=
router.get(
  '/operaciones-anuladas',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.operacionesAnuladas({
        desde: req.query.desde,
        hasta: req.query.hasta,
        limite: req.query.limite,
        compensar: req.query.compensar,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/estado-cuenta/:estudianteId
router.get(
  '/estado-cuenta/:estudianteId',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.estadoDeCuenta({
        estudianteId: req.params.estudianteId,
      });
      res.status(200).json(resultado);
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

// GET /api/reportes/matriculas-registradas?agrupacion=anio|grado
router.get(
  '/matriculas-registradas',
  requireAuth,
  requirePermission(PERMISO),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await reportesService.matriculasRegistradas({
        agrupacion: req.query.agrupacion,
      });
      res.status(200).json({ grupos: resultado });
    } catch (error) {
      errorDeConsulta(error, next);
    }
  }
);

export default router;
