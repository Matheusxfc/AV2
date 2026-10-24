import { Prisma } from '@prisma/client';
import { RegraNegocioError, VersaoConflitoError } from './errors';

export interface Pagina {
  pagina: number;
  limite: number;
  skip: number;
  take: number;
}

export function paginacao(q: { pagina?: number; limite?: number }): Pagina {
  const pagina = Math.max(1, q.pagina ?? 1);
  const limite = Math.min(100, Math.max(1, q.limite ?? 20));
  return { pagina, limite, skip: (pagina - 1) * limite, take: limite };
}

export function resposta<T>(dados: T[], total: number, p: Pagina) {
  return { dados, pagina: p.pagina, limite: p.limite, total, totalPaginas: Math.ceil(total / p.limite) };
}

/** Garante que o UPDATE condicionado a "versao" afetou exatamente 1 linha (bloqueio otimista). */
export function exigirAtualizacao(count: number, entidade: string, id: string): void {
  if (count !== 1) throw new VersaoConflitoError(entidade, id);
}

/** Se o cliente informou "versao", ela precisa bater com a versao atual do registro. */
export function conferirVersao(informada: number | undefined, atual: number, entidade: string, id: string): void {
  if (informada !== undefined && informada !== atual) throw new VersaoConflitoError(entidade, id);
}

/** Converte Date/Decimal etc. em JSON puro (para gravar no journal). */
export function paraJson(valor: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valor ?? null)) as Prisma.InputJsonValue;
}

/** Aceita "AAAA-MM-DD" ou ISO completo; lanca RegraNegocioError se invalida. */
export function parseData(valor: string, campo: string): Date {
  const d = new Date(valor);
  if (isNaN(d.getTime())) throw new RegraNegocioError(`${campo} invalida: '${valor}'.`);
  return d;
}

export function num(valor: Prisma.Decimal | number | string | null | undefined): number {
  return valor === null || valor === undefined ? 0 : Number(valor);
}

/** Intervalo [inicio, fim]; quando "fim" vem como AAAA-MM-DD, inclui o dia inteiro (ate 23:59:59.999 UTC). */
export function parseIntervalo(inicio: string, fim: string): { inicio: Date; fim: Date } {
  const i = parseData(inicio, 'inicio');
  let f = parseData(fim, 'fim');
  if (/^\d{4}-\d{2}-\d{2}$/.test(fim)) f = new Date(f.getTime() + 86_400_000 - 1);
  if (i.getTime() > f.getTime()) throw new RegraNegocioError('O parametro "inicio" deve ser anterior ou igual a "fim".');
  return { inicio: i, fim: f };
}
