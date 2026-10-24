import { RouteHandlerMethod } from 'fastify';

/**
 * Os controllers tipam req.body/params/query de forma especifica; a validacao por JSON Schema
 * garante essas formas em tempo de execucao. Este helper so ajusta o tipo para o registro da rota.
 */
export const h = (fn: unknown): RouteHandlerMethod => fn as RouteHandlerMethod;
