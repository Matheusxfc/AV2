import { PrismaClient } from '@prisma/client';
import { RegraNegocioError } from '../shared/errors';
import { JournalRepository } from '../repositories/JournalRepository';
import { ParametroRepository } from '../repositories/ParametroRepository';
import { Ator } from './ator';

/** Parametros globais (papel ADMINISTRADOR no enunciado da Atividade 1). */
export const PARAMETROS_PADRAO = {
  aliquotaImpostoPadrao: 0,
  coeficienteDepreciacaoAnual: 0.2,
} as const;

export type NomeParametro = keyof typeof PARAMETROS_PADRAO;

export class ParametroService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parametros: ParametroRepository,
    private readonly journal: JournalRepository,
  ) {}

  async obterTodos(): Promise<Record<NomeParametro, number>> {
    const salvos = await this.parametros.listar();
    const resultado: Record<string, number> = { ...PARAMETROS_PADRAO };
    for (const p of salvos) {
      if (p.chave in PARAMETROS_PADRAO && typeof p.valor === 'number') resultado[p.chave] = p.valor;
    }
    return resultado as Record<NomeParametro, number>;
  }

  async obter(nome: NomeParametro): Promise<number> {
    return (await this.obterTodos())[nome];
  }

  async atualizar(novos: Partial<Record<NomeParametro, number>>, ator: Ator) {
    const antes = await this.obterTodos();
    const entradas = Object.entries(novos).filter(([, v]) => v !== undefined) as [NomeParametro, number][];
    if (entradas.length === 0) throw new RegraNegocioError('Informe ao menos um parametro.');
    for (const [nome, valor] of entradas) {
      if (!(nome in PARAMETROS_PADRAO)) throw new RegraNegocioError(`Parametro desconhecido: ${nome}`);
      if (valor < 0 || valor > 1) throw new RegraNegocioError(`${nome} deve estar entre 0 e 1.`);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [nome, valor] of entradas) await this.parametros.com(tx).salvar(nome, valor);
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Parametro',
        dadosAntes: antes,
        dadosDepois: { ...antes, ...Object.fromEntries(entradas) },
        usuarioResponsavel: ator.usuario,
      });
    });
    return this.obterTodos();
  }
}
