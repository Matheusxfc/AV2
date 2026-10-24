import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { LoteController } from '../controllers/LoteController';
import { dataStr, eStatusLote, eTipo, eEstado, idParams, paginacaoProps, PAPEIS, protegido, seguranca, uuid, versao } from '../comum';
import { h } from './helpers';

export const equipamentoNovoSchema = {
  type: 'object',
  required: ['tipo', 'marca', 'modelo', 'anoFabricacao', 'estadoFisico', 'pesoQuilogramas'],
  additionalProperties: false,
  properties: {
    tipo: eTipo,
    marca: { type: 'string', minLength: 1, maxLength: 80 },
    modelo: { type: 'string', minLength: 1, maxLength: 80 },
    anoFabricacao: { type: 'integer', minimum: 1970, maximum: 2100 },
    estadoFisico: eEstado,
    pesoQuilogramas: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
  },
};

export const rotasLotes =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new LoteController(c);
    const leitura = protegido(app);
    const escrita = protegido(app, PAPEIS.ALMOXARIFADO);
    const tag = ['Lotes'];

    app.post('/', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Cria lote (opcionalmente ja com equipamentos, em uma transacao). Valida data de entrada.', security: seguranca,
        body: {
          type: 'object', required: ['organizacaoId', 'notaFiscal', 'transportadora'], additionalProperties: false,
          properties: {
            organizacaoId: uuid,
            notaFiscal: { type: 'string', minLength: 1, maxLength: 60 },
            transportadora: { type: 'string', minLength: 1, maxLength: 120 },
            dataEntrada: dataStr,
            observacoes: { type: 'string', maxLength: 1000 },
            equipamentos: { type: 'array', maxItems: 500, items: equipamentoNovoSchema },
          },
        },
      },
    }, h(ctrl.criar));

    app.get('/', {
      ...leitura,
      schema: {
        tags: tag, summary: 'Lista/consulta lotes (filtros: organizacao, status, periodo)', security: seguranca,
        querystring: { type: 'object', properties: { ...paginacaoProps, organizacaoId: uuid, status: eStatusLote, inicio: dataStr, fim: dataStr } },
      },
    }, h(ctrl.listar));

    app.get('/:id', { ...leitura, schema: { tags: tag, summary: 'Detalha lote (com organizacao e equipamentos)', security: seguranca, params: idParams } }, h(ctrl.obter));

    app.post('/:id/equipamentos', {
      ...escrita,
      schema: { tags: tag, summary: 'Adiciona equipamento ao lote (apenas lote RECEBIDO)', security: seguranca, params: idParams, body: equipamentoNovoSchema },
    }, h(ctrl.adicionarEquipamento));

    app.post('/:id/triagem', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Inicia a triagem: lote -> EM_TRIAGEM e equipamentos -> EM_TRIAGEM (atomico)', security: seguranca, params: idParams,
        body: { type: 'object', additionalProperties: false, properties: { versao } },
      },
    }, h(ctrl.iniciarTriagem));

    app.patch('/:id/status', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Avanco manual: TRIAGEM_CONCLUIDA -> ENCAMINHADO -> FINALIZADO', security: seguranca, params: idParams,
        body: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: eStatusLote, versao } },
      },
    }, h(ctrl.avancarStatus));
  };
