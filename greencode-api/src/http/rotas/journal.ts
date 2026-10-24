import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { JournalController } from '../controllers/JournalController';
import { dataStr, paginacaoProps, PAPEIS, protegido, seguranca } from '../comum';
import { h } from './helpers';

export const rotasJournal =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new JournalController(c);
    app.get('/', {
      ...protegido(app, PAPEIS.AUDITORIA),
      schema: {
        tags: ['Journal'], summary: 'Journal de auditoria imutavel (ADMINISTRADOR, AUDITOR)', security: seguranca,
        querystring: {
          type: 'object',
          properties: {
            ...paginacaoProps,
            entidade: { type: 'string', maxLength: 40 },
            entidadeId: { type: 'string', maxLength: 40 },
            usuario: { type: 'string', maxLength: 60 },
            operacao: { type: 'string', maxLength: 20 },
            inicio: dataStr,
            fim: dataStr,
          },
        },
      },
    }, h(ctrl.listar));
  };
