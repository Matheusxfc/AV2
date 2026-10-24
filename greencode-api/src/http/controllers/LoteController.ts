import { StatusLote } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { DadosNovoEquipamento } from '../../repositories/EquipamentoRepository';
import { DadosNovoLote } from '../../services/LoteService';
import { paginacao, parseData } from '../../shared/util';
import { ator, Paginacao } from '../comum';

type IdParams = { Params: { id: string } };

export class LoteController {
  constructor(private readonly c: Container) {}

  criar = async (req: FastifyRequest<{ Body: DadosNovoLote }>, reply: FastifyReply) =>
    reply.status(201).send(await this.c.lotes.criar(req.body, ator(req)));

  listar = async (
    req: FastifyRequest<{ Querystring: Paginacao & { organizacaoId?: string; status?: StatusLote; inicio?: string; fim?: string } }>,
  ) => {
    const { organizacaoId, status, inicio, fim } = req.query;
    return this.c.lotes.listar(
      {
        organizacaoId,
        status,
        inicio: inicio ? parseData(inicio, 'inicio') : undefined,
        fim: fim ? parseData(fim, 'fim') : undefined,
      },
      paginacao(req.query),
    );
  };

  obter = async (req: FastifyRequest<IdParams>) => this.c.lotes.obter(req.params.id);

  adicionarEquipamento = async (req: FastifyRequest<IdParams & { Body: DadosNovoEquipamento }>, reply: FastifyReply) =>
    reply.status(201).send(await this.c.lotes.adicionarEquipamento(req.params.id, req.body, ator(req)));

  iniciarTriagem = async (req: FastifyRequest<IdParams & { Body?: { versao?: number } }>) =>
    this.c.lotes.iniciarTriagem(req.params.id, req.body?.versao, ator(req));

  avancarStatus = async (req: FastifyRequest<IdParams & { Body: { status: StatusLote; versao?: number } }>) =>
    this.c.lotes.avancarStatus(req.params.id, req.body.status, req.body.versao, ator(req));
}
