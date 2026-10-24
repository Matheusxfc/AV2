import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { EquipamentoController } from '../controllers/EquipamentoController';
import { eEstado, eStatusRastreamento, eTipo, idParams, paginacaoProps, PAPEIS, protegido, seguranca, uuid, versao } from '../comum';
import { h } from './helpers';

export const rotasEquipamentos =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new EquipamentoController(c);
    const leitura = protegido(app);
    const escrita = protegido(app, PAPEIS.ALMOXARIFADO);
    const tag = ['Equipamentos'];

    app.get('/', {
      ...leitura,
      schema: {
        tags: tag, summary: 'Lista equipamentos (filtros: lote, status, tipo, estado, codigo)', security: seguranca,
        querystring: {
          type: 'object',
          properties: { ...paginacaoProps, loteId: uuid, status: eStatusRastreamento, tipo: eTipo, estado: eEstado, codigo: { type: 'string', maxLength: 40 } },
        },
      },
    }, h(ctrl.listar));

    app.get('/:id', { ...leitura, schema: { tags: tag, summary: 'Detalha equipamento', security: seguranca, params: idParams } }, h(ctrl.obter));

    app.get('/:id/rastreio', {
      ...leitura,
      schema: { tags: tag, summary: 'Rastreabilidade completa: historico de movimentacoes + trilha de auditoria', security: seguranca, params: idParams },
    }, h(ctrl.rastrear));

    app.get('/:id/depreciacao', {
      ...leitura,
      schema: {
        tags: tag, summary: 'Valor residual (depreciacao linear com o coeficiente global)', security: seguranca, params: idParams,
        querystring: { type: 'object', required: ['valorOriginal'], properties: { valorOriginal: { type: 'number', minimum: 0 } } },
      },
    }, h(ctrl.depreciacao));

    app.patch('/:id/estado', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Altera estado fisico (queda de 2+ categorias exige justificativa)', security: seguranca, params: idParams,
        body: {
          type: 'object', required: ['novoEstado'], additionalProperties: false,
          properties: { novoEstado: eEstado, justificativa: { type: 'string', maxLength: 1000 }, versao },
        },
      },
    }, h(ctrl.alterarEstado));

    app.patch('/:id/status', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Altera status de rastreamento (maquina de estados + movimentacao, em transacao)', security: seguranca, params: idParams,
        body: {
          type: 'object', required: ['novoStatus'], additionalProperties: false,
          properties: { novoStatus: eStatusRastreamento, justificativa: { type: 'string', maxLength: 1000 }, versao },
        },
      },
    }, h(ctrl.alterarStatus));

    app.post('/:id/movimentacoes', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Registra movimentacao fisica', security: seguranca, params: idParams,
        body: {
          type: 'object', required: ['destino'], additionalProperties: false,
          properties: { destino: { type: 'string', minLength: 1, maxLength: 200 }, observacao: { type: 'string', maxLength: 1000 } },
        },
      },
    }, h(ctrl.movimentar));
  };
