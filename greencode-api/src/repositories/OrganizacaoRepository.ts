import { Prisma } from '@prisma/client';
import { Db } from '../infra/prisma';

export interface FiltroOrganizacao {
  ativo?: boolean;
  cnpj?: string;
  busca?: string;
}

export class OrganizacaoRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): OrganizacaoRepository {
    return new OrganizacaoRepository(tx);
  }

  /** Eager loading do contrato (relacao 1:1 opcional). */
  porId(id: string) {
    return this.db.organizacao.findUnique({ where: { id }, include: { contrato: true } });
  }
  porCnpj(cnpj: string) {
    return this.db.organizacao.findUnique({ where: { cnpj } });
  }
  async listar(filtro: FiltroOrganizacao, skip: number, take: number) {
    const where: Prisma.OrganizacaoWhereInput = {
      ...(filtro.ativo !== undefined ? { ativo: filtro.ativo } : {}),
      ...(filtro.cnpj ? { cnpj: filtro.cnpj } : {}),
      ...(filtro.busca ? { razaoSocial: { contains: filtro.busca, mode: 'insensitive' } } : {}),
    };
    const [dados, total] = await Promise.all([
      this.db.organizacao.findMany({ where, skip, take, orderBy: { razaoSocial: 'asc' }, include: { contrato: true } }),
      this.db.organizacao.count({ where }),
    ]);
    return { dados, total };
  }
  criar(data: Prisma.OrganizacaoCreateInput) {
    return this.db.organizacao.create({ data, include: { contrato: true } });
  }
  atualizarSeVersao(id: string, versao: number, data: Prisma.OrganizacaoUpdateManyMutationInput) {
    return this.db.organizacao.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
  }
}
