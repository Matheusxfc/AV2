import { FastifyReply, FastifyRequest } from 'fastify';
import { Container } from '../../container';
import { PapelUsuario } from '../../domain/enums';
import { paginacao } from '../../shared/util';
import { ator, Paginacao } from '../comum';

export class UsuarioController {
  constructor(private readonly c: Container) {}

  criar = async (req: FastifyRequest<{ Body: { usuario: string; senha: string; papel: PapelUsuario } }>, reply: FastifyReply) => {
    const criado = await this.c.usuarios.criar(req.body, ator(req));
    return reply.status(201).send(criado);
  };

  listar = async (req: FastifyRequest<{ Querystring: Paginacao }>) => this.c.usuarios.listar(paginacao(req.query));

  atualizar = async (
    req: FastifyRequest<{ Params: { id: string }; Body: { papel?: PapelUsuario; ativo?: boolean; versao?: number } }>,
  ) => this.c.usuarios.atualizar(req.params.id, req.body, ator(req));
}
