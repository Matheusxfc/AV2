import { EstadoFisico, PrismaClient, StatusRastreamento } from '@prisma/client';
import { exigeJustificativa, calcularDepreciacao, quedaDeEstado, triagemConcluida, validarTransicaoStatus } from '../domain/regras';
import { NaoEncontradoError, RegraNegocioError } from '../shared/errors';
import { Pagina, conferirVersao, exigirAtualizacao, num, resposta } from '../shared/util';
import { EquipamentoRepository, FiltroEquipamento } from '../repositories/EquipamentoRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { MovimentacaoRepository } from '../repositories/MovimentacaoRepository';
import { Ator } from './ator';
import { ParametroService } from './ParametroService';

export class EquipamentoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly equipamentos: EquipamentoRepository,
    private readonly lotes: LoteRepository,
    private readonly movimentacoes: MovimentacaoRepository,
    private readonly journal: JournalRepository,
    private readonly parametros: ParametroService,
  ) {}

  async listar(filtro: FiltroEquipamento, p: Pagina) {
    const { dados, total } = await this.equipamentos.listar(filtro, p.skip, p.take);
    return resposta(dados, total, p);
  }

  async obter(id: string) {
    const e = await this.equipamentos.porIdComLote(id);
    if (!e) throw new NaoEncontradoError('Equipamento', id);
    return e;
  }

  /** Rastreabilidade completa: equipamento + lote de origem + movimentacoes + trilha de auditoria. */
  async rastrear(id: string) {
    const e = await this.equipamentos.porIdComHistorico(id);
    if (!e) throw new NaoEncontradoError('Equipamento', id);
    const { movimentacoes, lote, ...equipamento } = e;
    const auditoria = await this.journal.listar({ entidade: 'Equipamento', entidadeId: id }, 0, 100);
    return { equipamento, lote, historicoMovimentacao: movimentacoes, auditoria: auditoria.dados };
  }

  /** Regra: queda de 2+ categorias exige justificativa textual. */
  async alterarEstado(
    id: string,
    d: { novoEstado: EstadoFisico; justificativa?: string; versao?: number },
    ator: Ator,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const equipRepo = this.equipamentos.com(tx);
      const atual = await equipRepo.porId(id);
      if (!atual) throw new NaoEncontradoError('Equipamento', id);
      conferirVersao(d.versao, atual.versao, 'Equipamento', id);

      if (atual.statusRastreamento === 'BAIXA_DEFINITIVA') {
        throw new RegraNegocioError('Equipamento com BAIXA_DEFINITIVA nao pode ser alterado.');
      }
      if (atual.estadoFisico === d.novoEstado) {
        throw new RegraNegocioError(`O equipamento ja esta no estado fisico ${d.novoEstado}.`);
      }
      if (exigeJustificativa(atual.estadoFisico, d.novoEstado) && !d.justificativa?.trim()) {
        throw new RegraNegocioError(
          `Justificativa obrigatoria: o estado caiu ${quedaDeEstado(atual.estadoFisico, d.novoEstado)} categorias (${atual.estadoFisico} -> ${d.novoEstado}).`,
        );
      }

      const r = await equipRepo.atualizarSeVersao(id, atual.versao, { estadoFisico: d.novoEstado });
      exigirAtualizacao(r.count, 'Equipamento', id);
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Equipamento',
        entidadeId: id,
        dadosAntes: { estadoFisico: atual.estadoFisico },
        dadosDepois: { estadoFisico: d.novoEstado, justificativa: d.justificativa ?? null },
        usuarioResponsavel: ator.usuario,
      });
    });
    return this.obter(id);
  }

  /**
   * Atualiza o status de rastreamento seguindo a maquina de estados do dominio.
   * Em UMA transacao: status do equipamento + Movimentacao + (se for o caso) conclusao
   * automatica da triagem do lote + journal. O lote e travado (FOR UPDATE) para que duas
   * requisicoes simultaneas em equipamentos do mesmo lote nao deixem o lote "preso" em EM_TRIAGEM.
   */
  async alterarStatus(
    id: string,
    d: { novoStatus: StatusRastreamento; justificativa?: string; versao?: number },
    ator: Ator,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const equipRepo = this.equipamentos.com(tx);
      const loteRepo = this.lotes.com(tx);

      const previa = await equipRepo.porId(id);
      if (!previa) throw new NaoEncontradoError('Equipamento', id);
      await loteRepo.travar(previa.loteId);

      // Relê apos o lock para decidir com o estado mais recente.
      const atual = (await equipRepo.porId(id))!;
      const lote = (await loteRepo.porId(atual.loteId))!;
      conferirVersao(d.versao, atual.versao, 'Equipamento', id);

      if (lote.statusProcessamento === 'RECEBIDO') {
        throw new RegraNegocioError('Inicie a triagem do lote (POST /lotes/:id/triagem) antes de alterar o status de equipamentos.');
      }
      const erro = validarTransicaoStatus(atual.statusRastreamento, d.novoStatus);
      if (erro) throw new RegraNegocioError(erro);

      const r = await equipRepo.atualizarSeVersao(id, atual.versao, { statusRastreamento: d.novoStatus });
      exigirAtualizacao(r.count, 'Equipamento', id);
      await this.movimentacoes.com(tx).criar({
        equipamentoId: id,
        origem: atual.statusRastreamento,
        destino: d.novoStatus,
        responsavel: ator.usuario,
        observacao: d.justificativa ?? '',
      });
      const journal = this.journal.com(tx);
      await journal.registrar({
        operacao: 'UPDATE',
        entidade: 'Equipamento',
        entidadeId: id,
        dadosAntes: { statusRastreamento: atual.statusRastreamento },
        dadosDepois: { statusRastreamento: d.novoStatus, justificativa: d.justificativa ?? null },
        usuarioResponsavel: ator.usuario,
      });

      // Conclusao automatica da triagem do lote.
      if (lote.statusProcessamento === 'EM_TRIAGEM') {
        const statuses = (await equipRepo.statusDoLote(lote.id)).map((e) => e.statusRastreamento);
        if (triagemConcluida(statuses)) {
          const rl = await loteRepo.atualizarSeVersao(lote.id, lote.versao, { statusProcessamento: 'TRIAGEM_CONCLUIDA' });
          exigirAtualizacao(rl.count, 'Lote', lote.id);
          await journal.registrar({
            operacao: 'UPDATE',
            entidade: 'Lote',
            entidadeId: lote.id,
            dadosAntes: { statusProcessamento: 'EM_TRIAGEM' },
            dadosDepois: { statusProcessamento: 'TRIAGEM_CONCLUIDA', motivo: 'todos os equipamentos triados' },
            usuarioResponsavel: ator.usuario,
          });
        }
      }
    });
    return this.obter(id);
  }

  /** Movimentacao fisica livre (ex.: "Bancada de desmonte 3"). Origem = ultimo destino conhecido. */
  async registrarMovimentacao(id: string, d: { destino: string; observacao?: string }, ator: Ator) {
    return this.prisma.$transaction(async (tx) => {
      const atual = await this.equipamentos.com(tx).porId(id);
      if (!atual) throw new NaoEncontradoError('Equipamento', id);
      if (atual.statusRastreamento === 'BAIXA_DEFINITIVA') {
        throw new RegraNegocioError('Equipamento com BAIXA_DEFINITIVA nao pode ser movimentado.');
      }
      const movs = this.movimentacoes.com(tx);
      const ultima = await movs.ultima(id);
      const mov = await movs.criar({
        equipamentoId: id,
        origem: ultima?.destino ?? atual.statusRastreamento,
        destino: d.destino,
        responsavel: ator.usuario,
        observacao: d.observacao ?? '',
      });
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Movimentacao',
        entidadeId: mov.id,
        dadosDepois: mov,
        usuarioResponsavel: ator.usuario,
      });
      return mov;
    });
  }

  /** Depreciacao linear usando o coeficiente global configurado pelo ADMINISTRADOR. */
  async depreciacao(id: string, valorOriginal: number) {
    const e = await this.equipamentos.porId(id);
    if (!e) throw new NaoEncontradoError('Equipamento', id);
    const coeficiente = await this.parametros.obter('coeficienteDepreciacaoAnual');
    return {
      equipamentoId: id,
      codigoBarrasInterno: e.codigoBarrasInterno,
      anoFabricacao: e.anoFabricacao,
      coeficienteDepreciacaoAnual: coeficiente,
      valorOriginal,
      valorResidual: calcularDepreciacao(e.anoFabricacao, coeficiente, valorOriginal),
      pesoQuilogramas: num(e.pesoQuilogramas),
    };
  }
}
