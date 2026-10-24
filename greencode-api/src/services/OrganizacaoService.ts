import { PrismaClient } from '@prisma/client';
import { ValidadorCNPJ } from '../domain/validadores/ValidadorCNPJ';
import { ConflitoError, NaoEncontradoError, RegraNegocioError } from '../shared/errors';
import { Pagina, conferirVersao, exigirAtualizacao, parseData, resposta } from '../shared/util';
import { ContratoRepository } from '../repositories/ContratoRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { OrganizacaoRepository, FiltroOrganizacao } from '../repositories/OrganizacaoRepository';
import { Ator } from './ator';

export interface DadosContrato {
  dataVencimento: string;
  valorMensal: number;
  clausulas?: string[];
  renovacaoAutomatica?: boolean;
}

export interface DadosNovaOrganizacao {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  enderecoCompleto?: string;
  telefone?: string;
  email?: string;
  contrato?: DadosContrato;
}

export interface DadosAtualizacaoOrganizacao {
  razaoSocial?: string;
  inscricaoEstadual?: string;
  enderecoCompleto?: string;
  telefone?: string;
  email?: string;
  ativo?: boolean;
  versao?: number;
}

type ComContrato<T extends { contrato?: { dataVencimento: Date } | null }> = T;

/** Acrescenta "vigente" (calculado) ao contrato, como Contrato.estaVigente() do UML. */
function comVigencia<T extends { contrato?: { dataVencimento: Date } | null }>(org: ComContrato<T>) {
  return {
    ...org,
    contrato: org.contrato ? { ...org.contrato, vigente: org.contrato.dataVencimento.getTime() >= Date.now() } : null,
  };
}

