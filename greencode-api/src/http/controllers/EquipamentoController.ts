import { EstadoFisico, StatusRastreamento, TipoEquipamento } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { paginacao } from '../../shared/util';
import { ator, Paginacao } from '../comum';

type IdParams = { Params: { id: string } };

export class EquipamentoController {
  constructor(private readonly c: Container) {}

  listar = async (
    req: FastifyRequest<{
      Querystring: Paginacao & { loteId?: string; status?: StatusRastreamento; tipo?: TipoEquipamento; estado?: EstadoFisico; codigo?: string };
    }>,
  ) => {
    const { loteId, status, tipo, estado, codigo } = req.query;
    return this.c.equipamentos.listar({ loteId, status, tipo, estado, codigo }, paginacao(req.query));
  };

  obter = async (req: FastifyRequest<IdParams>) => this.c.equipamentos.obter(req.params.id);

  rastrear = async (req: FastifyRequest<IdParams>) => this.c.equipamentos.rastrear(req.params.id);

  alterarEstado = async (
    req: FastifyRequest<IdParams & { Body: { novoEstado: EstadoFisico; justificativa?: string; versao?: number } }>,
  ) => this.c.equipamentos.alterarEstado(req.params.id, req.body, ator(req));

  alterarStatus = async (
    req: FastifyRequest<IdParams & { Body: { novoStatus: StatusRastreamento; justificativa?: string; versao?: number } }>,
  ) => this.c.equipamentos.alterarStatus(req.params.id, req.body, ator(req));

  movimentar = async (req: FastifyRequest<IdParams & { Body: { destino: string; observacao?: string } }>, reply: FastifyReply) =>
    reply.status(201).send(await this.c.equipamentos.registrarMovimentacao(req.params.id, req.body, ator(req)));

  depreciacao = async (req: FastifyRequest<IdParams & { Querystring: { valorOriginal: number } }>) =>
    this.c.equipamentos.depreciacao(req.params.id, req.query.valorOriginal);
}
