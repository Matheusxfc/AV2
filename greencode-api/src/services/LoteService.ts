import { PrismaClient, StatusLote } from '@prisma/client';
import { transicaoLoteManualPermitida } from '../domain/regras';
import { ValidadorDataEntrada } from '../domain/validadores/ValidadorDataEntrada';
import { NaoEncontradoError, RegraNegocioError } from '../shared/errors';
import { Pagina, conferirVersao, exigirAtualizacao, parseData, resposta } from '../shared/util';
import { EquipamentoRepository, DadosNovoEquipamento } from '../repositories/EquipamentoRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { FiltroLote, LoteRepository } from '../repositories/LoteRepository';
import { MovimentacaoRepository } from '../repositories/MovimentacaoRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { Ator } from './ator';

export interface DadosNovoLote {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  /** Opcional: padrao = agora. Aceita AAAA-MM-DD ou ISO. */
  dataEntrada?: string;
  observacoes?: string;
  /** Opcional: cria o lote JA com equipamentos, em uma unica transacao. */
  equipamentos?: DadosNovoEquipamento[];
}

export class LoteService {
  private readonly validadorData = new ValidadorDataEntrada();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly lotes: LoteRepository,
    private readonly equipamentos: EquipamentoRepository,
    private readonly movimentacoes: MovimentacaoRepository,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly journal: JournalRepository,
  ) {}

  /**
   * Cria o lote (+ equipamentos + movimentacoes de recebimento + journal) em UMA transacao:
   * se qualquer equipamento falhar, nada e persistido (integridade referencial).
   */
  async criar(d: DadosNovoLote, ator: Ator) {
    const data = d.dataEntrada ? parseData(d.dataEntrada, 'dataEntrada') : new Date();
    if (!this.validadorData.validar(data)) throw new RegraNegocioError(this.validadorData.obterMensagemErro());

    const org = await this.organizacoes.porId(d.organizacaoId);
    if (!org) throw new NaoEncontradoError('Organizacao', d.organizacaoId);
    if (!org.ativo) throw new RegraNegocioError('Organizacao desativada nao pode enviar lotes.');

    const loteId = await this.prisma.$transaction(async (tx) => {
      const lote = await this.lotes.com(tx).criar({
        dataEntrada: data,
        organizacaoId: d.organizacaoId,
        notaFiscal: d.notaFiscal,
        transportadora: d.transportadora,
        observacoes: d.observacoes ?? '',
      });

      const equipRepo = this.equipamentos.com(tx);
      const criados = [];
      for (const [i, eq] of (d.equipamentos ?? []).entries()) {
        criados.push(await equipRepo.criarNoLote(lote.id, i + 1, eq));
      }
      if (criados.length > 0) {
        await this.movimentacoes.com(tx).criarVarias(
          criados.map((e) => ({
            equipamentoId: e.id,
            origem: `ORGANIZACAO: ${org.razaoSocial}`,
            destino: 'RECEBIMENTO (AGUARDANDO_TRIAGEM)',
            responsavel: ator.usuario,
            observacao: `Lote ${lote.notaFiscal} / ${lote.transportadora}`,
          })),
        );
      }
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Lote',
        entidadeId: lote.id,
        dadosDepois: { ...lote, equipamentos: criados.map((e) => e.codigoBarrasInterno) },
        usuarioResponsavel: ator.usuario,
      });
      return lote.id;
    });
    return this.obter(loteId);
  }

  async listar(filtro: FiltroLote, p: Pagina) {
    const { dados, total } = await this.lotes.listar(filtro, p.skip, p.take);
    return resposta(dados, total, p);
  }

  async obter(id: string) {
    const lote = await this.lotes.porIdCompleto(id);
    if (!lote) throw new NaoEncontradoError('Lote', id);
    return lote;
  }

  async adicionarEquipamento(loteId: string, eq: DadosNovoEquipamento, ator: Ator) {
    return this.prisma.$transaction(async (tx) => {
      const lotes = this.lotes.com(tx);
      await lotes.travar(loteId);
      const lote = await lotes.porId(loteId);
      if (!lote) throw new NaoEncontradoError('Lote', loteId);
      if (lote.statusProcessamento !== 'RECEBIDO') {
        throw new RegraNegocioError(`So e possivel adicionar equipamentos a lotes RECEBIDO (status atual: ${lote.statusProcessamento}).`);
      }

      const posicao = await lotes.proximaPosicao(loteId);
      const criado = await this.equipamentos.com(tx).criarNoLote(loteId, posicao, eq);
      await this.movimentacoes.com(tx).criar({
        equipamentoId: criado.id,
        origem: 'RECEBIMENTO',
        destino: 'AGUARDANDO_TRIAGEM',
        responsavel: ator.usuario,
        observacao: `Equipamento ${criado.codigoBarrasInterno} registrado no lote`,
      });
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Equipamento',
        entidadeId: criado.id,
        dadosDepois: criado,
        usuarioResponsavel: ator.usuario,
      });
      return criado;
    });
  }

  /** RECEBIDO -> EM_TRIAGEM; todos os equipamentos AGUARDANDO_TRIAGEM -> EM_TRIAGEM (atomico). */
  async iniciarTriagem(loteId: string, versao: number | undefined, ator: Ator) {
    await this.prisma.$transaction(async (tx) => {
      const lotes = this.lotes.com(tx);
      await lotes.travar(loteId);
      const lote = await lotes.porId(loteId);
      if (!lote) throw new NaoEncontradoError('Lote', loteId);
      conferirVersao(versao, lote.versao, 'Lote', loteId);
      if (lote.statusProcessamento !== 'RECEBIDO') {
        throw new RegraNegocioError(`A triagem so pode ser iniciada em lotes RECEBIDO (status atual: ${lote.statusProcessamento}).`);
      }

      const equipRepo = this.equipamentos.com(tx);
      const lista = await equipRepo.listarDoLote(loteId);
      if (lista.length === 0) throw new RegraNegocioError('Nao e possivel iniciar triagem de um lote sem equipamentos.');

      const r = await lotes.atualizarSeVersao(loteId, lote.versao, { statusProcessamento: 'EM_TRIAGEM' });
      exigirAtualizacao(r.count, 'Lote', loteId);
      await equipRepo.iniciarTriagemDoLote(loteId);
      await this.movimentacoes.com(tx).criarVarias(
        lista.map((e) => ({
          equipamentoId: e.id,
          origem: 'AGUARDANDO_TRIAGEM',
          destino: 'EM_TRIAGEM',
          responsavel: ator.usuario,
          observacao: 'Triagem do lote iniciada',
        })),
      );
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Lote',
        entidadeId: loteId,
        dadosAntes: { statusProcessamento: lote.statusProcessamento },
        dadosDepois: { statusProcessamento: 'EM_TRIAGEM', equipamentos: lista.length },
        usuarioResponsavel: ator.usuario,
      });
    });
    return this.obter(loteId);
  }

  /** Avancos manuais: TRIAGEM_CONCLUIDA -> ENCAMINHADO -> FINALIZADO. */
  async avancarStatus(loteId: string, novo: StatusLote, versao: number | undefined, ator: Ator) {
    await this.prisma.$transaction(async (tx) => {
      const lotes = this.lotes.com(tx);
      await lotes.travar(loteId);
      const lote = await lotes.porId(loteId);
      if (!lote) throw new NaoEncontradoError('Lote', loteId);
      conferirVersao(versao, lote.versao, 'Lote', loteId);

      if (!transicaoLoteManualPermitida(lote.statusProcessamento, novo)) {
        throw new RegraNegocioError(
          `Transicao de lote invalida: ${lote.statusProcessamento} -> ${novo}. ` +
            'RECEBIDO->EM_TRIAGEM e EM_TRIAGEM->TRIAGEM_CONCLUIDA sao automaticos; manual: TRIAGEM_CONCLUIDA->ENCAMINHADO->FINALIZADO.',
        );
      }
      if (novo === 'FINALIZADO') {
        const pendentes = (await this.equipamentos.com(tx).listarDoLote(loteId)).filter(
          (e) => e.statusRastreamento !== 'BAIXA_DEFINITIVA',
        );
        if (pendentes.length > 0) {
          throw new RegraNegocioError(`Lote so pode ser FINALIZADO quando todos os equipamentos estiverem em BAIXA_DEFINITIVA (pendentes: ${pendentes.length}).`);
        }
      }

      const r = await lotes.atualizarSeVersao(loteId, lote.versao, { statusProcessamento: novo });
      exigirAtualizacao(r.count, 'Lote', loteId);
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Lote',
        entidadeId: loteId,
        dadosAntes: { statusProcessamento: lote.statusProcessamento },
        dadosDepois: { statusProcessamento: novo },
        usuarioResponsavel: ator.usuario,
      });
    });
    return this.obter(loteId);
  }
}
