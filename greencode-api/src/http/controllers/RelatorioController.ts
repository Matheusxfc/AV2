import { StatusRastreamento } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { parseIntervalo } from '../../shared/util';

type Intervalo = { inicio: string; fim: string };

export class RelatorioController {
  constructor(private readonly c: Container) {}

  porOrganizacao = async (req: FastifyRequest<{ Params: { id: string }; Querystring: Intervalo }>) => {
    const { inicio, fim } = parseIntervalo(req.query.inicio, req.query.fim);
    return this.c.relatorios.porOrganizacao(req.params.id, inicio, fim);
  };

  resumoPorStatus = async () => this.c.relatorios.resumoPorStatus();

  porStatus = async (req: FastifyRequest<{ Params: { status: StatusRastreamento } }>) =>
    this.c.relatorios.porStatus(req.params.status);

  financeiro = async (req: FastifyRequest<{ Querystring: Intervalo }>) => {
    const { inicio, fim } = parseIntervalo(req.query.inicio, req.query.fim);
    return this.c.relatorios.financeiro(inicio, fim);
  };
}
