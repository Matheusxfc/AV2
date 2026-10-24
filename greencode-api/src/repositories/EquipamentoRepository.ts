import { randomUUID } from 'crypto';
import { EstadoFisico, Prisma, StatusRastreamento, TipoEquipamento } from '@prisma/client';
import { Db } from '../infra/prisma';
import { gerarCodigoBarras } from '../domain/regras';

export interface FiltroEquipamento {
  loteId?: string;
  status?: StatusRastreamento;
  tipo?: TipoEquipamento;
  estado?: EstadoFisico;
  codigo?: string;
}

export interface DadosNovoEquipamento {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
}

export class EquipamentoRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): EquipamentoRepository {
    return new EquipamentoRepository(tx);
  }

  porId(id: string) {
    return this.db.equipamento.findUnique({ where: { id } });
  }
  porIdComLote(id: string) {
    return this.db.equipamento.findUnique({
      where: { id },
      include: { lote: { select: { id: true, statusProcessamento: true, organizacaoId: true, notaFiscal: true } } },
    });
  }
  /** Equipamento + movimentacoes em ordem cronologica (rastreabilidade completa). */
  porIdComHistorico(id: string) {
    return this.db.equipamento.findUnique({
      where: { id },
      include: {
        lote: { select: { id: true, notaFiscal: true, transportadora: true, dataEntrada: true, organizacaoId: true } },
        movimentacoes: { orderBy: { dataHora: 'asc' } },
      },
    });
  }
  async listar(filtro: FiltroEquipamento, skip: number, take: number) {
    const where: Prisma.EquipamentoWhereInput = {
      ...(filtro.loteId ? { loteId: filtro.loteId } : {}),
      ...(filtro.status ? { statusRastreamento: filtro.status } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.estado ? { estadoFisico: filtro.estado } : {}),
      ...(filtro.codigo ? { codigoBarrasInterno: filtro.codigo } : {}),
    };
    const [dados, total] = await Promise.all([
      this.db.equipamento.findMany({ where, skip, take, orderBy: { sequencia: 'asc' } }),
      this.db.equipamento.count({ where }),
    ]);
    return { dados, total };
  }
  statusDoLote(loteId: string) {
    return this.db.equipamento.findMany({ where: { loteId }, select: { statusRastreamento: true } });
  }
  listarDoLote(loteId: string) {
    return this.db.equipamento.findMany({ where: { loteId }, orderBy: { posicaoNoLote: 'asc' } });
  }
  porStatus(status: StatusRastreamento) {
    return this.db.equipamento.findMany({
      where: { statusRastreamento: status },
      orderBy: { sequencia: 'asc' },
      include: { lote: { select: { id: true, organizacaoId: true } } },
    });
  }
  contarPorStatus() {
    return this.db.equipamento.groupBy({ by: ['statusRastreamento'], _count: { _all: true } });
  }

  /**
   * Cria o equipamento e define o codigoBarrasInterno a partir da coluna "sequencia" (autoincrement
   * do PostgreSQL), o que garante codigo UNICO mesmo com requisicoes concorrentes.
   * Deve ser chamado dentro de uma transacao (duas escritas: insert provisorio + update do codigo).
   */
  async criarNoLote(loteId: string, posicao: number, d: DadosNovoEquipamento) {
    const provisorio = await this.db.equipamento.create({
      data: {
        codigoBarrasInterno: `PENDENTE-${randomUUID()}`,
        tipo: d.tipo,
        marca: d.marca,
        modelo: d.modelo,
        anoFabricacao: d.anoFabricacao,
        estadoFisico: d.estadoFisico,
        pesoQuilogramas: d.pesoQuilogramas,
        loteId,
        posicaoNoLote: posicao,
      },
    });
    return this.db.equipamento.update({
      where: { id: provisorio.id },
      data: { codigoBarrasInterno: gerarCodigoBarras(d.tipo, provisorio.sequencia) },
    });
  }

  atualizarSeVersao(id: string, versao: number, data: Prisma.EquipamentoUpdateManyMutationInput) {
    return this.db.equipamento.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
  }
  /** Inicio de triagem do lote: AGUARDANDO_TRIAGEM -> EM_TRIAGEM em massa (incrementa versao). */
  iniciarTriagemDoLote(loteId: string) {
    return this.db.equipamento.updateMany({
      where: { loteId, statusRastreamento: 'AGUARDANDO_TRIAGEM' },
      data: { statusRastreamento: 'EM_TRIAGEM', versao: { increment: 1 } },
    });
  }
}
