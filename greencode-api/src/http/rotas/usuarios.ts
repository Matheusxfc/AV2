import { FastifyPluginAsync } from 'fastify';
import { Container } from '../../container';
import { UsuarioController } from '../controllers/UsuarioController';
import { ePapel, idParams, paginacaoProps, PAPEIS, protegido, seguranca, versao } from '../comum';
import { h } from './helpers';

export const rotasUsuarios =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    const ctrl = new UsuarioController(c);
    const base = protegido(app, PAPEIS.ADMIN);

    app.post('/', {
      ...base,
      schema: {
        tags: ['Usuarios'], summary: 'Cria usuario (ADMINISTRADOR)', security: seguranca,
        body: {
          type: 'object', required: ['usuario', 'senha', 'papel'], additionalProperties: false,
          properties: {
            usuario: { type: 'string', pattern: '^[a-zA-Z0-9_.-]{3,40}$', description: '3-40 caracteres: letras, numeros, _ . -' },
            senha: { type: 'string', minLength: 8, maxLength: 72 },
            papel: ePapel,
          },
        },
      },
    }, h(ctrl.criar));

    app.get('/', {
      ...base,
      schema: { tags: ['Usuarios'], summary: 'Lista usuarios (ADMINISTRADOR)', security: seguranca, querystring: { type: 'object', properties: paginacaoProps } },
    }, h(ctrl.listar));

    app.patch('/:id', {
      ...base,
      schema: {
        tags: ['Usuarios'], summary: 'Altera papel e/ou ativo (ADMINISTRADOR)', security: seguranca, params: idParams,
        body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { papel: ePapel, ativo: { type: 'boolean' }, versao } },
      },
    }, h(ctrl.atualizar));
  };
