import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env';
import { Container } from '../../container';
import { Ator } from '../../services/ator';
import { ator } from '../comum';

export class AuthController {
  constructor(private readonly c: Container, private readonly app: FastifyInstance) {}

  private async emitirToken(a: Ator, reply: FastifyReply) {
    const token = await reply.jwtSign({ sub: a.id, usuario: a.usuario, papel: a.papel });
    const dec = this.app.jwt.decode<{ exp: number }>(token);
    return {
      token,
      tipo: 'Bearer',
      expiraEm: dec ? new Date(dec.exp * 1000).toISOString() : null,
      validade: env.jwtExpiresIn,
      usuario: { id: a.id, usuario: a.usuario, papel: a.papel },
    };
  }

  login = async (req: FastifyRequest<{ Body: { usuario: string; senha: string } }>, reply: FastifyReply) => {
    const a = await this.c.auth.autenticar(req.body.usuario, req.body.senha);
    return this.emitirToken(a, reply);
  };

  /** Renovacao: emite novo token (mais 30 min) para quem ainda tem token valido e conta ativa. */
  renovar = async (req: FastifyRequest, reply: FastifyReply) => {
    const perfil = await this.c.auth.perfilAtual(ator(req));
    return this.emitirToken({ id: perfil.id, usuario: perfil.usuario, papel: perfil.papel }, reply);
  };

  eu = async (req: FastifyRequest) => this.c.auth.perfilAtual(ator(req));

  alterarSenha = async (
    req: FastifyRequest<{ Body: { senhaAtual: string; senhaNova: string; versao?: number } }>,
    reply: FastifyReply,
  ) => {
    await this.c.auth.alterarSenha(ator(req), req.body.senhaAtual, req.body.senhaNova, req.body.versao);
    return reply.status(200).send({ mensagem: 'Senha alterada com sucesso.' });
  };
}
