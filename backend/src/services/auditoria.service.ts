import { auditoriaRepository, AuditoriaFiltro } from '../repositories/auditoria.repository';

export class AuditoriaService {
  async listar(filtro: AuditoriaFiltro) {
    return auditoriaRepository.listar(filtro);
  }
}
export const auditoriaService = new AuditoriaService();
