import { Prisma, StatusLote } from '@prisma/client';
import { Db } from '../infra/prisma';

export interface FiltroLote {
  organizacaoId?: string;
  status?: StatusLote;
  inicio?: Date;
  fim?: Date;
}

export class LoteRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): LoteRepository {
    return new LoteRepository(tx);
  }

  porId(id: string) {
    return this.db.lote.findUnique({ where: { id } });
  }
  /** Eager loading: lote + organizacao + equipamentos (ordenados pela posicao). */
  porIdCompleto(id: string) {
    return this.db.lote.findUnique({
      where: { id },
      include: {
        organizacao: { select: { id: true, razaoSocial: true, cnpj: true } },
        equipamentos: { orderBy: { posicaoNoLote: 'asc' } },
      },
    });
  }
  async listar(filtro: FiltroLote, skip: number, take: number) {
    const where: Prisma.LoteWhereInput = {
      ...(filtro.organizacaoId ? { organizacaoId: filtro.organizacaoId } : {}),
      ...(filtro.status ? { statusProcessamento: filtro.status } : {}),
      ...(filtro.inicio || filtro.fim
        ? { dataEntrada: { ...(filtro.inicio ? { gte: filtro.inicio } : {}), ...(filtro.fim ? { lte: filtro.fim } : {}) } }
        : {}),
    };
    const [dados, total] = await Promise.all([
      this.db.lote.findMany({
        where,
        skip,
        take,
        orderBy: { dataEntrada: 'desc' },
        include: { _count: { select: { equipamentos: true } } },
      }),
      this.db.lote.count({ where }),
    ]);
    return { dados, total };
  }
  /** Todos os lotes do periodo (sem paginacao) com pesos - usado por relatorios. */
  periodoComEquipamentos(inicio: Date, fim: Date, organizacaoId?: string) {
    return this.db.lote.findMany({
      where: { dataEntrada: { gte: inicio, lte: fim }, ...(organizacaoId ? { organizacaoId } : {}) },
      orderBy: { dataEntrada: 'asc' },
      include: { equipamentos: { select: { pesoQuilogramas: true, tipo: true } } },
    });
  }
  criar(data: Prisma.LoteUncheckedCreateInput) {
    return this.db.lote.create({ data });
  }
  atualizarSeVersao(id: string, versao: number, data: Prisma.LoteUpdateManyMutationInput) {
    return this.db.lote.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
  }
  /**
   * Trava a linha do lote (SELECT ... FOR UPDATE) ate o fim da transacao.
   * Serializa operacoes concorrentes no MESMO lote (ex.: duas requisicoes concluindo a triagem
   * ou adicionando equipamentos ao mesmo tempo), evitando lote "preso" em EM_TRIAGEM
   * e conflitos na posicao dos equipamentos. So faz sentido dentro de $transaction.
   */
  async travar(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM "lotes" WHERE id = ${id}::uuid FOR UPDATE`;
  }
  async proximaPosicao(loteId: string): Promise<number> {
    const r = await this.db.equipamento.aggregate({ where: { loteId }, _max: { posicaoNoLote: true } });
    return (r._max.posicaoNoLote ?? 0) + 1;
  }
  contarAbertosPorOrganizacao(organizacaoId: string) {
    return this.db.lote.count({ where: { organizacaoId, statusProcessamento: { not: 'FINALIZADO' } } });
  }
}
