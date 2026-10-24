import { Db } from '../infra/prisma';

export interface NovaMovimentacao {
  equipamentoId: string;
  origem: string;
  destino: string;
  responsavel: string;
  observacao?: string;
}

export class MovimentacaoRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): MovimentacaoRepository {
    return new MovimentacaoRepository(tx);
  }

  ultima(equipamentoId: string) {
    return this.db.movimentacao.findFirst({ where: { equipamentoId }, orderBy: { dataHora: 'desc' } });
  }
  criar(m: NovaMovimentacao) {
    return this.db.movimentacao.create({ data: { ...m, observacao: m.observacao ?? '' } });
  }
  criarVarias(lista: NovaMovimentacao[]) {
    return this.db.movimentacao.createMany({ data: lista.map((m) => ({ ...m, observacao: m.observacao ?? '' })) });
  }
}
