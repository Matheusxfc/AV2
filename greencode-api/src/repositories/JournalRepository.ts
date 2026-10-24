import { Prisma } from '@prisma/client';
import { Db } from '../infra/prisma';
import { paraJson } from '../shared/util';

export interface EntradaJournal {
  operacao: string; // CREATE | UPDATE | DELETE | LOGIN | ...
  entidade: string;
  entidadeId?: string;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
  usuarioResponsavel: string;
}

export interface FiltroJournal {
  entidade?: string;
  entidadeId?: string;
  usuario?: string;
  operacao?: string;
  inicio?: Date;
  fim?: Date;
}

const jsonOuNulo = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : paraJson(v));

export class JournalRepository {
  constructor(private readonly db: Db) {}
  /** Use com a transacao da operacao de negocio: journal e dados confirmam (ou falham) juntos. */
  com(tx: Db): JournalRepository {
    return new JournalRepository(tx);
  }

  registrar(e: EntradaJournal) {
    return this.db.journalTransacao.create({
      data: {
        operacao: e.operacao,
        entidade: e.entidade,
        entidadeId: e.entidadeId ?? null,
        dadosAntes: jsonOuNulo(e.dadosAntes),
        dadosDepois: jsonOuNulo(e.dadosDepois),
        usuarioResponsavel: e.usuarioResponsavel,
      },
    });
  }

  async listar(filtro: FiltroJournal, skip: number, take: number) {
    const where: Prisma.JournalTransacaoWhereInput = {
      ...(filtro.entidade ? { entidade: filtro.entidade } : {}),
      ...(filtro.entidadeId ? { entidadeId: filtro.entidadeId } : {}),
      ...(filtro.usuario ? { usuarioResponsavel: filtro.usuario } : {}),
      ...(filtro.operacao ? { operacao: filtro.operacao } : {}),
      ...(filtro.inicio || filtro.fim
        ? { timestamp: { ...(filtro.inicio ? { gte: filtro.inicio } : {}), ...(filtro.fim ? { lte: filtro.fim } : {}) } }
        : {}),
    };
    const [dados, total] = await Promise.all([
      this.db.journalTransacao.findMany({ where, skip, take, orderBy: { timestamp: 'desc' } }),
      this.db.journalTransacao.count({ where }),
    ]);
    return { dados, total };
  }
}
