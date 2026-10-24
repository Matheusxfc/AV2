import { PrismaClient } from '@prisma/client';
import { ContratoRepository } from './repositories/ContratoRepository';
import { EquipamentoRepository } from './repositories/EquipamentoRepository';
import { JournalRepository } from './repositories/JournalRepository';
import { LoteRepository } from './repositories/LoteRepository';
import { MovimentacaoRepository } from './repositories/MovimentacaoRepository';
import { OrganizacaoRepository } from './repositories/OrganizacaoRepository';
import { ParametroRepository } from './repositories/ParametroRepository';
import { UsuarioRepository } from './repositories/UsuarioRepository';
import { AuthService } from './services/AuthService';
import { EquipamentoService } from './services/EquipamentoService';
import { JournalService } from './services/JournalService';
import { LoteService } from './services/LoteService';
import { OrganizacaoService } from './services/OrganizacaoService';
import { ParametroService } from './services/ParametroService';
import { RelatorioService } from './services/RelatorioService';
import { UsuarioService } from './services/UsuarioService';

/**
 * Raiz de composicao (injecao de dependencias manual):
 * Controller -> Service -> Repository -> Prisma. Nenhuma camada conhece a de cima.
 */
export function criarContainer(prisma: PrismaClient) {
  // Repositories
  const usuarioRepo = new UsuarioRepository(prisma);
  const organizacaoRepo = new OrganizacaoRepository(prisma);
  const contratoRepo = new ContratoRepository(prisma);
  const loteRepo = new LoteRepository(prisma);
  const equipamentoRepo = new EquipamentoRepository(prisma);
  const movimentacaoRepo = new MovimentacaoRepository(prisma);
  const journalRepo = new JournalRepository(prisma);
  const parametroRepo = new ParametroRepository(prisma);

  // Services
  const parametros = new ParametroService(prisma, parametroRepo, journalRepo);
  return {
    prisma,
    auth: new AuthService(prisma, usuarioRepo, journalRepo),
    usuarios: new UsuarioService(prisma, usuarioRepo, journalRepo),
    parametros,
    organizacoes: new OrganizacaoService(prisma, organizacaoRepo, contratoRepo, loteRepo, journalRepo),
    lotes: new LoteService(prisma, loteRepo, equipamentoRepo, movimentacaoRepo, organizacaoRepo, journalRepo),
    equipamentos: new EquipamentoService(prisma, equipamentoRepo, loteRepo, movimentacaoRepo, journalRepo, parametros),
    relatorios: new RelatorioService(organizacaoRepo, loteRepo, equipamentoRepo, contratoRepo),
    journal: new JournalService(journalRepo),
  };
}

export type Container = ReturnType<typeof criarContainer>;
