import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { RelatorioController } from '../controllers/RelatorioController';
import { dataStr, eStatusRastreamento, idParams, PAPEIS, protegido, seguranca } from '../comum';
import { h } from './helpers';

const intervalo = { type: 'object', required: ['inicio', 'fim'], properties: { inicio: dataStr, fim: dataStr } };

export const rotasRelatorios =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new RelatorioController(c);
    const base = protegido(app, PAPEIS.AUDITORIA);
    const tag = ['Relatorios'];

    app.get('/organizacao/:id', {
      ...base, schema: { tags: tag, summary: 'Relatorio por organizacao e periodo (ADMINISTRADOR, AUDITOR)', security: seguranca, params: idParams, querystring: intervalo },
    }, h(ctrl.porOrganizacao));

    app.get('/status', { ...base, schema: { tags: tag, summary: 'Resumo: quantidade de equipamentos por status', security: seguranca } }, h(ctrl.resumoPorStatus));

    app.get('/status/:status', {
      ...base,
      schema: {
        tags: tag, summary: 'Equipamentos em um status de rastreamento', security: seguranca,
        params: { type: 'object', required: ['status'], properties: { status: eStatusRastreamento } },
      },
    }, h(ctrl.porStatus));

    app.get('/financeiro', {
      ...base, schema: { tags: tag, summary: 'Relatorio financeiro do periodo', security: seguranca, querystring: intervalo },
    }, h(ctrl.financeiro));
  };
