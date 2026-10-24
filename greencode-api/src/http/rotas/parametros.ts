import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { ParametroController } from '../controllers/ParametroController';
import { PAPEIS, protegido, seguranca } from '../comum';
import { h } from './helpers';

export const rotasParametros =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new ParametroController(c);

    app.get('/', {
      ...protegido(app, PAPEIS.AUDITORIA),
      schema: { tags: ['Parametros'], summary: 'Parametros globais (ADMINISTRADOR, AUDITOR)', security: seguranca },
    }, h(ctrl.obter));

    app.put('/', {
      ...protegido(app, PAPEIS.ADMIN),
      schema: {
        tags: ['Parametros'], summary: 'Atualiza parametros globais (ADMINISTRADOR)', security: seguranca,
        body: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            aliquotaImpostoPadrao: { type: 'number', minimum: 0, maximum: 1 },
            coeficienteDepreciacaoAnual: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    }, h(ctrl.atualizar));
  };
