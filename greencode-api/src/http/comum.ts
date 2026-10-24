import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  EstadoFisico, PapelUsuario, StatusLote, StatusRastreamento, TipoEquipamento, valores,
} from '../domain/enums';
import { Ator } from '../services/ator';

// ---- Autorizacao ---------------------------------------------------------------
const P = PapelUsuario;
/** Quem pode escrever em cada contexto (leitura: qualquer usuario autenticado, salvo indicacao). */
export const PAPEIS = {
  ADMIN: [P.ADMINISTRADOR],
  CADASTRO: [P.ADMINISTRADOR, P.OPERADOR_CADASTRO],
  ALMOXARIFADO: [P.ADMINISTRADOR, P.GESTOR_ALMOXARIFADO],
  AUDITORIA: [P.ADMINISTRADOR, P.AUDITOR],
  TODOS: [] as PapelUsuario[],
};

/** Opcoes de rota: exige JWT valido e, se informados, um dos papeis. */
export function protegido(app: FastifyInstance, papeis: PapelUsuario[] = []) {
  return {
    onRequest: [app.authenticate],
    preHandler: papeis.length > 0 ? [app.authorize(...papeis)] : [],
  };
}

export function ator(req: FastifyRequest): Ator {
  return { id: req.user.sub, usuario: req.user.usuario, papel: req.user.papel };
}

// ---- Fragmentos de JSON Schema --------------------------------------------------
export const uuid = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
};
export const idParams = { type: 'object', required: ['id'], properties: { id: uuid } };
export const dataStr = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}([T ].*)?$', description: 'AAAA-MM-DD ou ISO 8601' };
export const versao = { type: 'integer', minimum: 1, description: 'Versao atual do registro (bloqueio otimista). Opcional.' };
export const paginacaoProps = {
  pagina: { type: 'integer', minimum: 1, default: 1 },
  limite: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};
export const enumDe = (obj: Record<string, string>) => ({ type: 'string', enum: valores(obj) });

export const eEstado = enumDe(EstadoFisico);
export const eStatusRastreamento = enumDe(StatusRastreamento);
export const eStatusLote = enumDe(StatusLote);
export const eTipo = enumDe(TipoEquipamento);
export const ePapel = enumDe(PapelUsuario);

export const seguranca = [{ bearerAuth: [] }];
export interface Paginacao { pagina?: number; limite?: number }
