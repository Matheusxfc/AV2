import { FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { ator } from '../comum';

export class ParametroController {
  constructor(private readonly c: Container) {}

  obter = async () => this.c.parametros.obterTodos();

  atualizar = async (req: FastifyRequest<{ Body: { aliquotaImpostoPadrao?: number; coeficienteDepreciacaoAnual?: number } }>) =>
    this.c.parametros.atualizar(req.body, ator(req));
}
