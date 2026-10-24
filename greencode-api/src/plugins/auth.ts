import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { PapelUsuario } from '../domain/enums';
import { NaoAutenticadoError, ProibidoError } from '../shared/errors';

export interface JwtPayload {
  sub: string; // id do usuario
  usuario: string;
  papel: PapelUsuario;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

type Hook = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Hook: valida o JWT do cabecalho Authorization e injeta request.user. */
    authenticate: Hook;
    /** Fabrica de hook: exige que request.user.papel esteja entre os papeis informados. */
    authorize: (...papeis: PapelUsuario[]) => Hook;
  }
}

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.jwtSecret,
    sign: { algorithm: 'HS256', expiresIn: env.jwtExpiresIn },
    verify: { algorithms: ['HS256'] },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new NaoAutenticadoError('Token ausente, invalido ou expirado. Faca login em POST /auth/login.');
    }
  });

  app.decorate('authorize', (...papeis: PapelUsuario[]) => async (req: FastifyRequest) => {
    if (!papeis.includes(req.user.papel)) {
      throw new ProibidoError(`Papel '${req.user.papel}' sem permissao. Necessario: ${papeis.join(' ou ')}.`);
    }
  });
});
