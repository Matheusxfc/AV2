import { FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { paginacao, parseData } from '../../shared/util';
import { Paginacao } from '../comum';

export class JournalController {
  constructor(private readonly c: Container) {}

  listar = async (
    req: FastifyRequest<{
      Querystring: Paginacao & { entidade?: string; entidadeId?: string; usuario?: string; operacao?: string; inicio?: string; fim?: string };
    }>,
  ) => {
    const { entidade, entidadeId, usuario, operacao, inicio, fim } = req.query;
    return this.c.journal.listar(
      {
        entidade,
        entidadeId,
        usuario,
        operacao,
        inicio: inicio ? parseData(inicio, 'inicio') : undefined,
        fim: fim ? parseData(fim, 'fim') : undefined,
      },
      paginacao(req.query),
    );
  };
}
