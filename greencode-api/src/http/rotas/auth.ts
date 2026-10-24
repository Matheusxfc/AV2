import { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env';
import { Container } from '../../container';
import { AuthController } from '../controllers/AuthController';
import { protegido, seguranca } from '../comum';
import { h } from './helpers';

export const rotasAuth =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new AuthController(c, app);

    app.post('/login', {
      config: { rateLimit: { max: env.loginRateLimitMax, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Login (retorna JWT)',
        body: {
          type: 'object',
          required: ['usuario', 'senha'],
          additionalProperties: false,
          properties: { usuario: { type: 'string', minLength: 1, maxLength: 60 }, senha: { type: 'string', minLength: 1, maxLength: 128 } },
        },
      },
    }, h(ctrl.login));

    app.post('/renovar', {
      ...protegido(app),
      schema: { tags: ['Auth'], summary: 'Renova o token (mais 30 min) enquanto a conta estiver ativa', security: seguranca },
    }, h(ctrl.renovar));

    app.get('/me', {
      ...protegido(app),
      schema: { tags: ['Auth'], summary: 'Perfil do usuario autenticado', security: seguranca },
    }, h(ctrl.eu));

    app.post('/senha', {
      ...protegido(app),
      schema: {
        tags: ['Auth'],
        summary: 'Altera a propria senha',
        security: seguranca,
        body: {
          type: 'object',
          required: ['senhaAtual', 'senhaNova'],
          additionalProperties: false,
          properties: {
            senhaAtual: { type: 'string', minLength: 1, maxLength: 128 },
            senhaNova: { type: 'string', minLength: 8, maxLength: 72 },
            versao: { type: 'integer', minimum: 1 },
          },
        },
      },
    }, h(ctrl.alterarSenha));
  };
