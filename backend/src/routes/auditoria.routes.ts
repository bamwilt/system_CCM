import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission, AUTH_PERMISSIONS } from '../authorization/permissions';
import { auditoriaService } from '../services/auditoria.service';

const router = Router();
router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.AUDITORIA_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await auditoriaService.listar({
        accion: req.query.accion as string | undefined,
        entidad: req.query.entidad as string | undefined,
        entidadId: req.query.entidadId ? Number(req.query.entidadId) : undefined,
        usuarioId: req.query.usuarioId ? Number(req.query.usuarioId) : undefined,
        desde: req.query.desde as string | undefined,
        hasta: req.query.hasta as string | undefined,
        limite: req.query.limite ? Number(req.query.limite) : undefined,
      });
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
