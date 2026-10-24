import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { NaoAutenticadoError, RegraNegocioError } from '../shared/errors';
import { conferirVersao, exigirAtualizacao } from '../shared/util';
import { JournalRepository } from '../repositories/JournalRepository';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { Ator } from './ator';
import { validarForcaSenha } from './UsuarioService';

export class AuthService {
  /** Hash descartavel: comparamos sempre contra um hash, existindo ou nao o usuario (evita enumeracao por tempo de resposta). */
  private readonly hashFalso = bcrypt.hashSync('senha-falsa-para-igualar-tempo', 10);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly usuarios: UsuarioRepository,
    private readonly journal: JournalRepository,
  ) {}

  async autenticar(usuario: string, senha: string): Promise<Ator> {
    const u = await this.usuarios.porNome(usuario);
    const senhaConfere = await bcrypt.compare(senha, u?.senhaHash ?? this.hashFalso);
    if (!u || !senhaConfere || !u.ativo) {
      // Mensagem unica: nao revela se o usuario existe, esta inativo ou errou a senha.
      throw new NaoAutenticadoError('Usuario ou senha invalidos.');
    }
    await this.usuarios.registrarAcesso(u.id);
    await this.journal.registrar({ operacao: 'LOGIN', entidade: 'Usuario', entidadeId: u.id, usuarioResponsavel: u.usuario });
    return { id: u.id, usuario: u.usuario, papel: u.papel };
  }

  /** Relê o usuario no banco: token de quem foi desativado/rebaixado nao e renovado. */
  async perfilAtual(ator: Ator) {
    const u = await this.usuarios.porId(ator.id);
    if (!u || !u.ativo) throw new NaoAutenticadoError('Usuario inexistente ou desativado.');
    return {
      id: u.id,
      usuario: u.usuario,
      papel: u.papel,
      ativo: u.ativo,
      ultimoAcesso: u.ultimoAcesso,
      versao: u.versao,
    };
  }

  async alterarSenha(ator: Ator, senhaAntiga: string, senhaNova: string, versao?: number): Promise<void> {
    validarForcaSenha(senhaNova);
    await this.prisma.$transaction(async (tx) => {
      const usuarios = this.usuarios.com(tx);
      const u = await usuarios.porId(ator.id);
      if (!u || !u.ativo) throw new NaoAutenticadoError('Usuario inexistente ou desativado.');
      if (!(await bcrypt.compare(senhaAntiga, u.senhaHash))) {
        throw new RegraNegocioError('Senha atual incorreta.');
      }
      conferirVersao(versao, u.versao, 'Usuario', u.id);
      const novoHash = await bcrypt.hash(senhaNova, env.bcryptRounds);
      const r = await usuarios.atualizarSeVersao(u.id, u.versao, { senhaHash: novoHash });
      exigirAtualizacao(r.count, 'Usuario', u.id);
      await this.journal.com(tx).registrar({
        operacao: 'UPDATE',
        entidade: 'Usuario',
        entidadeId: u.id,
        dadosAntes: { usuario: u.usuario },
        dadosDepois: { usuario: u.usuario, senhaAlterada: true },
        usuarioResponsavel: ator.usuario,
      });
    });
  }
}
