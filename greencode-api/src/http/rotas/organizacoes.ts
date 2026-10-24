import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { OrganizacaoController } from '../controllers/OrganizacaoController';
import { dataStr, idParams, paginacaoProps, PAPEIS, protegido, seguranca, versao } from '../comum';
import { h } from './helpers';

const contratoProps = {
  dataVencimento: dataStr,
  valorMensal: { type: 'number', minimum: 0 },
  clausulas: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 500 }, maxItems: 100 },
  renovacaoAutomatica: { type: 'boolean' },
};

export const rotasOrganizacoes =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new OrganizacaoController(c);
    const leitura = protegido(app);
    const escrita = protegido(app, PAPEIS.CADASTRO);
    const tag = ['Organizacoes'];

    app.post('/', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Cadastra organizacao (valida CNPJ; contrato opcional na mesma transacao)', security: seguranca,
        body: {
          type: 'object', required: ['razaoSocial', 'cnpj'], additionalProperties: false,
          properties: {
            razaoSocial: { type: 'string', minLength: 2, maxLength: 200 },
            cnpj: { type: 'string', minLength: 14, maxLength: 18, description: 'Com ou sem mascara' },
            inscricaoEstadual: { type: 'string', maxLength: 30 },
            enderecoCompleto: { type: 'string', maxLength: 300 },
            telefone: { type: 'string', maxLength: 30 },
            email: { type: 'string', maxLength: 150, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
            contrato: { type: 'object', required: ['dataVencimento', 'valorMensal'], additionalProperties: false, properties: contratoProps },
          },
        },
      },
    }, h(ctrl.criar));

    app.get('/', {
      ...leitura,
      schema: {
        tags: tag, summary: 'Lista organizacoes (paginado)', security: seguranca,
        querystring: {
          type: 'object',
          properties: { ...paginacaoProps, ativo: { type: 'boolean' }, cnpj: { type: 'string', maxLength: 18 }, busca: { type: 'string', maxLength: 100 } },
        },
      },
    }, h(ctrl.listar));

    app.get('/:id', { ...leitura, schema: { tags: tag, summary: 'Detalha organizacao (com contrato)', security: seguranca, params: idParams } }, h(ctrl.obter));

    app.patch('/:id', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Atualiza dados/ativo da organizacao (nao permite desativar com lotes abertos)', security: seguranca, params: idParams,
        body: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            razaoSocial: { type: 'string', minLength: 2, maxLength: 200 },
            inscricaoEstadual: { type: 'string', maxLength: 30 },
            enderecoCompleto: { type: 'string', maxLength: 300 },
            telefone: { type: 'string', maxLength: 30 },
            email: { type: 'string', maxLength: 150, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
            ativo: { type: 'boolean' },
            versao,
          },
        },
      },
    }, h(ctrl.atualizar));

    // ---- Contrato (1:1 opcional) ----
    app.get('/:id/contrato', { ...leitura, schema: { tags: tag, summary: 'Contrato da organizacao', security: seguranca, params: idParams } }, h(ctrl.obterContrato));

    app.post('/:id/contrato', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Cria o contrato da organizacao (409 se ja existir)', security: seguranca, params: idParams,
        body: { type: 'object', required: ['dataVencimento', 'valorMensal'], additionalProperties: false, properties: contratoProps },
      },
    }, h(ctrl.criarContrato));

    app.patch('/:id/contrato/renovar', {
      ...escrita,
      schema: {
        tags: tag, summary: 'Renova contrato (novo vencimento deve ser posterior ao atual)', security: seguranca, params: idParams,
        body: { type: 'object', required: ['dataVencimento'], additionalProperties: false, properties: { dataVencimento: dataStr, versao } },
      },
    }, h(ctrl.renovarContrato));
  };
