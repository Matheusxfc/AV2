/**
 * Seed do greencode (ambiente de desenvolvimento).
 *   - Usuarios: um por papel (senhas de DEV, trocar em qualquer ambiente real).
 *   - Dados de negocio representativos: organizacoes (com/sem contrato, contrato a vencer),
 *     lotes em varios status, equipamentos em varios estados fisicos e status de rastreamento,
 *     movimentacoes coerentes com a maquina de estados e entradas de journal.
 * Idempotente: se ja houver organizacoes, os dados de demonstracao nao sao recriados.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, EstadoFisico, StatusLote, StatusRastreamento, TipoEquipamento, PapelUsuario } from '@prisma/client';
import { gerarCodigoBarras } from '../src/domain/regras';
import { ValidadorCNPJ } from '../src/domain/validadores/ValidadorCNPJ';

const prisma = new PrismaClient();
const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);
const diasAFrente = (n: number) => new Date(Date.now() + n * 86_400_000);

async function usuarios() {
  const adminUsuario = process.env.ADMIN_USUARIO ?? 'admin';
  const adminSenha = process.env.ADMIN_SENHA ?? 'Admin@12345';
  const lista: { usuario: string; senha: string; papel: PapelUsuario }[] = [
    { usuario: adminUsuario, senha: adminSenha, papel: 'ADMINISTRADOR' },
    { usuario: 'operador', senha: 'Operador@123', papel: 'OPERADOR_CADASTRO' },
    { usuario: 'almoxarife', senha: 'Almox@12345', papel: 'GESTOR_ALMOXARIFADO' },
    { usuario: 'auditor', senha: 'Auditor@123', papel: 'AUDITOR' },
  ];
  for (const u of lista) {
    const existente = await prisma.usuario.findUnique({ where: { usuario: u.usuario } });
    if (existente) continue;
    await prisma.usuario.create({ data: { usuario: u.usuario, senhaHash: await bcrypt.hash(u.senha, rounds), papel: u.papel } });
    console.log(`  usuario criado: ${u.usuario} (${u.papel})`);
  }
  return adminUsuario;
}

// Trajetorias validas da maquina de estados (do inicio ate o status final desejado).
const TRAJETO: Record<string, StatusRastreamento[]> = {
  AGUARDANDO_TRIAGEM: ['AGUARDANDO_TRIAGEM'],
  EM_TRIAGEM: ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM'],
  AGUARDANDO_DESMONTE: ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE'],
  EM_DESMONTE: ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE'],
  PECAS_REAPROVEITADAS: ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE', 'PECAS_REAPROVEITADAS'],
};

interface EqSeed {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  ano: number;
  estado: EstadoFisico;
  peso: number;
  status: keyof typeof TRAJETO;
}

async function criarLote(
  organizacaoId: string,
  razao: string,
  nf: string,
  transportadora: string,
  dias: number,
  status: StatusLote,
  equipamentos: EqSeed[],
  responsavel: string,
) {
  const lote = await prisma.lote.create({
    data: { organizacaoId, notaFiscal: nf, transportadora, dataEntrada: diasAtras(dias), statusProcessamento: status },
  });
  let pos = 1;
  for (const e of equipamentos) {
    const prov = await prisma.equipamento.create({
      data: {
        codigoBarrasInterno: `PENDENTE-${lote.id}-${pos}`,
        tipo: e.tipo, marca: e.marca, modelo: e.modelo, anoFabricacao: e.ano, estadoFisico: e.estado,
        pesoQuilogramas: e.peso, loteId: lote.id, posicaoNoLote: pos, statusRastreamento: e.status,
      },
    });
    const eq = await prisma.equipamento.update({
      where: { id: prov.id },
      data: { codigoBarrasInterno: gerarCodigoBarras(e.tipo, prov.sequencia) },
    });
    pos++;

    const trajeto = TRAJETO[e.status];
    await prisma.movimentacao.create({
      data: { equipamentoId: eq.id, origem: `ORGANIZACAO: ${razao}`, destino: 'RECEBIMENTO (AGUARDANDO_TRIAGEM)', responsavel, observacao: `Lote ${nf}`, dataHora: diasAtras(dias) },
    });
    for (let i = 1; i < trajeto.length; i++) {
      await prisma.movimentacao.create({
        data: { equipamentoId: eq.id, origem: trajeto[i - 1], destino: trajeto[i], responsavel, observacao: 'seed', dataHora: diasAtras(Math.max(0, dias - i)) },
      });
    }
  }
  await prisma.journalTransacao.create({
    data: { operacao: 'CREATE', entidade: 'Lote', entidadeId: lote.id, dadosDepois: { notaFiscal: nf, status, equipamentos: equipamentos.length }, usuarioResponsavel: responsavel },
  });
  return lote;
}

async function demo(responsavel: string) {
  if ((await prisma.organizacao.count()) > 0) {
    console.log('  organizacoes ja existem: dados de demonstracao ignorados.');
    return;
  }

  // CNPJs validos (digitos verificadores calculados pelo ValidadorCNPJ).
  const cnpjA = ValidadorCNPJ.completar('112223330001');
  const cnpjB = ValidadorCNPJ.completar('457231740001');
  const cnpjC = ValidadorCNPJ.completar('334455660001');

  const orgA = await prisma.organizacao.create({
    data: {
      razaoSocial: 'Banco Alfa S.A.', cnpj: cnpjA, enderecoCompleto: 'Av. Paulista, 1000 - Sao Paulo/SP', email: 'ti@bancoalfa.example',
      contrato: { create: { dataVencimento: diasAFrente(365), valorMensal: 8500, renovacaoAutomatica: true, clausulas: ['Coleta quinzenal', 'Certificado de destinacao', 'Rastreabilidade por equipamento'] } },
    },
  });
  const orgB = await prisma.organizacao.create({
    data: {
      razaoSocial: 'Hospital Municipal Central', cnpj: cnpjB, enderecoCompleto: 'Rua da Saude, 50 - Sao Jose dos Campos/SP', email: 'infra@hmc.example',
      // contrato A VENCER em 20 dias (cenario de renovacao)
      contrato: { create: { dataVencimento: diasAFrente(20), valorMensal: 4200.5, clausulas: ['Coleta mensal'] } },
    },
  });
  const orgC = await prisma.organizacao.create({
    data: { razaoSocial: 'Universidade Publica Federal', cnpj: cnpjC, enderecoCompleto: 'Campus Universitario, s/n', email: 'logistica@upf.example' }, // SEM contrato
  });
  for (const o of [orgA, orgB, orgC]) {
    await prisma.journalTransacao.create({ data: { operacao: 'CREATE', entidade: 'Organizacao', entidadeId: o.id, dadosDepois: { razaoSocial: o.razaoSocial }, usuarioResponsavel: responsavel } });
  }

  // L1: triagem concluida (nenhum equipamento aguardando/em triagem)
  await criarLote(orgA.id, orgA.razaoSocial, 'NF-1001', 'TransRapida', 40, 'TRIAGEM_CONCLUIDA', [
    { tipo: 'COMPUTADOR_MESA', marca: 'Dell', modelo: 'OptiPlex 3080', ano: 2019, estado: 'USADO_MODERADO', peso: 7.8, status: 'EM_DESMONTE' },
    { tipo: 'NOTEBOOK', marca: 'Lenovo', modelo: 'ThinkPad E14', ano: 2020, estado: 'BOM_ESTADO', peso: 1.8, status: 'AGUARDANDO_DESMONTE' },
    { tipo: 'MONITOR', marca: 'LG', modelo: '24MK430H', ano: 2018, estado: 'DANIFICADO_LEVE', peso: 3.4, status: 'PECAS_REAPROVEITADAS' },
  ], responsavel);

  // L2: recem-recebido (RECEBIDO), todos aguardando triagem
  await criarLote(orgB.id, orgB.razaoSocial, 'NF-2001', 'LogHospitalar', 3, 'RECEBIDO', [
    { tipo: 'SERVIDOR', marca: 'HP', modelo: 'ProLiant DL360', ano: 2016, estado: 'USADO_LEVE', peso: 14.2, status: 'AGUARDANDO_TRIAGEM' },
    { tipo: 'IMPRESSORA', marca: 'Epson', modelo: 'L3150', ano: 2021, estado: 'DANIFICADO_GRAVE', peso: 3.9, status: 'AGUARDANDO_TRIAGEM' },
  ], responsavel);

  // L3: em triagem (mistura de EM_TRIAGEM e AGUARDANDO_DESMONTE)
  await criarLote(orgA.id, orgA.razaoSocial, 'NF-1002', 'TransRapida', 5, 'EM_TRIAGEM', [
    { tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'Latitude 5400', ano: 2019, estado: 'INSERVIVEL', peso: 1.9, status: 'EM_TRIAGEM' },
    { tipo: 'ROTEADOR', marca: 'Cisco', modelo: 'RV340', ano: 2017, estado: 'USADO_LEVE', peso: 1.1, status: 'AGUARDANDO_DESMONTE' },
    { tipo: 'FONTE_ALIMENTACAO', marca: 'Corsair', modelo: 'CV550', ano: 2020, estado: 'NOVO', peso: 1.4, status: 'EM_TRIAGEM' },
  ], responsavel);

  await prisma.parametro.upsert({ where: { chave: 'coeficienteDepreciacaoAnual' }, create: { chave: 'coeficienteDepreciacaoAnual', valor: 0.2 }, update: {} });
  await prisma.parametro.upsert({ where: { chave: 'aliquotaImpostoPadrao' }, create: { chave: 'aliquotaImpostoPadrao', valor: 0 }, update: {} });

  console.log('  dados de demonstracao criados: 3 organizacoes, 3 lotes, 8 equipamentos.');
}

async function main() {
  console.log('Seed greencode...');
  const admin = await usuarios();
  await demo(admin);
  console.log('Seed concluido.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
