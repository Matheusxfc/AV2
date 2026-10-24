import { Prisma } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { AppError } from '../shared/errors';

/** Formato unico de erro: { statusCode, erro, mensagem, detalhes? } */
export function registrarErros(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    const e = err as any;

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ statusCode: err.statusCode, erro: err.code, mensagem: err.message, detalhes: err.details });
    }

    // Validacao por JSON Schema (Fastify/Ajv)
    if (e.validation) {
      return reply.status(400).send({
        statusCode: 400,
        erro: 'VALIDACAO_FALHOU',
        mensagem: 'Requisicao invalida.',
        detalhes: (e.validation as any[]).map((v) => ({
          campo: v.instancePath ? String(v.instancePath).replace(/^\//, '').replace(/\//g, '.') : v.params?.missingProperty ?? e.validationContext,
          mensagem: v.message,
        })),
      });
    }

    // Erros conhecidos do Prisma/PostgreSQL
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      switch (err.code) {
        case 'P2002': {
          const alvo = Array.isArray(err.meta?.target) ? (err.meta?.target as string[]).join(', ') : String(err.meta?.target ?? '');
          return reply.status(409).send({ statusCode: 409, erro: 'CONFLITO', mensagem: `Registro duplicado (restricao de unicidade${alvo ? `: ${alvo}` : ''}).` });
        }
        case 'P2025':
          return reply.status(404).send({ statusCode: 404, erro: 'NAO_ENCONTRADO', mensagem: 'Registro nao encontrado.' });
        case 'P2003':
          return reply.status(409).send({ statusCode: 409, erro: 'CONFLITO', mensagem: 'Operacao viola integridade referencial (existem registros relacionados).' });
        case 'P2034':
          return reply.status(409).send({ statusCode: 409, erro: 'CONFLITO', mensagem: 'Conflito de concorrencia na transacao. Tente novamente.' });
      }
    }

    // Erros HTTP "esperados" (ex.: rate limit 429, payload grande 413, JSON malformado 400)
    if (typeof e.statusCode === 'number' && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ statusCode: e.statusCode, erro: e.code ?? 'ERRO_REQUISICAO', mensagem: e.message });
    }

    // Qualquer outra coisa: loga o detalhe, mas NAO vaza para o cliente.
    req.log.error({ err }, 'Erro nao tratado');
    return reply.status(500).send({ statusCode: 500, erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  });
}