export class OrganizacaoService {
  private readonly validadorCNPJ = new ValidadorCNPJ();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly contratos: ContratoRepository,
    private readonly lotes: LoteRepository,
    private readonly journal: JournalRepository,
  ) {}

  private validarContrato(c: DadosContrato): Date {
    const venc = parseData(c.dataVencimento, 'dataVencimento');
    if (venc.getTime() <= Date.now()) throw new RegraNegocioError('dataVencimento do contrato deve estar no futuro.');
    if (c.valorMensal < 0) throw new RegraNegocioError('valorMensal nao pode ser negativo.');
    return venc;
  }

  async criar(dados: DadosNovaOrganizacao, ator: Ator) {
    if (!this.validadorCNPJ.validar(dados.cnpj)) throw new RegraNegocioError(this.validadorCNPJ.obterMensagemErro());
    const cnpj = ValidadorCNPJ.normalizar(dados.cnpj);
    if (await this.organizacoes.porCnpj(cnpj)) {
      throw new ConflitoError(`Ja existe organizacao com o CNPJ ${ValidadorCNPJ.formatar(cnpj)}.`);
    }
    const venc = dados.contrato ? this.validarContrato(dados.contrato) : null;

    // Organizacao + contrato (opcional) + journal: tudo ou nada.
    const criada = await this.prisma.$transaction(async (tx) => {
      const org = await this.organizacoes.com(tx).criar({
        razaoSocial: dados.razaoSocial,
        cnpj,
        inscricaoEstadual: dados.inscricaoEstadual ?? '',
        enderecoCompleto: dados.enderecoCompleto ?? '',
        telefone: dados.telefone ?? '',
        email: dados.email ?? '',
        ...(dados.contrato && venc
          ? {
              contrato: {
                create: {
                  dataVencimento: venc,
                  valorMensal: dados.contrato.valorMensal,
                  clausulas: dados.contrato.clausulas ?? [],
                  renovacaoAutomatica: dados.contrato.renovacaoAutomatica ?? false,
                },
              },
            }
          : {}),
      });
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Organizacao',
        entidadeId: org.id,
        dadosDepois: org,
        usuarioResponsavel: ator.usuario,
      });
      return org;
    });
    return comVigencia(criada);
  }

  async listar(filtro: FiltroOrganizacao, p: Pagina) {
    const { dados, total } = await this.organizacoes.listar(filtro, p.skip, p.take);
    return resposta(dados.map(comVigencia), total, p);
  }

  async obter(id: string) {
    const org = await this.organizacoes.porId(id);
    if (!org) throw new NaoEncontradoError('Organizacao', id);
    return comVigencia(org);
  }

  async atualizar(id: string, d: DadosAtualizacaoOrganizacao, ator: Ator) {
    const { versao, ...campos } = d;
    const dados = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
    if (Object.keys(dados).length === 0) throw new RegraNegocioError('Nenhum campo para atualizar.');

    await this.prisma.$transaction(async (tx) => {
      const orgs = this.organizacoes.com(tx);
      const atual = await orgs.porId(id);
      if (!atual) throw new NaoEncontradoError('Organizacao', id);
      conferirVersao(versao, atual.versao, 'Organizacao', id);

      if (d.ativo === false && atual.ativo) {
        const abertos = await this.lotes.com(tx).contarAbertosPorOrganizacao(id);
        if (abertos > 0) {
          throw new ConflitoError(`Nao e possivel desativar: a organizacao possui ${abertos} lote(s) nao finalizado(s).`);
        }
      }

      const r = await orgs.atualizarSeVersao(id, atual.versao, dados);
      exigirAtualizacao(r.count, 'Organizacao', id);
      const nova = (await orgs.porId(id))!;
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Organizacao',
        entidadeId: id,
        dadosAntes: atual,
        dadosDepois: nova,
        usuarioResponsavel: ator.usuario,
      });
    });
    return this.obter(id);
  }

  // ---- Contrato (1:1 opcional) --------------------------------------------

  async obterContrato(organizacaoId: string) {
    await this.obter(organizacaoId);
    const c = await this.contratos.porOrganizacao(organizacaoId);
    if (!c) throw new NaoEncontradoError('Contrato da organizacao', organizacaoId);
    return { ...c, vigente: c.dataVencimento.getTime() >= Date.now() };
  }

  async criarContrato(organizacaoId: string, d: DadosContrato, ator: Ator) {
    const venc = this.validarContrato(d);
    return this.prisma.$transaction(async (tx) => {
      const org = await this.organizacoes.com(tx).porId(organizacaoId);
      if (!org) throw new NaoEncontradoError('Organizacao', organizacaoId);
      if (!org.ativo) throw new RegraNegocioError('Organizacao desativada nao pode receber contrato.');
      if (org.contrato) throw new ConflitoError('A organizacao ja possui contrato. Use a renovacao.');

      const c = await this.contratos.com(tx).criar({
        organizacaoId,
        dataVencimento: venc,
        valorMensal: d.valorMensal,
        clausulas: d.clausulas ?? [],
        renovacaoAutomatica: d.renovacaoAutomatica ?? false,
      });
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Contrato',
        entidadeId: c.id,
        dadosDepois: c,
        usuarioResponsavel: ator.usuario,
      });
      return { ...c, vigente: true };
    });
  }

  async renovarContrato(organizacaoId: string, novoVencimento: string, versao: number | undefined, ator: Ator) {
    const venc = parseData(novoVencimento, 'dataVencimento');
    return this.prisma.$transaction(async (tx) => {
      const contratos = this.contratos.com(tx);
      const atual = await contratos.porOrganizacao(organizacaoId);
      if (!atual) throw new NaoEncontradoError('Contrato da organizacao', organizacaoId);
      conferirVersao(versao, atual.versao, 'Contrato', atual.id);

      if (venc.getTime() <= Date.now()) throw new RegraNegocioError('O novo vencimento deve estar no futuro.');
      if (venc.getTime() <= atual.dataVencimento.getTime()) {
        throw new RegraNegocioError('O novo vencimento deve ser posterior ao vencimento atual.');
      }

      const r = await contratos.atualizarSeVersao(atual.id, atual.versao, { dataVencimento: venc });
      exigirAtualizacao(r.count, 'Contrato', atual.id);
      const novo = (await contratos.porOrganizacao(organizacaoId))!;
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Contrato',
        entidadeId: atual.id,
        dadosAntes: atual,
        dadosDepois: novo,
        usuarioResponsavel: ator.usuario,
      });
      return { ...novo, vigente: true };
    });
  }
}
