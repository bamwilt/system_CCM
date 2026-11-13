import { getPool } from '../config/database';

export interface AuditoriaFiltro {
  accion?: string;
  entidad?: string;
  entidadId?: number;
  usuarioId?: number;
  desde?: string;
  hasta?: string;
  limite?: number;
}

export class AuditoriaRepository {
  async listar(filtro: AuditoriaFiltro) {
    const pool = getPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filtro.accion) { conditions.push(`accion = $${i++}`); params.push(filtro.accion); }
    if (filtro.entidad) { conditions.push(`entidad = $${i++}`); params.push(filtro.entidad); }
    if (filtro.entidadId !== undefined) { conditions.push(`entidad_id = $${i++}`); params.push(filtro.entidadId); }
    if (filtro.usuarioId !== undefined) { conditions.push(`usuario_id = $${i++}`); params.push(filtro.usuarioId); }
    if (filtro.desde) { conditions.push(`fecha >= $${i++}::timestamptz`); params.push(filtro.desde); }
    if (filtro.hasta) { conditions.push(`fecha <= $${i++}::timestamptz`); params.push(filtro.hasta); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limite = Math.min(Math.max(filtro.limite ?? 100, 1), 500);
    params.push(limite);
    const sql = `SELECT id, usuario_id, accion, entidad, entidad_id, detalle, ip_address, fecha
                 FROM auditoria ${where} ORDER BY fecha DESC, id DESC LIMIT $${i}`;
    const res = await pool.query(sql, params);
    return res.rows;
  }
}
export const auditoriaRepository = new AuditoriaRepository();
