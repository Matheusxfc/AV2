import { FastifyReply, FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { ValidadorCNPJ } from '../../domain/validadores/ValidadorCNPJ';
import { DadosAtualizacaoOrganizacao, DadosContrato, DadosNovaOrganizacao } from '../../services/OrganizacaoService';
import { paginacao } from '../../shared/util';
import { ator, Paginacao } from '../comum';

type IdParams = { Params: { id: string } };

export class OrganizacaoController {
  constructor(private readonly c: Container) {}

  criar = async (req: FastifyRequest<{ Body: DadosNovaOrganizacao }>, reply: FastifyReply) =>
    reply.status(201).send(await this.c.organizacoes.criar(req.body, ator(req)));

  listar = async (req: FastifyRequest<{ Querystring: Paginacao & { ativo?: boolean; cnpj?: string; busca?: string } }>) => {
    const { ativo, cnpj, busca } = req.query;
    return this.c.organizacoes.listar(
      { ativo, busca, cnpj: cnpj ? ValidadorCNPJ.normalizar(cnpj) : undefined },
      paginacao(req.query),
    );
  };

  obter = async (req: FastifyRequest<IdParams>) => this.c.organizacoes.obter(req.params.id);

  atualizar = async (req: FastifyRequest<IdParams & { Body: DadosAtualizacaoOrganizacao }>) =>
    this.c.organizacoes.atualizar(req.params.id, req.body, ator(req));

  // ---- Contrato ----
  obterContrato = async (req: FastifyRequest<IdParams>) => this.c.organizacoes.obterContrato(req.params.id);

  criarContrato = async (req: FastifyRequest<IdParams & { Body: DadosContrato }>, reply: FastifyReply) =>
    reply.status(201).send(await this.c.organizacoes.criarContrato(req.params.id, req.body, ator(req)));

  renovarContrato = async (req: FastifyRequest<IdParams & { Body: { dataVencimento: string; versao?: number } }>) =>
    this.c.organizacoes.renovarContrato(req.params.id, req.body.dataVencimento, req.body.versao, ator(req));
}
