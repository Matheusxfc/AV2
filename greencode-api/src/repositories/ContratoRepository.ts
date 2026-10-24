import { Prisma } from '@prisma/client';
import { Db } from '../infra/prisma';

export class ContratoRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): ContratoRepository {
    return new ContratoRepository(tx);
  }

  porOrganizacao(organizacaoId: string) {
    return this.db.contrato.findUnique({ where: { organizacaoId } });
  }
  porOrganizacoes(ids: string[]) {
    return this.db.contrato.findMany({ where: { organizacaoId: { in: ids } } });
  }
  criar(data: Prisma.ContratoUncheckedCreateInput) {
    return this.db.contrato.create({ data });
  }
  atualizarSeVersao(id: string, versao: number, data: Prisma.ContratoUpdateManyMutationInput) {
    return this.db.contrato.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
  }
}
