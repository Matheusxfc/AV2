import { Prisma } from '@prisma/client';
import { Db } from '../infra/prisma';

export class UsuarioRepository {
  constructor(private readonly db: Db) {}
  /** Devolve uma instancia ligada a transacao informada. */
  com(tx: Db): UsuarioRepository {
    return new UsuarioRepository(tx);
  }

  porId(id: string) {
    return this.db.usuario.findUnique({ where: { id } });
  }
  porNome(usuario: string) {
    return this.db.usuario.findUnique({ where: { usuario } });
  }
  async listar(skip: number, take: number) {
    const [dados, total] = await Promise.all([
      this.db.usuario.findMany({ skip, take, orderBy: { criadoEm: 'asc' } }),
      this.db.usuario.count(),
    ]);
    return { dados, total };
  }
  criar(data: Prisma.UsuarioCreateInput) {
    return this.db.usuario.create({ data });
  }
  /** UPDATE condicionado a versao (bloqueio otimista). Retorna { count }. */
  atualizarSeVersao(id: string, versao: number, data: Prisma.UsuarioUpdateManyMutationInput) {
    return this.db.usuario.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
  }
  registrarAcesso(id: string) {
    return this.db.usuario.update({ where: { id }, data: { ultimoAcesso: new Date() } });
  }
}
