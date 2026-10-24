import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { PapelUsuario } from '../domain/enums';
import { ConflitoError, NaoEncontradoError, RegraNegocioError } from '../shared/errors';
import { Pagina, conferirVersao, exigirAtualizacao, resposta } from '../shared/util';
import { JournalRepository } from '../repositories/JournalRepository';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { Ator } from './ator';

/** Politica minima de senha: 8+ caracteres, com letra e numero. */
export function validarForcaSenha(senha: string): void {
  if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    throw new RegraNegocioError('A senha deve ter pelo menos 8 caracteres, com letras e numeros.');
  }
}

/** Nunca expomos senhaHash. */
export function usuarioPublico(u: {
  id: string; usuario: string; papel: string; ativo: boolean; ultimoAcesso: Date | null; criadoEm: Date; versao: number;
}) {
  return { id: u.id, usuario: u.usuario, papel: u.papel, ativo: u.ativo, ultimoAcesso: u.ultimoAcesso, criadoEm: u.criadoEm, versao: u.versao };
}

export class UsuarioService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly usuarios: UsuarioRepository,
    private readonly journal: JournalRepository,
  ) {}

  async criar(dados: { usuario: string; senha: string; papel: PapelUsuario }, ator: Ator) {
    validarForcaSenha(dados.senha);
    if (await this.usuarios.porNome(dados.usuario)) {
      throw new ConflitoError(`Usuario '${dados.usuario}' ja existe.`);
    }
    const senhaHash = await bcrypt.hash(dados.senha, env.bcryptRounds);
    return this.prisma.$transaction(async (tx) => {
      const criado = await this.usuarios.com(tx).criar({ usuario: dados.usuario, senhaHash, papel: dados.papel });
      await this.journal.com(tx).registrar({
        operacao: 'CREATE',
        entidade: 'Usuario',
        entidadeId: criado.id,
        dadosDepois: { usuario: criado.usuario, papel: criado.papel },
        usuarioResponsavel: ator.usuario,
      });
      return usuarioPublico(criado);
    });
  }

  async listar(p: Pagina) {
    const { dados, total } = await this.usuarios.listar(p.skip, p.take);
    return resposta(dados.map(usuarioPublico), total, p);
  }

  async atualizar(id: string, dados: { papel?: PapelUsuario; ativo?: boolean; versao?: number }, ator: Ator) {
    if (id === ator.id && dados.ativo === false) {
      throw new RegraNegocioError('Voce nao pode desativar a propria conta.');
    }
    if (id === ator.id && dados.papel && dados.papel !== ator.papel) {
      throw new RegraNegocioError('Voce nao pode alterar o proprio papel.');
    }
    return this.prisma.$transaction(async (tx) => {
      const usuarios = this.usuarios.com(tx);
      const atual = await usuarios.porId(id);
      if (!atual) throw new NaoEncontradoError('Usuario', id);
      conferirVersao(dados.versao, atual.versao, 'Usuario', id);

      const r = await usuarios.atualizarSeVersao(id, atual.versao, {
        ...(dados.papel !== undefined ? { papel: dados.papel } : {}),
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      });
      exigirAtualizacao(r.count, 'Usuario', id);

      const novo = (await usuarios.porId(id))!;
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Usuario',
        entidadeId: id,
        dadosAntes: { papel: atual.papel, ativo: atual.ativo },
        dadosDepois: { papel: novo.papel, ativo: novo.ativo },
        usuarioResponsavel: ator.usuario,
      });
      return usuarioPublico(novo);
    });
  }
}
