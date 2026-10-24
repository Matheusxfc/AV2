import { StatusRastreamento } from '@prisma/client';
import { NaoEncontradoError } from '../shared/errors';
import { num } from '../shared/util';
import { ContratoRepository } from '../repositories/ContratoRepository';
import { EquipamentoRepository } from '../repositories/EquipamentoRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';

const arred = (n: number) => Number(n.toFixed(3));

export class RelatorioService {
  constructor(
    private readonly organizacoes: OrganizacaoRepository,
    private readonly lotes: LoteRepository,
    private readonly equipamentos: EquipamentoRepository,
    private readonly contratos: ContratoRepository,
  ) {}

  async porOrganizacao(organizacaoId: string, inicio: Date, fim: Date) {
    const org = await this.organizacoes.porId(organizacaoId);
    if (!org) throw new NaoEncontradoError('Organizacao', organizacaoId);
    const lotes = await this.lotes.periodoComEquipamentos(inicio, fim, organizacaoId);

    const detalhe = lotes.map((l) => ({
      loteId: l.id,
      notaFiscal: l.notaFiscal,
      dataEntrada: l.dataEntrada,
      status: l.statusProcessamento,
      equipamentos: l.equipamentos.length,
      pesoQuilogramas: arred(l.equipamentos.reduce((s, e) => s + num(e.pesoQuilogramas), 0)),
    }));
    return {
      organizacao: { id: org.id, razaoSocial: org.razaoSocial, cnpj: org.cnpj },
      periodo: { inicio, fim },
      totalLotes: detalhe.length,
      totalEquipamentos: detalhe.reduce((s, l) => s + l.equipamentos, 0),
      pesoTotalQuilogramas: arred(detalhe.reduce((s, l) => s + l.pesoQuilogramas, 0)),
      lotes: detalhe,
    };
  }

  /** Sem status: resumo (contagem por status). Com status: lista de equipamentos naquele status. */
  async resumoPorStatus() {
    const grupos = await this.equipamentos.contarPorStatus();
    return grupos.map((g) => ({ status: g.statusRastreamento, quantidade: g._count._all }));
  }

  async porStatus(status: StatusRastreamento) {
    const lista = await this.equipamentos.porStatus(status);
    return {
      status,
      total: lista.length,
      pesoTotalQuilogramas: arred(lista.reduce((s, e) => s + num(e.pesoQuilogramas), 0)),
      equipamentos: lista.map((e) => ({
        id: e.id,
        codigoBarrasInterno: e.codigoBarrasInterno,
        tipo: e.tipo,
        marca: e.marca,
        modelo: e.modelo,
        estadoFisico: e.estadoFisico,
        loteId: e.loteId,
      })),
    };
  }

  async financeiro(inicio: Date, fim: Date) {
    const lotes = await this.lotes.periodoComEquipamentos(inicio, fim);
    const orgIds = [...new Set(lotes.map((l) => l.organizacaoId))];
    const contratos = orgIds.length ? await this.contratos.porOrganizacoes(orgIds) : [];
    const agora = Date.now();

    const porTipo: Record<string, { quantidade: number; pesoQuilogramas: number }> = {};
    let pesoTotal = 0;
    for (const l of lotes) {
      for (const e of l.equipamentos) {
        const p = num(e.pesoQuilogramas);
        pesoTotal += p;
        porTipo[e.tipo] ??= { quantidade: 0, pesoQuilogramas: 0 };
        porTipo[e.tipo].quantidade += 1;
        porTipo[e.tipo].pesoQuilogramas = arred(porTipo[e.tipo].pesoQuilogramas + p);
      }
    }
    const vigentes = contratos.filter((c) => c.dataVencimento.getTime() >= agora);
    return {
      periodo: { inicio, fim },
      organizacoesNoPeriodo: orgIds.length,
      lotesProcessados: lotes.length,
      pesoTotalQuilogramas: arred(pesoTotal),
      equipamentosPorTipo: porTipo,
      contratosVigentes: vigentes.length,
      receitaContratualMensalEstimada: Number(vigentes.reduce((s, c) => s + num(c.valorMensal), 0).toFixed(2)),
    };
  }
}
